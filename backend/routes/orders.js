// backend/routes/orders.js
const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Product = require('../models/Product');
const { protect, adminOnly } = require('../middleware/auth');
const { notifyNewOrder, notifyOrderStatusUpdate, notifyLowStock, notifyPaymentProof } = require('../utils/notifications');
const crypto = require('crypto');
const QRCode = require('qrcode');
const ShippingToken = require('../models/ShippingToken');

// Place order (public or authenticated)
router.post('/', async (req, res) => {
  try {
    const { items, shippingAddress, paymentMethod, paymentId, razorpayOrderId, notes, guestInfo, isStorePickup, paymentScreenshot } = req.body;
    if (!items || !items.length) return res.status(400).json({ success: false, message: 'No items in order' });
    if (!shippingAddress) return res.status(400).json({ success: false, message: 'Shipping address required' });

    // Validate and calculate totals
    let subtotal = 0;
    let totalWeight = 0;
    const orderItems = [];
    for (const item of items) {
      const product = await Product.findById(item.productId);
      if (!product || !product.active) return res.status(400).json({ success: false, message: `Product not found: ${item.productId}` });
      
      let finalPrice = product.price;
      let variantStock = product.stock;
      let variantColor = item.color;
      let variantSize = item.size;
      let finalWeight = product.weight || 0;

      const isBulk = item.variationId && item.variationId.startsWith('bulk_');
      const bulkQty = isBulk ? parseInt(item.variationId.split('_')[1]) : 1;

      let baseVariant = null;
      if (product.variations && product.variations.length > 0) {
        if (!isBulk && item.variationId) {
          baseVariant = product.variations.id(item.variationId);
        } else if (isBulk && item.color) {
          baseVariant = product.variations.find(v => v.color === item.color);
        }
      }

      if (baseVariant) {
        if (!isBulk) finalPrice = baseVariant.price;
        variantStock = baseVariant.stock;
        variantColor = baseVariant.color;
        if (!isBulk) variantSize = baseVariant.size; // Keep bulk size if it's bulk
        if (baseVariant.weight > 0) finalWeight = baseVariant.weight;
      }

      if (isBulk && !isNaN(bulkQty)) {
        let bulkPriceTier = null;
        if (baseVariant && baseVariant.bulkPrices && baseVariant.bulkPrices.length > 0) {
          bulkPriceTier = baseVariant.bulkPrices.find(t => t.quantity === bulkQty);
        }
        if (!bulkPriceTier && product.bulkPrices && product.bulkPrices.length > 0) {
          bulkPriceTier = product.bulkPrices.find(t => t.quantity === bulkQty);
        }

        if (bulkPriceTier) {
          finalPrice = bulkPriceTier.price / bulkQty; // Unpack price to single piece price
        } else if (item.price !== undefined) {
          finalPrice = item.price / bulkQty; // Trust frontend price if tier not found, but unpack it
        }
        item.quantity = item.quantity * bulkQty; // Unpack quantity
      }

      let actualDeductionQty = item.quantity;
      // Since item.quantity is already multiplied by bulkQty, actualDeductionQty is just the updated quantity


      if (variantStock !== undefined && variantStock < actualDeductionQty) {
        return res.status(400).json({ success: false, message: `Only ${variantStock} units left for ${product.name}` });
      }

      subtotal += finalPrice * item.quantity;
      totalWeight += finalWeight * item.quantity;

      let orderItemName = product.name;
      if (variantColor || variantSize) {
        let vars = [];
        if (variantColor) vars.push(variantColor);
        if (variantSize) vars.push(variantSize);
        orderItemName += ` (${vars.join(' - ')})`;
      }

      orderItems.push({
        product: product._id, 
        variationId: item.variationId,
        color: variantColor,
        size: variantSize,
        sku: product.sku || '',
        name: orderItemName,
        image: product.images[0]?.url || '', 
        price: finalPrice, 
        quantity: item.quantity
      });
      
      // Deduct stock and check for low stock
      if (baseVariant) {
         await Product.updateOne(
           { _id: product._id, "variations._id": baseVariant._id },
           { $inc: { "variations.$.stock": -actualDeductionQty, stock: -actualDeductionQty } }
         );
         // Check variant stock
         const updatedProduct = await Product.findById(product._id);
         const updatedVariant = updatedProduct.variations.id(baseVariant._id);
         if (updatedVariant && updatedVariant.stock <= 5) {
           notifyLowStock(updatedProduct, updatedVariant).catch(e => console.error(e));
         }
      } else {
         const updatedProduct = await Product.findByIdAndUpdate(
           product._id, 
           { $inc: { stock: -actualDeductionQty } },
           { new: true }
         );
         if (updatedProduct && updatedProduct.stock <= 5) {
           notifyLowStock(updatedProduct).catch(e => console.error(e));
         }
      }
    }

    if (totalWeight === 0 && orderItems.length > 0) totalWeight = 1;
    
    // City-based shipping calculation
    const BRANCH_CITIES = [
      'Kolkata', 'Bengaluru', 'Delhi', 'Mumbai', 'Ahmedabad', 'Amritsar', 'Bhagalpur', 'Bhopal', 'Bhubaneswar',
      'Chennai', 'Coimbatore', 'Cuttack', 'Guwahati', 'Indore', 'Jabalpur', 'Jaipur', 'Jammu',
      'Jodhpur', 'Kanpur', 'Ludhiana', 'Nashik', 'Patna', 'Pune', 'Raigarh', 'Ranchi', 'Raipur',
      'Salem', 'Siliguri', 'Surat', 'Varanasi', 'Ujjain', 'Dewas', 'Kalyan'
    ];
    const isBranch = BRANCH_CITIES.some(c => c.toLowerCase() === shippingAddress.city?.trim().toLowerCase());
    const rate = isBranch ? 75 : 100;
    
    // Use Store Pickup if selected (always 0 shipping cost now)
    const shippingCost = 0;
    
    const total = subtotal + shippingCost;

    const orderData = {
      items: orderItems, shippingAddress, subtotal, shippingCost, total,
      paymentMethod: paymentMethod || 'upi', notes, isStorePickup: !!isStorePickup,
      statusHistory: []
    };

    // Set order status based on payment proof
    if (paymentScreenshot) {
      orderData.paymentScreenshot = paymentScreenshot;
      orderData.status = 'payment_pending';
      orderData.statusHistory.push({ status: 'payment_pending', note: 'Customer submitted payment screenshot with order' });
    } else {
      orderData.status = 'placed';
      orderData.statusHistory.push({ status: 'placed', note: 'Order placed directly' });
    }

    if (paymentId) { orderData.paymentId = paymentId; orderData.paymentStatus = 'paid'; }
    if (razorpayOrderId) orderData.razorpayOrderId = razorpayOrderId;
    if (req.headers.authorization) {
      try {
        const jwt = require('jsonwebtoken');
        const token = req.headers.authorization.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        orderData.user = decoded.id;
      } catch {}
    }
    if (!orderData.user && guestInfo) orderData.guestInfo = guestInfo;

    const order = await Order.create(orderData);
    
    // Trigger Notifications (Admin) asynchronously (don't delay the response)
    notifyNewOrder(order).catch(err => console.error('Notification error:', err));

    res.status(201).json({ success: true, order });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Submit payment proof and notify
router.put('/:id/payment-proof', async (req, res) => {
  try {
    const { photoUrl } = req.body;
    if (!photoUrl) return res.status(400).json({ success: false, message: 'Screenshot is required' });

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    order.paymentScreenshot = photoUrl;
    order.status = 'payment_pending';
    order.statusHistory.push({ status: 'payment_pending', note: 'Customer submitted payment screenshot' });
    await order.save();

    // Notify Admin
    notifyPaymentProof(order).catch(e => console.error(e));

    res.json({ success: true, message: 'Payment info updated successfully', order });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get payment config (MUST be before routes with :id wildcard)
router.get('/payment/config', (req, res) => {
  res.json({
    success: true,
    config: {
      upiId: process.env.UPI_ID || '',
      whatsapp: process.env.WHATSAPP_NUMBER || ''
    }
  });
});

// Get user's orders
router.get('/my', protect, async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user._id }).sort('-createdAt').populate('items.product', 'name images');
    res.json({ success: true, orders });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get single order details (authenticated user / owner or admin)
router.get('/:id', protect, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('items.product', 'name images')
      .populate('user', 'name email phone businessName contactNumber');
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    // Allow if owner or admin
    if (order.user && order.user._id.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    res.json({ success: true, order });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET order verification for public QR page (public) — MUST be before /public/:id wildcard
router.get('/public/verify-token', async (req, res) => {
  try {
    const { id, token } = req.query;
    if (!id || !token) return res.status(400).json({ success: false, message: 'ID and Token required' });

    const tokenRecord = await ShippingToken.findOne({ orderId: id, token, isUsed: false });
    if (!tokenRecord) return res.status(401).json({ success: false, message: 'Invalid or expired QR code' });

    const order = await Order.findById(id).select('orderNumber shippingAddress.name shippingAddress.city');
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    res.json({ success: true, order });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Update order status via one-time token (public-ish) — MUST be before /public/:id wildcard
router.put('/public/ship-by-token', async (req, res) => {
  try {
    const { id, token } = req.body;
    if (!id || !token) return res.status(400).json({ success: false, message: 'Token and ID required' });

    const tokenRecord = await ShippingToken.findOne({ orderId: id, token, isUsed: false });
    if (!tokenRecord) return res.status(401).json({ success: false, message: 'Invalid or already used QR code' });

    const order = await Order.findById(id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    // Update Order
    order.status = 'shipped';
    order.statusHistory.push({ status: 'shipped', note: 'Marked as Shipped via QR Scan' });
    await order.save();

    // Mark token as used
    tokenRecord.isUsed = true;
    await tokenRecord.save();

    // Notify customer
    notifyOrderStatusUpdate(order).catch(err => console.error('Notification error:', err));

    res.json({ success: true, message: 'Order status updated to Shipped' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get basic public info for payment page — MUST be after specific /public/* routes
router.get('/public/:id', async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).select('orderNumber total status guestInfo shippingAddress');
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    
    // Pass public config
    const config = {
      upiId: process.env.UPI_ID || '',
      whatsapp: process.env.WHATSAPP_NUMBER || ''
    };

    res.json({ success: true, order, config });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── ADMIN ROUTES ─────────────────────────────────────────────────────────────

// Create manual order (admin)
router.post('/admin/manual-order', protect, adminOnly, async (req, res) => {
  try {
    const { items, shippingAddress, paymentMethod, status, notes, tracking, subtotal, shippingCost, total } = req.body;
    
    if (!items || !items.length) return res.status(400).json({ success: false, message: 'No items in order' });
    if (!shippingAddress) return res.status(400).json({ success: false, message: 'Shipping address required' });

    let calculatedSubtotal = 0;
    const orderItems = [];
    
    for (const item of items) {
      const product = await Product.findById(item.productId);
      if (!product) continue;

      let variantColor = item.color;
      let variantSize = item.size;
      let orderItemName = product.name;
      let itemPrice = item.price; // Admin can set a custom price, so we trust it but could also check against product.price
      
      // Stock Sufficiency Check
      if (item.variationId && !item.variationId.startsWith('bulk_')) {
        const variant = product.variations.id(item.variationId);
        if (!variant || variant.stock < item.quantity) {
          return res.status(400).json({ success: false, message: `Insufficient stock for ${product.name} (${variant?.size || ''})` });
        }
      } else if (product.stock < item.quantity) {
        return res.status(400).json({ success: false, message: `Insufficient stock for ${product.name}` });
      }

      if (variantColor || variantSize) {
        let vars = [];
        if (variantColor) vars.push(variantColor);
        if (variantSize) vars.push(variantSize);
        orderItemName += ` (${vars.join(' - ')})`;
      }

      orderItems.push({
        product: product._id,
        variationId: item.variationId,
        color: variantColor,
        size: variantSize,
        sku: item.sku || product.sku || '',
        name: orderItemName,
        image: item.image || product.images[0]?.url || '',
        price: itemPrice,
        quantity: item.quantity
      });

      calculatedSubtotal += (itemPrice * item.quantity);

      // Deduct stock safely
      if (item.variationId && !item.variationId.startsWith('bulk_')) {
        await Product.updateOne(
          { _id: product._id, "variations._id": item.variationId, "variations.stock": { $gte: item.quantity } },
          { $inc: { "variations.$.stock": -item.quantity, stock: -item.quantity } }
        );
      } else {
        await Product.updateOne(
          { _id: product._id, stock: { $gte: item.quantity } },
          { $inc: { stock: -item.quantity } }
        );
      }
    }

    const finalSubtotal = calculatedSubtotal;
    const finalShipping = Number(shippingCost) || 0;
    const finalTotal = finalSubtotal + finalShipping;

    const orderData = {
      items: orderItems,
      shippingAddress,
      subtotal: finalSubtotal,
      shippingCost: finalShipping,
      total: finalTotal,
      paymentMethod: paymentMethod || 'cash',
      paymentStatus: (status === 'delivered' || status === 'confirmed') ? 'paid' : 'pending',
      status: status || 'payment_pending',
      notes,
      tracking,
      isManual: true,
      statusHistory: [{ status: status || 'payment_pending', note: 'Order created manually by admin' }]
    };

    const order = await Order.create(orderData);
    res.status(201).json({ success: true, order });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Dashboard stats (MUST be before /admin/:id)
router.get('/admin/stats/dashboard', protect, adminOnly, async (req, res) => {
  try {
    const { dateFilter } = req.query;
    let query = {};
    if (dateFilter && dateFilter !== 'all') {
      const now = new Date();
      let startDate = new Date();
      if (dateFilter === 'today') {
        startDate.setHours(0, 0, 0, 0);
      } else if (dateFilter === '1week') {
        startDate.setDate(now.getDate() - 7);
      } else if (dateFilter === '1month') {
        startDate.setMonth(now.getMonth() - 1);
      } else if (dateFilter === '3months') {
        startDate.setMonth(now.getMonth() - 3);
      } else if (dateFilter === '6months') {
        startDate.setMonth(now.getMonth() - 6);
      } else if (dateFilter === '1year') {
        startDate.setFullYear(now.getFullYear() - 1);
      }
      query = { createdAt: { $gte: startDate } };
    }

    const [totalOrders, totalRevenue, totalShipping, recentOrders, topProducts] = await Promise.all([
      Order.countDocuments({ ...query, status: { $ne: 'cancelled' } }),
      Order.aggregate([
        { $match: { ...query, status: { $ne: 'cancelled' } } },
        { $group: { _id: null, total: { $sum: '$total' } } }
      ]),
      Order.aggregate([
        { $match: { ...query, status: { $ne: 'cancelled' } } },
        { $group: { _id: null, total: { $sum: '$shippingCost' } } }
      ]),
      Order.find(query).sort('-createdAt').limit(5).select('orderNumber status total shippingCost createdAt shippingAddress'),
      Order.aggregate([
        { $match: { ...query, status: { $ne: 'cancelled' } } },
        { $unwind: '$items' },
        { $group: { _id: '$items.product', name: { $first: '$items.name' }, count: { $sum: '$items.quantity' }, revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } } } },
        { $sort: { count: -1 } }, { $limit: 5 }
      ])
    ]);
    const ordersByStatus = await Order.aggregate([{ $match: query }, { $group: { _id: '$status', count: { $sum: 1 } } }]);
    res.json({
      success: true,
      stats: {
        totalOrders,
        totalRevenue: totalRevenue[0]?.total || 0,
        totalShipping: totalShipping[0]?.total || 0,
        recentOrders,
        topProducts,
        ordersByStatus
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get all orders (admin)
router.get('/admin/all', protect, adminOnly, async (req, res) => {
  try {
    const { status, page = 1, limit = 20, search, isManual } = req.query;
    const query = {};
    if (status && status !== 'all') query.status = status;
    if (isManual !== undefined) query.isManual = isManual === 'true';
    if (search) {
      const searchRegex = { $regex: search, $options: 'i' };
      const Product = require('../models/Product');
      const matchingProducts = await Product.find({ 
        $or: [
          { sku: searchRegex },
          { hsn: searchRegex }
        ]
      }).select('_id');
      const matchingProductIds = matchingProducts.map(p => p._id);

      query.$or = [
        { orderNumber: searchRegex },
        { 'shippingAddress.name': searchRegex },
        { 'guestInfo.name': searchRegex }
      ];

      if (matchingProductIds.length > 0) {
        query.$or.push({ 'items.product': { $in: matchingProductIds } });
      }
    }
    const skip = (Number(page) - 1) * Number(limit);
    const [orders, total] = await Promise.all([
      Order.find(query).sort('-createdAt').skip(skip).limit(Number(limit)).populate('user', 'name email'),
      Order.countDocuments(query)
    ]);
    // Stats
    const stats = await Order.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 }, revenue: { $sum: '$total' } } }
    ]);
    res.json({ success: true, orders, total, stats });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET order data + shipping token for Invoice (protected)
router.get('/admin/:id/shipping-token', protect, adminOnly, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .select('orderNumber createdAt shippingAddress total weight')
      .populate('user', 'name email phone');

    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    // Calculate total weight if not stored (sum of products)
    let totalWeight = 0;
    const fullOrder = await Order.findById(req.params.id).populate('items.product');
    fullOrder.items.forEach(item => {
      totalWeight += (item.product?.weight || 0) * item.quantity;
    });

    // One-time Token Logic
    let tokenRecord = await ShippingToken.findOne({ orderId: order._id, isUsed: false });
    if (!tokenRecord) {
      const token = crypto.randomBytes(32).toString('hex');
      tokenRecord = await ShippingToken.create({ orderId: order._id, token });
    }

    // Generate QR Code
    // Use BASE_URL from env if set, otherwise fallback to current host
    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
    const updateUrl = `${baseUrl}/update-order?id=${order._id}&token=${tokenRecord.token}`;
    const qrDataUrl = await QRCode.toDataURL(updateUrl);

    res.json({
      success: true,
      order: {
        ...order._doc,
        totalWeight: totalWeight || 1 // fallback to 1kg if 0
      },
      qrCode: qrDataUrl,
      updateUrl
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});



// Get single order (admin) — has :id wildcard, must come AFTER specific routes
router.get('/admin/:id', protect, adminOnly, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).populate('user', 'name email phone').populate('items.product', 'name images');
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    res.json({ success: true, order });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Update order status (admin)
router.patch('/admin/:id/status', protect, adminOnly, async (req, res) => {
  try {
    const { status, note } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    
    // Auto-delete screenshot from DB in 24 hours if payment is verified
    if (order.paymentScreenshot && (status === 'payment_received' || status === 'confirmed')) {
      setTimeout(async () => {
        try {
          const fetchOrder = await Order.findById(order._id);
          if (fetchOrder && fetchOrder.paymentScreenshot) {
            fetchOrder.paymentScreenshot = undefined;
            await fetchOrder.save();
          }
        } catch(e) {}
      }, 24 * 60 * 60 * 1000); // 24 hours
    }

    order.status = status;
    order.statusHistory.push({ status, note: note || `Status updated to ${status}` });
    if (status === 'delivered') order.paymentStatus = 'paid';
    await order.save();

    // Trigger Notifications (Customer) asynchronously
    notifyOrderStatusUpdate(order).catch(err => console.error('Notification error:', err));

    res.json({ success: true, order });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Update order tracking details (admin)
router.patch('/admin/:id/tracking', protect, adminOnly, async (req, res) => {
  try {
    const { id, company, url, phone } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    order.tracking = { id, company, url, phone };
    // Also auto-update status to 'shipped' if not already
    if (order.status !== 'shipped' && order.status !== 'delivered') {
      order.status = 'shipped';
      order.statusHistory.push({ status: 'shipped', note: 'Tracking information added' });
    }
    
    await order.save();

    const { notifyOrderTrackingUpdate } = require('../utils/notifications');
    notifyOrderTrackingUpdate(order).catch(err => console.error('Email Notification error:', err));

    res.json({ success: true, order });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
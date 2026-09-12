// backend/routes/products.js
const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const Order = require('../models/Order');
const { protect, adminOnly } = require('../middleware/auth');
const { cloudinary } = require('../config/cloudinary');
const { notifyLowStock } = require('../utils/notifications');

async function getRecentSalesMap() {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recentOrders = await Order.aggregate([
    { $match: { createdAt: { $gte: oneDayAgo }, status: { $ne: 'cancelled' } } },
    { $unwind: "$items" },
    { $group: { _id: "$items.product", count: { $sum: "$items.quantity" } } }
  ]);
  const salesMap = {};
  recentOrders.forEach(o => {
    if (o._id) salesMap[o._id.toString()] = o.count;
  });
  return salesMap;
}

// GET all products (with filters, search, pagination)
router.get('/', async (req, res) => {
  try {
    const { search, category, minPrice, maxPrice, featured, bestSeller, page = 1, limit = 20, sort = '-createdAt' } = req.query;
    const query = { active: true };

    let effectiveMinPrice = (minPrice !== undefined && minPrice !== null && minPrice !== '') ? Number(minPrice) : null;
    let effectiveMaxPrice = (maxPrice !== undefined && maxPrice !== null && maxPrice !== '') ? Number(maxPrice) : null;

    let textSearchQuery = null;

    if (search) {
      const cleanSearch = search.trim();
      const numValue = parseFloat(cleanSearch.replace(/[^0-9.]/g, ''));

      // 1. Check for explicit price range format like "500-1500" or "500 to 1500"
      const isPriceRange = /^\s*(\d+)\s*[-–—to]+\s*(\d+)\s*$/i.exec(cleanSearch);
      // 2. Check for price expressions like "under 500", "below 500", "₹500", "rs 500", or pure number "500"
      const isPriceExpr = /^\s*(under|below|less than|max|<=?|rs\.?|₹)?\s*(\d+)\s*(rs\.?|₹)?\s*$/i.test(cleanSearch);

      if (isPriceRange) {
        effectiveMinPrice = Number(isPriceRange[1]);
        effectiveMaxPrice = Number(isPriceRange[2]);
      } else if (!isNaN(numValue) && numValue > 0 && (isPriceExpr || /^\d+$/.test(cleanSearch) || cleanSearch.includes('₹') || cleanSearch.toLowerCase().includes('rs'))) {
        // Explicit price query (e.g. "500", "under 500", "₹500")
        // Set maximum price limit strictly to numValue unless maxPrice was explicitly provided
        if (effectiveMaxPrice === null) {
          effectiveMaxPrice = numValue;
        }
      } else {
        // Keyword text search (e.g. "Sherwani", "Lehenga")
        textSearchQuery = search;
      }
    }

    if (textSearchQuery) {
      query.$text = { $search: textSearchQuery };
    }

    if (category && category !== 'all') {
      const categoryList = Array.isArray(category) ? category : category.split(',');
      const Category = require('../models/Category');
      
      const selectedCategories = await Category.find({ name: { $in: categoryList } });
      const selectedIds = selectedCategories.map(c => c._id);
      const subCategories = await Category.find({ parent: { $in: selectedIds } });
      
      const allTargetCategoryNames = [
        ...selectedCategories.map(c => c.name),
        ...subCategories.map(c => c.name)
      ];
      
      query.category = { $in: allTargetCategoryNames };
    }

    if (featured === 'true') query.featured = true;
    if (bestSeller === 'true') query.bestSeller = true;

    // Apply STRICT price filtering whenever effectiveMinPrice or effectiveMaxPrice is defined
    if (effectiveMinPrice !== null || effectiveMaxPrice !== null) {
      const priceCondition = {};
      if (effectiveMinPrice !== null && !isNaN(effectiveMinPrice)) priceCondition.$gte = effectiveMinPrice;
      if (effectiveMaxPrice !== null && !isNaN(effectiveMaxPrice)) priceCondition.$lte = effectiveMaxPrice;

      if (Object.keys(priceCondition).length > 0) {
        query.$and = query.$and || [];
        query.$and.push({
          $or: [
            { price: priceCondition },
            { 'variations.price': priceCondition }
          ]
        });
      }
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [products, total, salesMap] = await Promise.all([
      Product.find(query).sort(sort).skip(skip).limit(Number(limit)),
      Product.countDocuments(query),
      getRecentSalesMap()
    ]);

    const productsWithSales = products.map(p => ({
      ...p.toObject(),
      recentSales: salesMap[p._id.toString()] || 0
    }));

    res.json({ success: true, products: productsWithSales, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET categories with counts (MUST be before /:id)
router.get('/meta/categories', async (req, res) => {
  try {
    const cats = await Product.aggregate([
      { $match: { active: true } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    res.json({ success: true, categories: cats });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Admin: Get all products including inactive (MUST be before /:id)
router.get('/admin/all', protect, adminOnly, async (req, res) => {
  try {
    const { page = 1, limit = 50, search } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    
    let query = {};
    if (search) {
      const searchRegex = { $regex: search, $options: 'i' };
      query.$or = [
        { name: searchRegex },
        { sku: searchRegex },
        { hsn: searchRegex }
      ];
      
      const mongoose = require('mongoose');
      if (mongoose.Types.ObjectId.isValid(search)) {
        query.$or.push({ _id: search });
      }
    }

    const [products, total] = await Promise.all([
      Product.find(query).sort('-createdAt').skip(skip).limit(Number(limit)),
      Product.countDocuments(query)
    ]);
    res.json({ success: true, products, total });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET product recommendations
router.get('/recommendations', async (req, res) => {
  try {
    const products = await Product.find({ active: true }).sort('-createdAt').limit(4);
    res.json({ success: true, products });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET single product details
router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentOrders = await Order.aggregate([
      { $match: { createdAt: { $gte: oneDayAgo }, status: { $ne: 'cancelled' } } },
      { $unwind: "$items" },
      { $match: { "items.product": product._id } },
      { $group: { _id: "$items.product", count: { $sum: "$items.quantity" } } }
    ]);
    const recentSales = recentOrders.length > 0 ? recentOrders[0].count : 0;
    
    res.json({ success: true, product: { ...product.toObject(), recentSales } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// CREATE product (admin only)
router.post('/', protect, adminOnly, async (req, res) => {
  try {
    const product = await Product.create(req.body);
    res.status(201).json({ success: true, product });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// UPDATE product (admin only)
router.put('/:id', protect, adminOnly, async (req, res) => {
  try {
    const product = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    
    // Check for low stock on update
    if (product.stock <= 5) notifyLowStock(product).catch(e => {});
    if (product.variations) {
      product.variations.forEach(v => {
        if (v.stock <= 5) notifyLowStock(product, v).catch(e => {});
      });
    }

    res.json({ success: true, product });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.patch('/:id', protect, adminOnly, async (req, res) => {
  try {
    const product = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    // Check for low stock on update
    if (product.stock <= 5) notifyLowStock(product).catch(e => {});
    if (product.variations) {
      product.variations.forEach(v => {
        if (v.stock <= 5) notifyLowStock(product, v).catch(e => {});
      });
    }

    res.json({ success: true, product });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// DELETE product (admin only)
router.delete('/:id', protect, adminOnly, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    // Delete images from Cloudinary
    for (const img of product.images) {
      if (img.public_id) await cloudinary.uploader.destroy(img.public_id);
    }
    await product.deleteOne();
    res.json({ success: true, message: 'Product deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
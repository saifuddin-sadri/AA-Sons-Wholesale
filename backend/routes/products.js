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

    if (search) query.$text = { $search: search };
    if (category && category !== 'all') {
      const categoryList = Array.isArray(category) ? category : category.split(',');
      const Category = require('../models/Category');
      
      // Find all categories and their subcategories
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
    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = Number(minPrice);
      if (maxPrice) query.price.$lte = Number(maxPrice);
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
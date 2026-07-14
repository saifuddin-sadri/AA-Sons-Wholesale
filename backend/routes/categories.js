const express = require('express');
const router = express.Router();
const Category = require('../models/Category');
const Product = require('../models/Product');
const { protect, adminOnly } = require('../middleware/auth');

// GET all categories (public/admin)
router.get('/', async (req, res) => {
  console.log('📡 Fetching all categories...');
  try {
    const categories = await Category.find().populate('parent', 'name').sort('name');
    res.json({ success: true, categories });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET categories that are active (for shop)
router.get('/active', async (req, res) => {
  try {
    const categories = await Category.find({ active: true }).populate('parent', 'name').sort('name');
    res.json({ success: true, categories });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// CREATE category (admin only)
router.post('/', protect, adminOnly, async (req, res) => {
  try {
    const { name, description, active, parent, displayType, image, posters } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Category name is required' });

    const slug = name.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    const category = await Category.create({ name, slug, description, active, parent, displayType, image, posters });
    res.status(201).json({ success: true, category });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ success: false, message: 'Category with this name already exists' });
    }
    res.status(400).json({ success: false, message: err.message });
  }
});

// UPDATE category (admin only)
router.put('/:id', protect, adminOnly, async (req, res) => {
  try {
    const { name, description, active, parent, displayType, image, posters } = req.body;
    const category = await Category.findById(req.params.id);
    if (!category) return res.status(404).json({ success: false, message: 'Category not found' });

    if (name) {
      category.name = name;
      category.slug = name.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
    }
    if (description !== undefined) category.description = description;
    if (active !== undefined) category.active = active;
    if (parent !== undefined) category.parent = parent || null;
    if (displayType !== undefined) category.displayType = displayType;
    if (image !== undefined) category.image = image;
    if (posters !== undefined) category.posters = posters;

    await category.save();
    res.json({ success: true, category });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ success: false, message: 'Category name already exists' });
    }
    res.status(400).json({ success: false, message: err.message });
  }
});

router.patch('/:id', protect, adminOnly, async (req, res) => {
  try {
    const { name, description, active, parent, displayType, image, posters } = req.body;
    const category = await Category.findById(req.params.id);
    if (!category) return res.status(404).json({ success: false, message: 'Category not found' });

    if (name) {
      category.name = name;
      category.slug = name.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
    }
    if (description !== undefined) category.description = description;
    if (active !== undefined) category.active = active;
    if (parent !== undefined) category.parent = parent || null;
    if (displayType !== undefined) category.displayType = displayType;
    if (image !== undefined) category.image = image;
    if (posters !== undefined) category.posters = posters;

    await category.save();
    res.json({ success: true, category });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ success: false, message: 'Category name already exists' });
    }
    res.status(400).json({ success: false, message: err.message });
  }
});

// DELETE category (admin only)
router.delete('/:id', protect, adminOnly, async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) return res.status(404).json({ success: false, message: 'Category not found' });

    // Check if any product is using this category
    const productCount = await Product.countDocuments({ category: category.name });
    if (productCount > 0) {
      return res.status(400).json({ 
        success: false, 
        message: `Cannot delete category: ${productCount} products are assigned to it. Please reassign products first.`
      });
    }

    await category.deleteOne();
    res.json({ success: true, message: 'Category deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

// backend/routes/promotion.js
const express = require('express');
const router = express.Router();
const Promotion = require('../models/Promotion');
const { protect, adminOnly } = require('../middleware/auth');

// GET promotion settings
router.get('/', async (req, res) => {
  try {
    let promotion = await Promotion.findOne();
    if (!promotion) {
      promotion = await Promotion.create({
        festiveEnabled: false,
        saleMessages: ['Welcome to A.A & Sons!'],
        festiveProductIds: []
      });
    }
    
    // Always populate to ensure consistent data structure in admin panel
    await promotion.populate('festiveProductIds');
    
    // Filter out nulls in case products were deleted
    promotion.festiveProductIds = promotion.festiveProductIds.filter(p => p !== null);
    
    res.json({ success: true, promotion });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// UPDATE promotion settings (admin only)
router.put('/', protect, adminOnly, async (req, res) => {
  try {
    let promotion = await Promotion.findOne();
    if (!promotion) {
      promotion = new Promotion(req.body);
    } else {
      promotion.festiveEnabled = req.body.festiveEnabled;
      promotion.saleMessages = req.body.saleMessages;
      promotion.festiveProductIds = req.body.festiveProductIds;
      promotion.updatedAt = Date.now();
    }
    await promotion.save();
    res.json({ success: true, promotion });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

module.exports = router;

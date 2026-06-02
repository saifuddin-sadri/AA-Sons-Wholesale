// backend/routes/bulkEnquiry.js
const express = require('express');
const router = express.Router();
const BulkEnquiry = require('../models/BulkEnquiry');
const { protect, adminOnly } = require('../middleware/auth');

/**
 * @route   POST /api/bulk-enquiry
 * @desc    Submit a new bulk enquiry
 * @access  Public
 */
router.post('/', async (req, res) => {
  try {
    const { name, contactNumber, email, selectedProducts, message } = req.body;

    // The status field is purposely excluded from the create body to ensure it uses the default "Pending"
    const enquiry = await BulkEnquiry.create({
      name,
      contactNumber,
      email,
      selectedProducts,
      message
    });

    res.status(201).json({
      success: true,
      message: 'Your enquiry has been submitted. Our team will contact you shortly.',
      data: enquiry
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * @route   GET /api/bulk-enquiry
 * @desc    Get all bulk enquiries (Admin only)
 * @access  Private/Admin
 */
router.get('/', protect, adminOnly, async (req, res) => {
  try {
    const enquiries = await BulkEnquiry.find().sort({ createdAt: -1 });
    res.json({
      success: true,
      count: enquiries.length,
      data: enquiries
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
});

/**
 * @route   PATCH /api/bulk-enquiry/:id/status
 * @desc    Update enquiry status (Admin only)
 * @access  Private/Admin
 */
router.patch('/:id/status', protect, adminOnly, async (req, res) => {
  try {
    const { status } = req.body;
    
    if (!['Pending', 'Contacted', 'Closed'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status'
      });
    }

    const enquiry = await BulkEnquiry.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true, runValidators: true }
    );

    if (!enquiry) {
      return res.status(404).json({
        success: false,
        message: 'Enquiry not found'
      });
    }

    res.json({
      success: true,
      data: enquiry
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
});

module.exports = router;

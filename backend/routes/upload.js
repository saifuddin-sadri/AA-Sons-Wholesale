// backend/routes/upload.js
const express = require('express');
const router = express.Router();
const { upload, cloudinary } = require('../config/cloudinary');
const { protect, adminOnly } = require('../middleware/auth');

// Helper: extract url and public_id from multer-storage-cloudinary file object
// Newer versions use `path` and `filename`, older used `url` and `public_id`
const getFileInfo = (file) => ({
  url: file.path || file.url || file.secure_url,
  public_id: file.filename || file.public_id
});

// Upload single image
router.post('/image', protect, adminOnly, (req, res, next) => {
  console.log('🖼️  Started image upload request...');
  next();
}, upload.single('image'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No image uploaded' });
    res.json({
      success: true,
      image: getFileInfo(req.file)
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Upload business card (Public — used during registration)
router.post('/business-card', upload.single('image'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No image uploaded' });
    res.json({
      success: true,
      image: getFileInfo(req.file)
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Upload payment proof (Public)
router.post('/payment-proof', upload.single('image'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No image uploaded' });
    res.json({
      success: true,
      image: getFileInfo(req.file)
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Upload multiple images
router.post('/images', protect, adminOnly, upload.array('images', 5), (req, res) => {
  try {
    if (!req.files?.length) return res.status(400).json({ success: false, message: 'No images uploaded' });
    const images = req.files.map(f => getFileInfo(f));
    res.json({ success: true, images });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Delete image
router.delete('/image/:publicId', protect, adminOnly, async (req, res) => {
  try {
    await cloudinary.uploader.destroy(req.params.publicId);
    res.json({ success: true, message: 'Image deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
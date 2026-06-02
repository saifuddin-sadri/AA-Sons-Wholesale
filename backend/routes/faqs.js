const express = require('express');
const router = express.Router();
const FAQ = require('../models/FAQ');
const { sendEmail } = require('../utils/notifications');
const { protect, adminOnly } = require('../middleware/auth');

// Create new FAQ / Query
router.post('/', async (req, res) => {
  try {
    const { name, email, phone, query } = req.body;
    
    if (!name || !email || !query) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    // Save to Database
    const newFaq = new FAQ({ name, email, phone, query });
    await newFaq.save();

    const adminEmail = process.env.ADMIN_EMAIL;
    if (adminEmail) {
      const subject = `New Query/Recommendation from ${name}`;
      const html = `
        <h2>New Query or Recommendation</h2>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Phone:</strong> ${phone || 'Not provided'}</p>
        <p><strong>Message:</strong></p>
        <blockquote style="background: #f9f9f9; padding: 15px; border-left: 4px solid #1B5E4B; white-space: pre-wrap;">${query}</blockquote>
        <p><a href="${process.env.FRONTEND_URL || 'http://localhost:1234'}/admin">Go to Admin Dashboard to answer</a></p>
      `;
      await sendEmail(adminEmail, subject, html);
    }

    res.json({ success: true, message: 'Query submitted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Admin: Get all FAQs
router.get('/admin', protect, adminOnly, async (req, res) => {
  try {
    const faqs = await FAQ.find().sort({ createdAt: -1 });
    res.json({ success: true, faqs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Admin: Answer a FAQ
router.post('/admin/answer/:id', protect, adminOnly, async (req, res) => {
  try {
    const { answer } = req.body;
    const faq = await FAQ.findById(req.params.id);
    if (!faq) return res.status(404).json({ success: false, message: 'FAQ not found' });

    faq.answer = answer;
    faq.isAnswered = true;
    await faq.save();

    // Optionally email the customer their answer
    if (faq.email) {
      const subject = `Re: Your Query at A.A. & Sons`;
      const html = `
        <h3>Hello ${faq.name},</h3>
        <p>You asked: <i>"${faq.query}"</i></p>
        <div style="background: #f4f4f4; padding: 15px; border-left: 4px solid #d4af37;">
          <p><strong>Our Reply:</strong><br/>${answer}</p>
        </div>
        <br/>
        <p>Thank you for reaching out!</p>
      `;
      await sendEmail(faq.email, subject, html);
    }

    res.json({ success: true, faq });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Admin: Update FAQ status directly
router.put('/admin/:id', protect, adminOnly, async (req, res) => {
  try {
    const faq = await FAQ.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!faq) return res.status(404).json({ success: false, message: 'FAQ not found' });
    res.json({ success: true, faq });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Admin: Delete FAQ
router.delete('/admin/:id', protect, adminOnly, async (req, res) => {
  try {
    const faq = await FAQ.findByIdAndDelete(req.params.id);
    if (!faq) return res.status(404).json({ success: false, message: 'FAQ not found' });
    res.json({ success: true, message: 'FAQ deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

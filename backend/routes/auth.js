// backend/routes/auth.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const User = require('../models/User');
const RegistrationRequest = require('../models/RegistrationRequest');
const LoginRequest = require('../models/LoginRequest');
const { protect, adminOnly } = require('../middleware/auth');
const { sendEmail, createAdminNotification } = require('../utils/notifications');

// Helper: sign a 3-hour token for approved user sessions
const signSessionToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '3h' });
// Helper: sign admin token (longer lived)
const signAdminToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRE || '7d' });

// ─── PUBLIC: Submit Registration Request ──────────────
router.post('/register-request', async (req, res) => {
  try {
    const { name, email, password, businessName, contactNumber, businessCard } = req.body;

    if (!name || !email || !password || !businessName || !contactNumber) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'You are already registered. Please send a login request.' });
    }

    // Check if there's already a pending registration request
    const existingRequest = await RegistrationRequest.findOne({ email, status: 'pending' });
    if (existingRequest) {
      return res.status(400).json({ success: false, message: 'A registration request for this email is already pending' });
    }

    // Hash password before storing
    const hashedPassword = await bcrypt.hash(password, 12);

    const request = await RegistrationRequest.create({
      name, email, password: hashedPassword, businessName, contactNumber,
      businessCard: businessCard || ''
    });

    // Create admin notification
    await createAdminNotification({
      title: 'New Registration Request',
      message: `${name} (${businessName}) has requested registration.`,
      type: 'registration',
      link: 'registration-requests',
      metadata: { requestId: request._id }
    });

    res.status(201).json({ success: true, message: 'Registration request sent successfully! You will receive an email once approved.' });
  } catch (err) {
    console.error('Register request error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── PUBLIC: Submit Login Request ──────────────────────
router.post('/login-request', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ success: false, message: 'You are not registered. Please register first.' });
    }

    // Admin users bypass the login request system
    if (user.role === 'admin') {
      const isMatch = await user.comparePassword(password);
      if (!isMatch) {
        return res.status(401).json({ success: false, message: 'You entered the wrong password' });
      }
      const token = signAdminToken(user._id);
      return res.json({
        success: true,
        isAdmin: true,
        token,
        user: { id: user._id, name: user.name, email: user.email, role: user.role }
      });
    }

    if (!user.isApproved) {
      return res.status(403).json({ success: false, message: 'Your account has not been approved yet. Please wait for admin approval.' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'You entered the wrong password' });
    }

    // Check if there's already a pending login request
    const existingRequest = await LoginRequest.findOne({ user: user._id, status: 'pending' });
    if (existingRequest) {
      return res.status(400).json({ success: false, message: 'A login request is already pending. Please wait for admin approval.' });
    }

    // Create login request
    const loginReq = await LoginRequest.create({
      user: user._id,
      name: user.name,
      email: user.email,
      businessName: user.businessName,
      contactNumber: user.contactNumber,
      businessCard: user.businessCard
    });

    // Create admin notification
    await createAdminNotification({
      title: 'New Login Request',
      message: `${user.name} (${user.businessName}) is requesting login access.`,
      type: 'login',
      link: 'login-requests',
      metadata: { requestId: loginReq._id }
    });

    res.json({ success: true, message: 'Login request sent! You will receive an email with a login link once approved.' });
  } catch (err) {
    console.error('Login request error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── PUBLIC: Login with approved credentials ──────────
// After admin approves and user clicks email link, they land on login page
// and enter credentials again. This endpoint actually logs them in with a 3hr session.
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password required' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ success: false, message: 'You are not registered. Please register first.' });
    }
    
    if (!(await user.comparePassword(password))) {
      return res.status(401).json({ success: false, message: 'You entered the wrong password' });
    }

    // Admin bypasses session timer
    if (user.role === 'admin') {
      const token = signAdminToken(user._id);
      return res.json({
        success: true,
        token,
        user: { id: user._id, name: user.name, email: user.email, role: user.role }
      });
    }

    // Check if user has an approved login request
    const approvedLogin = await LoginRequest.findOne({
      user: user._id,
      status: 'approved'
    }).sort({ approvedAt: -1 });

    if (!approvedLogin) {
      return res.status(403).json({
        success: false,
        message: 'No approved login request found. Please submit a login request first.'
      });
    }

    // Set session expiry to 3 hours from now
    const sessionExpiry = new Date(Date.now() + 3 * 60 * 60 * 1000);
    user.sessionExpiry = sessionExpiry;
    await user.save();

    // Mark the login request as used (change status so it can't be reused)
    approvedLogin.status = 'used';
    await approvedLogin.save();

    const token = signSessionToken(user._id);

    res.json({
      success: true,
      token,
      sessionExpiry: sessionExpiry.toISOString(),
      user: {
        id: user._id, name: user.name, email: user.email,
        role: user.role, businessName: user.businessName
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── PROTECTED: Get session status ────────────────────
router.get('/session-status', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    if (user.role === 'admin') {
      return res.json({ success: true, isAdmin: true, sessionExpiry: null });
    }

    res.json({
      success: true,
      sessionExpiry: user.sessionExpiry ? user.sessionExpiry.toISOString() : null,
      isExpired: user.sessionExpiry ? new Date() > user.sessionExpiry : true
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── PROTECTED: Get profile ───────────────────────────
router.get('/me', protect, async (req, res) => {
  res.json({ success: true, user: req.user });
});

// ═══════════════════════════════════════════════════════
// ADMIN ENDPOINTS
// ═══════════════════════════════════════════════════════

// ─── ADMIN: List Registration Requests ────────────────
router.get('/admin/registration-requests', protect, adminOnly, async (req, res) => {
  try {
    const requests = await RegistrationRequest.find().sort({ createdAt: -1 });
    res.json({ success: true, requests });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── ADMIN: Get Single Registration Request ──────────
router.get('/admin/registration-requests/:id', protect, adminOnly, async (req, res) => {
  try {
    const request = await RegistrationRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ success: false, message: 'Request not found' });
    res.json({ success: true, request });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── ADMIN: Approve Registration Request ─────────────
router.patch('/admin/registration-requests/:id/approve', protect, adminOnly, async (req, res) => {
  try {
    const request = await RegistrationRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ success: false, message: 'Request not found' });
    if (request.status === 'approved') {
      return res.status(400).json({ success: false, message: 'Request already approved' });
    }

    // Check if user already exists
    let user = await User.findOne({ email: request.email });
    if (user) {
      request.status = 'approved';
      await request.save();
      return res.status(400).json({ success: false, message: 'User with this email already exists' });
    }

    // Create user from registration data (password is already hashed)
    user = new User({
      name: request.name,
      email: request.email,
      password: request.password,
      businessName: request.businessName,
      contactNumber: request.contactNumber,
      businessCard: request.businessCard,
      isApproved: true,
      role: 'user'
    });
    // Skip the pre-save password hash since it's already hashed
    user.$skipPasswordHash = true;
    await user.save();

    // Update request status
    request.status = 'approved';
    await request.save();

    // Send approval email
    const siteUrl = `${req.protocol}://${req.get('host')}`;
    const html = `
      <div style="font-family: 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 12px; overflow: hidden;">
        <div style="background: linear-gradient(135deg, #1B5E4B, #2A7A63); padding: 30px; text-align: center;">
          <h1 style="color: #F5EDD6; margin: 0; font-size: 1.5rem;">A.A & Sons</h1>
          <p style="color: rgba(245,237,214,0.7); margin: 8px 0 0; font-size: 0.85rem;">Wholesale Portal</p>
        </div>
        <div style="padding: 30px;">
          <h2 style="color: #1B5E4B; margin-top: 0;">Registration Approved! ✅</h2>
          <p style="color: #555;">Dear <strong>${request.name}</strong>,</p>
          <p style="color: #555;">Great news! Your registration request for <strong>${request.businessName}</strong> has been approved by the admin.</p>
          <p style="color: #555;">You can now log in to the A.A & Sons wholesale portal. Please note that each login session requires admin approval.</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${siteUrl}/auth" style="background: #1B5E4B; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">Go to Login Page</a>
          </div>
          <p style="font-size: 0.85rem; color: #999;">Thank you for choosing A.A & Sons!</p>
        </div>
      </div>
    `;
    await sendEmail(request.email, 'Registration Approved — A.A & Sons', html);

    res.json({ success: true, message: 'Registration approved and email sent to user' });
  } catch (err) {
    console.error('Approve registration error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── ADMIN: Reject Registration Request ──────────────
router.patch('/admin/registration-requests/:id/reject', protect, adminOnly, async (req, res) => {
  try {
    const request = await RegistrationRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ success: false, message: 'Request not found' });
    request.status = 'rejected';
    await request.save();
    res.json({ success: true, message: 'Registration request rejected' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── ADMIN: List Login Requests ───────────────────────
router.get('/admin/login-requests', protect, adminOnly, async (req, res) => {
  try {
    const requests = await LoginRequest.find({ status: { $in: ['pending', 'approved'] } })
      .populate('user', 'name email businessName contactNumber businessCard')
      .sort({ createdAt: -1 });
    res.json({ success: true, requests });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── ADMIN: Get Single Login Request ─────────────────
router.get('/admin/login-requests/:id', protect, adminOnly, async (req, res) => {
  try {
    const request = await LoginRequest.findById(req.params.id)
      .populate('user', 'name email businessName contactNumber businessCard');
    if (!request) return res.status(404).json({ success: false, message: 'Request not found' });
    res.json({ success: true, request });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── ADMIN: Approve Login Request ────────────────────
router.patch('/admin/login-requests/:id/approve', protect, adminOnly, async (req, res) => {
  try {
    const loginReq = await LoginRequest.findById(req.params.id);
    if (!loginReq) return res.status(404).json({ success: false, message: 'Request not found' });
    if (loginReq.status === 'approved') {
      return res.status(400).json({ success: false, message: 'Login request already approved' });
    }

    loginReq.status = 'approved';
    loginReq.approvedAt = new Date();
    await loginReq.save();

    // Send email with link to login page
    const siteUrl = `${req.protocol}://${req.get('host')}`;
    const loginLink = `${siteUrl}/auth?approved=true&email=${encodeURIComponent(loginReq.email)}`;

    const html = `
      <div style="font-family: 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 12px; overflow: hidden;">
        <div style="background: linear-gradient(135deg, #1B5E4B, #2A7A63); padding: 30px; text-align: center;">
          <h1 style="color: #F5EDD6; margin: 0; font-size: 1.5rem;">A.A & Sons</h1>
          <p style="color: rgba(245,237,214,0.7); margin: 8px 0 0; font-size: 0.85rem;">Wholesale Portal</p>
        </div>
        <div style="padding: 30px;">
          <h2 style="color: #1B5E4B; margin-top: 0;">Login Request Approved! 🔓</h2>
          <p style="color: #555;">Dear <strong>${loginReq.name}</strong>,</p>
          <p style="color: #555;">Your login request has been approved. You now have access to the A.A & Sons wholesale portal.</p>
          <p style="color: #555;">Click the button below to go to the login page, enter your email and password, and you will be granted <strong>3 hours</strong> of access.</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${loginLink}" style="background: #1B5E4B; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">Login Now</a>
          </div>
          <div style="background: #FFF8E7; border-left: 4px solid #C8873A; padding: 12px 16px; border-radius: 4px; margin: 20px 0;">
            <p style="color: #8B6914; margin: 0; font-size: 0.85rem;"><strong>⏱ Note:</strong> Your session will automatically expire after 3 hours. After that, you will need to submit a new login request.</p>
          </div>
          <p style="font-size: 0.85rem; color: #999;">Thank you for choosing A.A & Sons!</p>
        </div>
      </div>
    `;
    await sendEmail(loginReq.email, 'Login Approved — A.A & Sons', html);

    res.json({ success: true, message: 'Login request approved and email sent to user' });
  } catch (err) {
    console.error('Approve login error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── ADMIN: Reject Login Request ─────────────────────
router.patch('/admin/login-requests/:id/reject', protect, adminOnly, async (req, res) => {
  try {
    const loginReq = await LoginRequest.findById(req.params.id);
    if (!loginReq) return res.status(404).json({ success: false, message: 'Request not found' });
    loginReq.status = 'rejected';
    await loginReq.save();
    res.json({ success: true, message: 'Login request rejected' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── ADMIN: List Authorised Users ─────────────────────
router.get('/admin/users', protect, adminOnly, async (req, res) => {
  try {
    const users = await User.find({ role: { $ne: 'admin' } })
      .select('-password')
      .sort({ createdAt: -1 });
    res.json({ success: true, users });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── ADMIN: Delete User ───────────────────────────────
router.delete('/admin/users/:id', protect, adminOnly, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (user.role === 'admin') {
      return res.status(403).json({ success: false, message: 'Cannot delete admin users' });
    }
    await User.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'User deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
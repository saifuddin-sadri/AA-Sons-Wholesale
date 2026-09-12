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

// ─── PUBLIC: User Registration (Direct Account Creation) ──────
router.post('/register-request', async (req, res) => {
  try {
    const { name, email, password, businessName, contactNumber, businessCard, address } = req.body;

    if (!name || !email || !businessName || !contactNumber) {
      return res.status(400).json({ success: false, message: 'Name, email, business name, and contact number are required' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const cleanContact = contactNumber.trim();

    // Check if user already exists by email or contactNumber
    const existingUser = await User.findOne({
      $or: [{ email: cleanEmail }, { contactNumber: cleanContact }, { phone: cleanContact }]
    });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'An account with this email or mobile number already exists. Please send a login request.' });
    }

    // Create user directly (no registration request or admin permission needed)
    const user = new User({
      name,
      email: cleanEmail,
      password: password || '',
      phone: cleanContact,
      contactNumber: cleanContact,
      businessName,
      businessCard: businessCard || '',
      address: address || {},
      isApproved: true,
      role: 'user'
    });

    await user.save();

    res.status(201).json({
      success: true,
      message: 'Account created successfully! You can now submit a login request.'
    });
  } catch (err) {
    console.error('Register request error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── PUBLIC: Submit Login Request / Access Check ──────────────
router.post('/login-request', async (req, res) => {
  try {
    const { contactNumber, email, password } = req.body;

    // Admin login path using email and password
    if (email && password) {
      const user = await User.findOne({ email: email.toLowerCase() });
      if (!user || user.role !== 'admin') {
        return res.status(401).json({ success: false, message: 'Invalid admin credentials' });
      }
      const isMatch = await user.comparePassword(password);
      if (!isMatch) {
        return res.status(401).json({ success: false, message: 'Invalid admin credentials' });
      }
      const token = signAdminToken(user._id);
      return res.json({
        success: true,
        isAdmin: true,
        token,
        user: { id: user._id, name: user.name, email: user.email, role: user.role }
      });
    }

    if (!contactNumber) {
      return res.status(400).json({ success: false, message: 'Mobile number is required' });
    }

    const cleanContact = contactNumber.trim();
    const user = await User.findOne({
      $or: [{ contactNumber: cleanContact }, { phone: cleanContact }]
    });

    if (!user) {
      return res.status(401).json({ success: false, message: 'Mobile number is not registered. Please register first.' });
    }

    if (user.role === 'admin') {
      return res.status(400).json({ success: false, message: 'Admin accounts must use Admin Login with email and password.' });
    }

    // 1. Check if user has permanent "Always Access"
    if (user.alwaysAccess) {
      const token = signAdminToken(user._id);
      user.sessionExpiry = null;
      await user.save();
      return res.json({
        success: true,
        directLogin: true,
        token,
        sessionExpiry: 'always',
        user: {
          id: user._id, name: user.name, email: user.email,
          role: user.role, businessName: user.businessName, contactNumber: user.contactNumber
        }
      });
    }

    // 2. Check if user's 3-hour session is STILL ACTIVE (time remaining)
    if (user.sessionExpiry && new Date() < new Date(user.sessionExpiry)) {
      const token = signSessionToken(user._id);
      return res.json({
        success: true,
        directLogin: true,
        token,
        sessionExpiry: user.sessionExpiry.toISOString(),
        user: {
          id: user._id, name: user.name, email: user.email,
          role: user.role, businessName: user.businessName, contactNumber: user.contactNumber
        }
      });
    }

    // 3. Check if user has an approved login request
    const approvedLogin = await LoginRequest.findOne({
      user: user._id,
      status: 'approved'
    }).sort({ approvedAt: -1 });

    if (approvedLogin) {
      if (approvedLogin.duration === 'always') {
        user.alwaysAccess = true;
        user.sessionExpiry = null;
        await user.save();

        approvedLogin.status = 'used';
        await approvedLogin.save();

        const token = signAdminToken(user._id);
        return res.json({
          success: true,
          directLogin: true,
          token,
          sessionExpiry: 'always',
          user: {
            id: user._id, name: user.name, email: user.email,
            role: user.role, businessName: user.businessName, contactNumber: user.contactNumber
          }
        });
      }

      const approvedAt = approvedLogin.approvedAt || approvedLogin.createdAt;
      const isWithin3Hours = approvedAt && (new Date() - new Date(approvedAt) <= 3 * 60 * 60 * 1000);

      if (isWithin3Hours) {
        const sessionExpiry = new Date(Date.now() + 3 * 60 * 60 * 1000);
        user.sessionExpiry = sessionExpiry;
        await user.save();

        approvedLogin.status = 'used';
        await approvedLogin.save();

        const token = signSessionToken(user._id);

        return res.json({
          success: true,
          directLogin: true,
          token,
          sessionExpiry: sessionExpiry.toISOString(),
          user: {
            id: user._id, name: user.name, email: user.email,
            role: user.role, businessName: user.businessName, contactNumber: user.contactNumber
          }
        });
      } else {
        approvedLogin.status = 'expired';
        await approvedLogin.save();
      }
    }

    // 4. Check if there's already a pending login request
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
      contactNumber: user.contactNumber || cleanContact,
      businessCard: user.businessCard
    });

    // Create admin notification
    await createAdminNotification({
      title: 'New Login Request',
      message: `${user.name} (${user.businessName || cleanContact}) is requesting login access.`,
      type: 'login',
      link: 'login-requests',
      metadata: { requestId: loginReq._id }
    });

    res.json({ success: true, message: 'Login request sent! You will receive an email once approved by admin.' });
  } catch (err) {
    console.error('Login request error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── PUBLIC: Login with approved credentials ──────────
router.post('/login', async (req, res) => {
  try {
    const { contactNumber, email, password } = req.body;

    // Admin login handling
    if (email && password) {
      const user = await User.findOne({ email: email.toLowerCase() });
      if (!user) {
        return res.status(401).json({ success: false, message: 'Invalid admin credentials' });
      }
      if (user.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Email and password login is reserved for admins. Please log in with your mobile number.' });
      }
      if (!(await user.comparePassword(password))) {
        return res.status(401).json({ success: false, message: 'Invalid admin credentials' });
      }
      const token = signAdminToken(user._id);
      return res.json({
        success: true,
        isAdmin: true,
        token,
        user: { id: user._id, name: user.name, email: user.email, role: user.role }
      });
    }

    if (!contactNumber) {
      return res.status(400).json({ success: false, message: 'Mobile number is required' });
    }

    const cleanContact = contactNumber.trim();
    const user = await User.findOne({
      $or: [{ contactNumber: cleanContact }, { phone: cleanContact }]
    });

    if (!user) {
      return res.status(401).json({ success: false, message: 'Mobile number is not registered. Please register first.' });
    }

    if (user.role === 'admin') {
      return res.status(400).json({ success: false, message: 'Admin accounts must log in with email and password.' });
    }

    if (user.alwaysAccess) {
      const token = signAdminToken(user._id);
      user.sessionExpiry = null;
      await user.save();
      return res.json({
        success: true,
        token,
        sessionExpiry: 'always',
        user: {
          id: user._id, name: user.name, email: user.email,
          role: user.role, businessName: user.businessName, contactNumber: user.contactNumber
        }
      });
    }

    if (user.sessionExpiry && new Date() < new Date(user.sessionExpiry)) {
      const token = signSessionToken(user._id);
      return res.json({
        success: true,
        token,
        sessionExpiry: user.sessionExpiry.toISOString(),
        user: {
          id: user._id, name: user.name, email: user.email,
          role: user.role, businessName: user.businessName, contactNumber: user.contactNumber
        }
      });
    }

    // Check for approved login request
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

    if (approvedLogin.duration === 'always') {
      user.alwaysAccess = true;
      user.sessionExpiry = null;
      await user.save();

      approvedLogin.status = 'used';
      await approvedLogin.save();

      const token = signAdminToken(user._id);
      return res.json({
        success: true,
        token,
        sessionExpiry: 'always',
        user: {
          id: user._id, name: user.name, email: user.email,
          role: user.role, businessName: user.businessName, contactNumber: user.contactNumber
        }
      });
    }

    // Check if older than 3 hours
    const approvedAt = approvedLogin.approvedAt || approvedLogin.createdAt;
    if (approvedAt && (new Date() - new Date(approvedAt) > 3 * 60 * 60 * 1000)) {
      approvedLogin.status = 'expired';
      await approvedLogin.save();
      return res.status(403).json({
        success: false,
        message: 'Approved login request has expired. Please submit a new login request.'
      });
    }

    const sessionExpiry = new Date(Date.now() + 3 * 60 * 60 * 1000);
    user.sessionExpiry = sessionExpiry;
    await user.save();

    approvedLogin.status = 'used';
    await approvedLogin.save();

    const token = signSessionToken(user._id);

    res.json({
      success: true,
      token,
      sessionExpiry: sessionExpiry.toISOString(),
      user: {
        id: user._id, name: user.name, email: user.email,
        role: user.role, businessName: user.businessName, contactNumber: user.contactNumber
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

    if (user.role === 'admin' || user.alwaysAccess) {
      return res.json({ success: true, isAdmin: user.role === 'admin', isAlways: true, sessionExpiry: null, isExpired: false });
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
      phone: request.contactNumber,
      businessName: request.businessName,
      contactNumber: request.contactNumber,
      businessCard: request.businessCard,
      address: request.address || {},
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
    const { duration } = req.body;
    const selectedDuration = duration === 'always' ? 'always' : '3h';

    const loginReq = await LoginRequest.findById(req.params.id);
    if (!loginReq) return res.status(404).json({ success: false, message: 'Request not found' });
    if (loginReq.status === 'approved') {
      return res.status(400).json({ success: false, message: 'Login request already approved' });
    }

    loginReq.status = 'approved';
    loginReq.duration = selectedDuration;
    loginReq.approvedAt = new Date();
    await loginReq.save();

    // If 'always' duration was selected, update user record immediately for permanent access
    if (selectedDuration === 'always') {
      const u = await User.findById(loginReq.user);
      if (u) {
        u.alwaysAccess = true;
        u.sessionExpiry = null;
        await u.save();
      }
    }

    // Send email with link to login page
    const siteUrl = `${req.protocol}://${req.get('host')}`;
    const loginLink = `${siteUrl}/auth?approved=true&mobile=${encodeURIComponent(loginReq.contactNumber || '')}`;

    const durationNotice = selectedDuration === 'always'
      ? `<p style="color: #555;">You have been granted <strong>Always Access</strong> (unlimited access to the portal).</p>`
      : `<p style="color: #555;">Click the button below to go to the login page, enter your registered Mobile Number, and you will be granted <strong>3 hours</strong> of access.</p>`;

    const noteBox = selectedDuration === 'always'
      ? `<div style="background: #E8F5E9; border-left: 4px solid #2E7D32; padding: 12px 16px; border-radius: 4px; margin: 20px 0;">
          <p style="color: #1B5E4B; margin: 0; font-size: 0.85rem;"><strong>✨ Note:</strong> You have unlimited permanent access to the portal.</p>
        </div>`
      : `<div style="background: #FFF8E7; border-left: 4px solid #C8873A; padding: 12px 16px; border-radius: 4px; margin: 20px 0;">
          <p style="color: #8B6914; margin: 0; font-size: 0.85rem;"><strong>⏱ Note:</strong> Your session will automatically expire after 3 hours. After that, you will need to submit a new login request.</p>
        </div>`;

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
          ${durationNotice}
          <div style="text-align: center; margin: 30px 0;">
            <a href="${loginLink}" style="background: #1B5E4B; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">Login Now</a>
          </div>
          ${noteBox}
          <p style="font-size: 0.85rem; color: #999;">Thank you for choosing A.A & Sons!</p>
        </div>
      </div>
    `;
    await sendEmail(loginReq.email, `Login Approved (${selectedDuration === 'always' ? 'Always Access' : '3 Hours'}) — A.A & Sons`, html);

    res.json({ success: true, message: `Login request approved for ${selectedDuration === 'always' ? 'Always Access' : '3 Hours'} and email sent to user` });
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

// ─── ADMIN: Update User Access ─────────────────────────
router.patch('/admin/users/:id/access', protect, adminOnly, async (req, res) => {
  try {
    const { accessType } = req.body; // 'always', '3h', 'revoke'
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (user.role === 'admin') {
      return res.status(403).json({ success: false, message: 'Cannot modify access of admin users' });
    }

    if (accessType === 'always' || accessType === 'infinite') {
      user.alwaysAccess = true;
      user.sessionExpiry = null;
    } else if (accessType === '3h') {
      user.alwaysAccess = false;
      user.sessionExpiry = new Date(Date.now() + 3 * 3600 * 1000);
    } else if (accessType === 'revoke') {
      user.alwaysAccess = false;
      user.sessionExpiry = new Date(0);
    } else {
      return res.status(400).json({ success: false, message: 'Invalid accessType' });
    }

    await user.save();
    res.json({ success: true, message: 'User access updated successfully', user });
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
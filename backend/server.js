// backend/server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const compression = require('compression');
require('dotenv').config();

const app = express();

// ─── Compression (GZIP) ──────────────────────────────────
// Reduces payload size by ~70% — critical for Core Web Vitals & SEO
app.use(compression({ level: 6, threshold: 1024 }));

// ─── Security Middleware ──────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ─── CORS ───────────────────────────────────────────────
app.use(cors({
  origin: true, 
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// ─── Body Parsers ───────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ─── Detect environment ────────────────────────────────
const isVercel = !!process.env.VERCEL;

// ─── SEO & System Routes (only for local/non-Vercel) ───
if (!isVercel) {
  app.get('/sitemap.xml', (req, res) => {
    res.header('Content-Type', 'application/xml');
    res.sendFile(path.resolve(__dirname, '../frontend/sitemap.xml'));
  });

  app.get('/robots.txt', (req, res) => {
    res.header('Content-Type', 'text/plain');
    res.sendFile(path.resolve(__dirname, '../frontend/robots.txt'));
  });

  // ─── Serve Frontend Static Files (with aggressive caching for perf) ───
  // CSS/JS/images: cache 30 days (improves Core Web Vitals & LCP)
  // This runs BEFORE the SEO route so HTML pages never get cached
  app.use(express.static(path.join(__dirname, '../frontend'), {
    maxAge: '30d',
    etag: true,
    lastModified: true,
    setHeaders: (res, filePath) => {
      // HTML pages: no-cache (always fresh for crawlers)
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      }
      // XML / TXT: short cache
      else if (filePath.endsWith('.xml') || filePath.endsWith('.txt')) {
        res.setHeader('Cache-Control', 'public, max-age=3600');
      }
      // Static assets: JS and CSS should be checked more often if not hashed
      else if (filePath.endsWith('.js') || filePath.endsWith('.css')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      }
      // Images and other media: can stay long-term
      else {
        res.setHeader('Cache-Control', 'public, max-age=2592000');
      }
    }
  }));
}

// ─── API Routes ─────────────────────────────────────────
app.use('/api/auth',       require('./routes/auth'));
app.use('/api/products',   require('./routes/products'));
app.use('/api/orders',     require('./routes/orders'));
app.use('/api/cart',       require('./routes/cart'));
app.use('/api/payment',    require('./routes/payment'));
app.use('/api/upload',     require('./routes/upload'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/faqs',       require('./routes/faqs'));
app.use('/api/bulk-enquiry', require('./routes/bulkEnquiry'));
app.use('/api/promotions', require('./routes/promotion'));
app.use('/api/notifications', require('./routes/notifications'));


// ─── Serve Frontend Pages (only for local/non-Vercel) ───
if (!isVercel) {
  app.get('/', (req, res) => res.sendFile(path.join(__dirname, '../frontend/index.html')));
  app.get('/products',             (req, res) => res.sendFile(path.join(__dirname, '../frontend/pages/products.html')));
  app.get('/product',              (req, res) => res.sendFile(path.join(__dirname, '../frontend/pages/product-detail.html')));
  app.get('/product-detail',       (req, res) => res.sendFile(path.join(__dirname, '../frontend/pages/product-detail.html')));
  app.get('/cart',                 (req, res) => res.sendFile(path.join(__dirname, '../frontend/pages/cart.html')));
  app.get('/checkout',             (req, res) => res.sendFile(path.join(__dirname, '../frontend/pages/checkout.html')));
  app.get('/payment',              (req, res) => res.sendFile(path.join(__dirname, '../frontend/pages/payment.html')));
  app.get('/order-success',        (req, res) => res.sendFile(path.join(__dirname, '../frontend/pages/order-success.html')));
  app.get('/faq',                  (req, res) => res.sendFile(path.join(__dirname, '../frontend/pages/faq.html')));
  app.get('/invoice',              (req, res) => res.sendFile(path.join(__dirname, '../frontend/pages/invoice.html')));
  app.get('/update-order',         (req, res) => res.sendFile(path.join(__dirname, '../frontend/pages/update-order.html')));
  app.get('/admin-order-details',  (req, res) => res.sendFile(path.join(__dirname, '../frontend/pages/admin-order-details.html')));
  app.get('/worker-bill',          (req, res) => res.sendFile(path.join(__dirname, '../frontend/pages/worker-bill.html')));
  app.get('/bill',                 (req, res) => res.sendFile(path.join(__dirname, '../frontend/pages/bill.html')));
  app.get('/my-orders',            (req, res) => res.sendFile(path.join(__dirname, '../frontend/pages/my-orders.html')));
  app.get('/admin',                (req, res) => res.sendFile(path.join(__dirname, '../frontend/pages/admin.html')));
  app.get('/admin-bulk-enquiries', (req, res) => res.sendFile(path.join(__dirname, '../frontend/pages/admin-bulk-enquiries.html')));
  app.get('/auth',                (req, res) => res.sendFile(path.join(__dirname, '../frontend/pages/auth.html')));
}


// ─── Improved 404 Handler ────────────────────────────────
app.use((req, res) => {
  // 1. Handle API 404s
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ success: false, message: 'Route not found' });
  }

  // 2. Prevent "Soft 404s" for system files (Crucial for Google)
  if (req.path.endsWith('.xml') || req.path.endsWith('.txt') || req.path.endsWith('.ico')) {
    return res.status(404).send('File Not Found');
  }

  // 3. Fallback to index.html for Single Page Application routing (local only)
  if (!isVercel) {
    return res.sendFile(path.join(__dirname, '../frontend/index.html'));
  }

  res.status(404).send('Not Found');
});

// ─── Global Error Handler ────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error'
  });
});

// ─── Crash Handling ─────────────────────────────────────
process.on('uncaughtException',  err => { console.error('💥 Uncaught Exception:', err); });
process.on('unhandledRejection', err => { console.error('💥 Unhandled Rejection:', err); });

// ─── Database + Start (only when running directly, NOT on Vercel) ───
if (!isVercel) {
  mongoose.connect(process.env.MONGODB_URI)
    .then(async () => {
      console.log('✅ MongoDB Connected');
      
      try {
        await seedAdmin();
        await seedCategories();
      } catch (err) {
        console.warn('⚠️ Seeding warning:', err.message);
      }

      const PORT = process.env.PORT || 5000;
      const HOST = '0.0.0.0';
      app.listen(PORT, HOST, () => {
        console.log(`🚀 Server running on ${HOST}:${PORT}`);
      });
    })
    .catch(err => {
      console.error('❌ MongoDB connection failed:', err.message);
      setTimeout(() => process.exit(1), 1000);
    });
}

// ─── Seed Admin User ─────────────────────────────────────
async function seedAdmin() {
  const User = require('./models/User');
  const bcrypt = require('bcryptjs');
  const existing = await User.findOne({ email: process.env.ADMIN_EMAIL });
  if (!existing) {
    const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'abbasalisons@1950', 12);
    await User.create({
      name: 'Admin',
      email: process.env.ADMIN_EMAIL || 'admin@aasons.com',
      password: hash,
      role: 'admin'
    });
    console.log('✅ Admin user seeded');
  }
}

// ─── Seed Categories ─────────────────────────────────────
async function seedCategories() {
  const Category = require('./models/Category');
  const count = await Category.countDocuments();
  if (count === 0) {
    const list = [
      'Sherwani', 'Saree', 'Lehenga', 'Dupatta', 'Bhagwan Poshak',
      'Pagdi & Safa', 'Jewellery', 'Accessories', 'Wedding Décor'
    ];
    for (const name of list) {
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      await Category.create({ name, slug, description: `The best ${name} collection`, active: true });
    }
    console.log('✅ Categories seeded');
  }
}

module.exports = app;
// api/index.js — Vercel Serverless Function entry point
const connectDB = require('./db');

// Load environment variables
require('dotenv').config({ path: require('path').resolve(__dirname, '../backend/.env') });

// Import the Express app (without listen)
const app = require('../backend/server');

// Seed functions
async function seedAdmin() {
  const User = require('../backend/models/User');
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

async function seedCategories() {
  const Category = require('../backend/models/Category');
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

// Track if seeding has been done in this container
let seeded = false;

module.exports = async (req, res) => {
  // Ensure DB is connected before handling any request
  await connectDB();

  // Run seeds only once per container warm-up
  if (!seeded) {
    try {
      await seedAdmin();
      await seedCategories();
    } catch (err) {
      console.warn('⚠️ Seeding warning:', err.message);
    }
    seeded = true;
  }

  // Delegate to Express
  return app(req, res);
};

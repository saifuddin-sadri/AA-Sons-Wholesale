// backend/scripts/resetAdminPassword.js
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../backend/.env') });
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

(async () => {
  try {
    console.log('Loaded MONGODB_URI:', process.env.MONGODB_URI);
  if (!process.env.MONGODB_URI) {
    console.error('❌ MONGODB_URI is not defined in .env');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGODB_URI);

    const adminEmail = process.env.ADMIN_EMAIL;
    const newHash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 12);
    const result = await User.updateOne({ email: adminEmail }, { $set: { password: newHash } });
    console.log('Admin password reset result:', result);
    process.exit(0);
  } catch (err) {
    console.error('Error resetting admin password:', err);
  console.error('MONGODB_URI at error time:', process.env.MONGODB_URI);
  process.exit(1);
  }
})();

// backend/models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name:          { type: String, required: true, trim: true },
  email:         { type: String, required: true, unique: true, lowercase: true, trim: true },
  password:      { type: String, required: false },
  phone:         { type: String, trim: true },
  role:          { type: String, enum: ['user', 'admin'], default: 'user' },
  businessName:  { type: String, trim: true },
  contactNumber: { type: String, trim: true },
  businessCard:  { type: String, default: '' },
  isApproved:    { type: Boolean, default: false },
  sessionExpiry: { type: Date },
  address: {
    street:  String,
    city:    String,
    state:   String,
    pincode: String
  }
}, { timestamps: true });

userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  // Skip hashing if password is already hashed (e.g., from registration request)
  if (this.$skipPasswordHash) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
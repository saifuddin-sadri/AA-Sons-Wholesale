// backend/models/LoginRequest.js
const mongoose = require('mongoose');

const loginRequestSchema = new mongoose.Schema({
  user:          { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name:          { type: String, trim: true },
  email:         { type: String, lowercase: true, trim: true },
  businessName:  { type: String, trim: true },
  contactNumber: { type: String, trim: true },
  businessCard:  { type: String, default: '' },
  status:        { type: String, enum: ['pending', 'approved', 'rejected', 'used'], default: 'pending' },
  approvedAt:    { type: Date }
}, { timestamps: true });

module.exports = mongoose.model('LoginRequest', loginRequestSchema);

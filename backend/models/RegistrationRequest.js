// backend/models/RegistrationRequest.js
const mongoose = require('mongoose');

const registrationRequestSchema = new mongoose.Schema({
  name:          { type: String, required: true, trim: true },
  email:         { type: String, required: true, lowercase: true, trim: true },
  password:      { type: String, required: true },
  businessName:  { type: String, required: true, trim: true },
  contactNumber: { type: String, required: true, trim: true },
  businessCard:  { type: String, default: '' }, // Cloudinary URL
  address: {
    street:  { type: String, trim: true },
    city:    { type: String, trim: true },
    state:   { type: String, trim: true },
    pincode: { type: String, trim: true }
  },
  status:        { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' }
}, { timestamps: true });

module.exports = mongoose.model('RegistrationRequest', registrationRequestSchema);

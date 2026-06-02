// backend/models/BulkEnquiry.js
const mongoose = require('mongoose');

const bulkEnquirySchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: [true, 'Name is required'],
    trim: true 
  },
  contactNumber: { 
    type: String, 
    required: [true, 'Contact number is required'],
    trim: true 
  },
  email: { 
    type: String, 
    required: [true, 'Email is required'],
    trim: true,
    lowercase: true,
    match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Please fill a valid email address']
  },
  selectedProducts: { 
    type: [String], 
    required: [true, 'At least one product must be selected'] 
  },
  message: { 
    type: String,
    trim: true 
  },
  status: { 
    type: String, 
    enum: ['Pending', 'Contacted', 'Closed'], 
    default: 'Pending' 
  }
}, { timestamps: true });

module.exports = mongoose.model('BulkEnquiry', bulkEnquirySchema);

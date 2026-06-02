const mongoose = require('mongoose');

const shippingTokenSchema = new mongoose.Schema({
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true
  },
  token: {
    type: String,
    required: true,
    unique: true
  },
  isUsed: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: '30d' // Automatically cleanup after 30 days
  }
});

module.exports = mongoose.model('ShippingToken', shippingTokenSchema);

// backend/models/Promotion.js
const mongoose = require('mongoose');

const promotionSchema = new mongoose.Schema({
  festiveEnabled: {
    type: Boolean,
    default: false
  },
  saleMessages: [{
    type: String
  }],
  festiveProductIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product'
  }],
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Promotion', promotionSchema);

const mongoose = require('mongoose');

const faqSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String, required: false },
  query: { type: String, required: true },
  isAnswered: { type: Boolean, default: false },
  answer: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('FAQ', faqSchema);

// backend/models/Product.js
const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true },
  description: { type: String, required: true },
  price:       { type: Number, required: true, min: 0 },
  mrp:         { type: Number, min: 0 },
  category:    { type: [String], required: true },
  images:      [{ url: String, public_id: String }],
  stock:       { type: Number, default: 9999, min: 0 },
  minQuantity: { type: Number, default: 1, min: 1 },
  weight:      { type: Number, default: 0, min: 0 },
  sku:         { type: String, trim: true },
  hsn:         { type: String, trim: true },
  unit:        { type: String, enum: ['kg', 'm', 'pcs', 'packet'], default: 'pcs' },
  featured:    { type: Boolean, default: false },
  active:      { type: Boolean, default: true },
  tags:        [String],
  colors:      [String],
  variations: [{
    color: { type: String, trim: true },
    size:  { type: String, trim: true },
    price: { type: Number, required: true, min: 0 },
    mrp:   { type: Number, min: 0 },
    stock: { type: Number, default: 9999, min: 0 },
    weight:{ type: Number, min: 0 },
    bulkPrices: [{
      quantity: { type: Number, required: true },
      unit:     { type: String, default: 'Pcs' },
      price:    { type: Number, required: true },
      mrp:      { type: Number }
    }]
  }],
  bulkPrices: [{
    quantity: { type: Number, required: true },
    unit:     { type: String, default: 'Pcs' },
    price:    { type: Number, required: true },
    mrp:      { type: Number }
  }],
  ratings: {
    average: { type: Number, default: 0 },
    count:   { type: Number, default: 0 }
  }
}, { timestamps: true });

productSchema.index({ name: 'text', description: 'text', tags: 'text' });
productSchema.index({ category: 1 });
productSchema.index({ active: 1, featured: -1 });

module.exports = mongoose.model('Product', productSchema);
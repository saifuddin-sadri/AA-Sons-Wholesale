// backend/models/Order.js
const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  product:     { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  variationId: { type: String },
  color:       { type: String },
  size:        { type: String },
  sku:         { type: String },
  name:        { type: String, required: true },
  image:       String,
  price:       { type: Number, required: true },
  quantity:    { type: Number, required: true, min: 1 }
});

const orderSchema = new mongoose.Schema({
  orderNumber: { type: String, unique: true },
  user:        { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  guestInfo: {
    name:    String,
    email:   String,
    phone:   String
  },
  items:        [orderItemSchema],
  shippingAddress: {
    name:    { type: String, required: true },
    phone:   { type: String, required: true },
    email:   String,
    street:  { type: String, required: true },
    city:    { type: String, required: true },
    state:   { type: String, required: true },
    pincode: { type: String, required: true }
  },
  subtotal:     { type: Number, required: true },
  shippingCost: { type: Number, default: 0 },
  total:        { type: Number, required: true },
  paymentMethod: { type: String, enum: ['online', 'upi', 'cod'], default: 'cod' },
  paymentStatus: { type: String, enum: ['pending', 'paid', 'failed', 'refunded'], default: 'pending' },
  paymentId:     String,
  paymentScreenshot: String,
  razorpayOrderId: String,
  status: {
    type: String,
    enum: ['payment_pending', 'payment_received', 'placed', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'],
    default: 'placed'
  },
  statusHistory: [{
    status:    String,
    note:      String,
    updatedAt: { type: Date, default: Date.now }
  }],
  isStorePickup: { type: Boolean, default: false },
  tracking: {
    id:      String,
    company: String,
    url:     String,
    phone:   String
  },
  notes: String,
  isManual: { type: Boolean, default: false }
}, { timestamps: true });

orderSchema.pre('save', function(next) {
  if (!this.orderNumber) {
    const ts = Date.now().toString(36).toUpperCase();
    const rand = Math.random().toString(36).substring(2, 5).toUpperCase();
    this.orderNumber = `AAS-${ts}-${rand}`;
  }
  next();
});

module.exports = mongoose.model('Order', orderSchema);
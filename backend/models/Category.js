const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  slug: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  parent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    default: null
  },
  image: {
    url: String,
    public_id: String
  },
  posters: [{
    url: String,
    public_id: String
  }],
  displayType: {
    type: String,
    enum: ['card', 'tabular'],
    default: 'card'
  },
  active: {
    type: Boolean,
    default: true
  }
}, { timestamps: true });

// Pre-save hook to generate slug if not provided (though we'll handle it in routes too)
categorySchema.pre('save', function(next) {
  if (this.isModified('name') && !this.slug) {
    this.slug = this.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  }
  next();
});

module.exports = mongoose.model('Category', categorySchema);

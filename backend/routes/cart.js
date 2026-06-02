// backend/routes/cart.js
// Cart is primarily handled client-side (localStorage)
// This route is for syncing cart data when user logs in
const express = require('express');
const router = express.Router();
const Product = require('../models/Product');

// Validate cart items (check stock & prices)
router.post('/validate', async (req, res) => {
  try {
    const { items } = req.body;
    if (!items?.length) return res.json({ success: true, items: [] });

    const validated = [];
    const warnings = [];

    for (const item of items) {
      const product = await Product.findById(item.productId).select('name price stock active images variations');
      if (!product || !product.active) {
        warnings.push(`"${item.name}" is no longer available`);
        continue;
      }
      
      let stockLevel = product.stock;
      if (item.variationId && product.variations && product.variations.length > 0) {
        const variant = product.variations.id(item.variationId);
        if (variant && variant.stock !== undefined) {
          stockLevel = variant.stock;
        }
      }

      validated.push({
        productId: product._id,
        name: product.name,
        price: product.price,
        image: product.images[0]?.url || '',
        quantity: item.quantity,
        stock: stockLevel
      });
    }

    res.json({ success: true, items: validated, warnings });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
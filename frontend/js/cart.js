// frontend/js/cart.js
const Cart = (() => {
  const KEY = 'aa_cart';

  const get = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } };
  const save = (items) => localStorage.setItem(KEY, JSON.stringify(items));
  const genId = (pid, vid, color) => pid + (vid ? '_' + vid : '') + (color ? '_' + color : '');

  const add = (product, qty = 1, variation = null) => {
    const items = get();
    const vid = variation ? variation._id : null;
    const color = variation ? variation.color : null;
    const cid = genId(product._id, vid, color);
    const idx = items.findIndex(i => i.cartItemId === cid || (i.productId === product._id && !i.cartItemId));

    let maxStock = variation && variation.stock !== undefined ? variation.stock : (product.stock !== undefined ? product.stock : 999);
    if (variation && variation._id && variation._id.startsWith('bulk_')) {
      const bq = parseInt(variation._id.split('_')[1]);
      if (!isNaN(bq) && bq > 0) maxStock = Math.floor(maxStock / bq);
    }

    if (idx > -1) {
      items[idx].quantity = Math.min(parseInt(items[idx].quantity) + parseInt(qty), maxStock);
      if (!items[idx].cartItemId) items[idx].cartItemId = cid;
      if (vid) items[idx].variationId = vid;
    } else {
      let itemName = product.name;
      if (variation && (variation.color || variation.size)) {
         let varArr = [];
         if(variation.color) varArr.push(variation.color);
         if(variation.size) varArr.push(variation.size);
         itemName += ` (${varArr.join(' - ')})`;
      }

      items.push({
        cartItemId: cid,
        productId: product._id,
        variationId: vid,
        color: variation ? variation.color : null,
        size: variation ? variation.size : null,
        name: itemName,
        category: product.category,
        price: (variation && variation.price) ? variation.price : product.price,
        image: product.images?.[0]?.url || '',
        quantity: parseInt(qty),
        minQuantity: parseInt(product.minQuantity) || 1,
        stock: maxStock,
        recentSales: product.recentSales || 0
      });
    }
    save(items);
    updateBadge();
    showToast(`✅ ${product.name} added to cart!`, 'success');
  };

  const remove = (cartItemId) => {
    save(get().filter(i => i.cartItemId !== cartItemId && i.productId !== cartItemId));
    updateBadge();
  };

  const setQty = (cartItemId, qty) => {
    const items = get();
    const idx = items.findIndex(i => i.cartItemId === cartItemId || i.productId === cartItemId);
    if (idx > -1) {
      const minQty = parseInt(items[idx].minQuantity) || 1;
      let numericQty = parseInt(qty);
      if (isNaN(numericQty)) numericQty = minQty;
      if (numericQty < minQty) {
        if (numericQty <= 0) { remove(cartItemId); return; }
        numericQty = minQty;
      }
      items[idx].quantity = Math.min(numericQty, items[idx].stock || 999);
      save(items);
      updateBadge();
    }
  };

  const updateVariant = (cartItemId, newVariation, product) => {
    const items = get();
    const idx = items.findIndex(i => i.cartItemId === cartItemId || i.productId === cartItemId);
    if (idx === -1) return;

    const oldQty = items[idx].quantity;
    // Remove the old item
    items.splice(idx, 1);
    save(items);
    
    // Add as new variant (merging handled by add)
    add(product, oldQty, newVariation);
  };

  const clear = () => { localStorage.removeItem(KEY); updateBadge(); };

  const total = () => get().reduce((sum, i) => sum + i.price * i.quantity, 0);
  const count = () => get().reduce((sum, i) => sum + i.quantity, 0);

  const updateBadge = () => {
    const badges = document.querySelectorAll('.cart-badge');
    const c = count();
    badges.forEach(b => { b.textContent = c; b.style.display = c ? 'flex' : 'none'; });
  };

  return { get, add, remove, setQty, updateVariant, clear, total, count, updateBadge };
})();

// ── Toast ────────────────────────────────────────────────
function showToast(msg, type = 'success', duration = 3000) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.className = `toast ${type} show`;
  setTimeout(() => toast.classList.remove('show'), duration);
}

// ── Format currency ───────────────────────────────────────
function formatRupees(n) {
  return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

// ── Init badges on every page ─────────────────────────────
document.addEventListener('DOMContentLoaded', () => Cart.updateBadge());
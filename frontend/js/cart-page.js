// frontend/js/cart-page.js
document.addEventListener('DOMContentLoaded', async () => {
  initNavbar();
  await renderCart();
  renderRecommendations();

  const toggle = document.getElementById('cartStorePickupToggle');
  if (toggle) {
    toggle.checked = sessionStorage.getItem('storePickup') === 'true';
    toggle.addEventListener('change', (e) => {
      sessionStorage.setItem('storePickup', e.target.checked ? 'true' : 'false');
      renderSummary(Cart.get());
    });
  }
});

async function renderCart() {
  const items = Cart.get();
  const emptyEl  = document.getElementById('emptyCart');
  const layoutEl = document.getElementById('cartLayout');

  if (!items.length) {
    emptyEl.style.display  = 'block';
    layoutEl.style.display = 'none';
    return;
  }

  emptyEl.style.display  = 'none';
  layoutEl.style.display = 'grid';

  await renderItems(items);
  renderSummary(items);
}

async function renderItems(items) {
  const list = document.getElementById('cartItemsList');
  document.getElementById('cartItemCount').textContent = items.reduce((s, i) => s + i.quantity, 0);

  // Fetch product data for all unique products in cart to get available variations
  const productIds = [...new Set(items.map(i => i.productId))];
  const productCache = {};
  await Promise.all(productIds.map(async id => {
    try {
      const resp = await API.getProduct(id);
      productCache[id] = resp.product;
    } catch (err) { console.error('Failed to fetch product for cart:', id, err); }
  }));

  list.innerHTML = items.map(item => {
    const product = productCache[item.productId];
    const hasColors = product?.colors && product.colors.length > 0;
    const hasSizes  = product?.variations && product.variations.length > 0;
    
    let variantsHTML = '';
    if (hasColors || hasSizes) {
      variantsHTML = `<div class="cart-item-variants">`;
      
      if (hasColors) {
        variantsHTML += `
          <div class="cart-var-group">
            <span class="cart-var-label">Color:</span>
            <div class="cart-var-options">
              ${product.colors.map(c => `
                <button class="cart-var-btn ${item.color === c ? 'active' : ''}" 
                  onclick="changeItemVariant('${item.cartItemId}', '${c}', 'color')">${c}</button>
              `).join('')}
            </div>
          </div>`;
      }
      
      if (hasSizes) {
        const sizes = [...new Set(product.variations.map(v => v.size).filter(Boolean))];
        variantsHTML += `
          <div class="cart-var-group">
            <span class="cart-var-label">Size:</span>
            <div class="cart-var-options">
              ${sizes.map(s => `
                <button class="cart-var-btn ${item.size === s ? 'active' : ''}" 
                  onclick="changeItemVariant('${item.cartItemId}', '${s}', 'size')">${s}</button>
              `).join('')}
            </div>
          </div>`;
      }
      
      variantsHTML += `</div>`;
    }

    return `
      <div class="cart-item animate-in" data-id="${item.productId}">
        <div class="cart-item-img">
          ${item.image
            ? `<img src="${item.image}" alt="${item.name}" loading="lazy"/>`
            : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:1.8rem;background:var(--cream)">🛍️</div>`}
        </div>
        <div class="cart-item-details">
          <div class="cart-item-cat">${Array.isArray(item.category) ? item.category.join(', ') : (item.category || '')}</div>
          <div class="cart-item-name">${item.name}</div>
          ${item.recentSales > 0 ? `<div class="product-recent-sales" style="font-size:0.65rem; margin-top:2px;">🔥 ${item.recentSales} sold in last 24h</div>` : ''}
          <div class="cart-item-price price-pulse">${formatRupees(item.price)}</div>
          
          ${variantsHTML}
          
          <div class="qty-controls">
            <button class="qty-btn" onclick="changeQty('${item.cartItemId}', ${parseInt(item.quantity) - 1})">−</button>
            <input type="number" class="qty-val" value="${item.quantity}" min="${item.minQuantity || 1}" max="${item.stock || 999}" step="1" 
                   onchange="handleCartQtyInput(event, '${item.cartItemId}', ${item.stock || 999}, ${item.minQuantity || 1})" 
                   style="width: 40px; text-align: center; border: 1px solid var(--light-gray); border-radius: 4px; outline: none; -moz-appearance: textfield;" />
            <button class="qty-btn" onclick="changeQty('${item.cartItemId}', ${parseInt(item.quantity) + 1})">+</button>
          </div>
          <span class="cart-item-remove" onclick="removeItem('${item.cartItemId}')">✕ Remove</span>
        </div>
        <div class="cart-item-subtotal price-pulse">${formatRupees(item.price * item.quantity)}</div>
      </div>`;
  }).join('');
}

// Global cache for products to avoid re-fetching on small re-renders
let currentPageProductCache = {};

async function changeItemVariant(cartItemId, newValue, type) {
  const items = Cart.get();
  const item = items.find(i => i.cartItemId === cartItemId);
  if (!item) return;

  try {
    let product = currentPageProductCache[item.productId];
    if (!product) {
      const resp = await API.getProduct(item.productId);
      product = resp.product;
      currentPageProductCache[item.productId] = product;
    }

    let newColor = type === 'color' ? newValue : item.color;
    let newSize  = type === 'size'  ? newValue : item.size;

    let variation = { size: newSize };
    if (newColor) variation.color = newColor;

    // Fast-path: Preserve bulk selection metadata if it's a bulk item
    const isBulk = item.variationId && item.variationId.startsWith('bulk_');
    if (isBulk && type === 'color') {
      variation._id = item.variationId;
      variation.price = item.price; // keep original cartpack price
      variation.stock = item.stock; 
      variation.weight = item.weight;
    } else {
      // Find the variation object matching new selection (Standard Items)
      let newVar = null;
      if (product.variations && product.variations.length > 0) {
        newVar = product.variations.find(v => v.size === newSize);
      }
      if (newVar) {
        variation = { ...newVar };
        if (newColor) variation.color = newColor;
      }
    }

    Cart.updateVariant(cartItemId, variation, product);
    renderCart(); // Refresh UI
  } catch (err) {
    console.error('Failed to change variant:', err);
    showToast('Failed to update variant', 'error');
  }
}

function renderSummary(items) {
  const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
  // Default to 1kg if weight is totally unassigned, otherwise sum exact weight
  let totalWeight = items.reduce((w, i) => w + (parseFloat(i.weight) || 0) * i.quantity, 0);
  if (totalWeight === 0 && items.length > 0) {
    totalWeight = 1; // Fallback so shipping isn't 0
  }
  
  const isStorePickup = sessionStorage.getItem('storePickup') === 'true';
  const shippingEl = document.getElementById('summaryShipping');
  if (shippingEl) {
    shippingEl.textContent = 'FREE';
  }

  document.getElementById('summarySubtotal').textContent = formatRupees(subtotal);
  const weightEl = document.getElementById('summaryWeight');
  if (weightEl) {
    weightEl.textContent = totalWeight.toFixed(3) + ' kg';
  }
  document.getElementById('summaryTotal').textContent = formatRupees(subtotal);
}

async function changeQty(cartItemId, newQty) {
  const item = Cart.get().find(i => i.cartItemId === cartItemId || i.productId === cartItemId);
  if (!item) return;
  
  const minQty = item.minQuantity || 1;
  const maxQty = item.stock || 999;

  if (newQty > maxQty) {
    showToast(`Only ${maxQty} units left in stock!`, 'error');
    newQty = maxQty;
  }
  
  if (newQty < minQty) {
    if (newQty <= 0) {
      removeItem(cartItemId);
      return;
    }
    showToast(`Minimum order quantity is ${minQty}`, 'warning');
    newQty = minQty;
  }

  Cart.setQty(cartItemId, newQty);
  await renderCart();
}

async function handleCartQtyInput(e, cartItemId, stock, minQty = 1) {
  let typedQty = parseInt(e.target.value);
  if (isNaN(typedQty)) typedQty = minQty;

  if (typedQty < minQty) {
    if (typedQty <= 0) {
      removeItem(cartItemId);
      return;
    }
    showToast(`Minimum order quantity is ${minQty}`, 'warning');
    typedQty = minQty;
    e.target.value = minQty;
  }

  if (typedQty > stock) {
    showToast(`Only ${stock} units left in stock!`, 'error');
    typedQty = stock;
    e.target.value = stock;
  }
  
  await changeQty(cartItemId, typedQty);
}

async function removeItem(cartItemId) {
  Cart.remove(cartItemId);
  showToast('Item removed from cart', 'info');
  await renderCart();
}

async function renderRecommendations() {
  const list = document.getElementById('recommendationsList');
  if (!list) return;

  try {
    const data = await API.getProducts({ featured: true, limit: 4 });
    const products = data.products || [];

    if (!products.length) {
      document.getElementById('cartSuggestions').style.display = 'none';
      return;
    }

    list.innerHTML = products.map(p => `
      <div class="mini-product-card">
        <div class="mini-img" style="position:relative;">
          <a href="/product?id=${p._id}">
            ${p.images?.[0]?.url 
              ? `<img src="${p.images[0].url}" alt="${p.name}" loading="lazy"/>`
              : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:2rem;background:var(--cream)">🛍️</div>`}
          </a>
        </div>
        <div class="mini-info">
          <a href="/product?id=${p._id}" style="text-decoration: none;">
            <div class="mini-name">${p.name}</div>
          </a>
          ${p.recentSales > 0 ? `<div class="product-recent-sales">🔥 ${p.recentSales} sold</div>` : ''}
          <div class="mini-price">${formatRupees(p.price)}</div>
          <button class="btn-mini-add" onclick="quickAdd('${p._id}')">Add to Cart</button>
        </div>
      </div>`).join('');
  } catch (err) {
    console.error('Failed to load recommendations', err);
    document.getElementById('cartSuggestions').style.display = 'none';
  }
}

async function quickAdd(productId) {
  try {
    const res = await API.getProduct(productId);
    const p = res.product;
    Cart.add(p, p.minQuantity || 1);
    await renderCart();
  } catch (err) {
    showToast('Failed to add product', 'error');
  }
}

function initNavbar() {
  const navbar    = document.getElementById('navbar');
  const hamburger = document.getElementById('hamburger');
  const navLinks  = document.getElementById('navLinks');
  hamburger?.addEventListener('click', () => {
    hamburger.classList.toggle('open');
    navLinks.classList.toggle('open');
  });
}
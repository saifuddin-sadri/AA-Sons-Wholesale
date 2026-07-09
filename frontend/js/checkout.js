const BRANCH_CITIES = [
  'Kolkata', 'Bengaluru', 'Delhi', 'Mumbai', 'Ahmedabad', 'Amritsar', 'Bhagalpur', 'Bhopal', 'Bhubaneswar',
  'Chennai', 'Coimbatore', 'Cuttack', 'Guwahati', 'Indore', 'Jabalpur', 'Jaipur', 'Jammu',
  'Jodhpur', 'Kanpur', 'Ludhiana', 'Nashik', 'Patna', 'Pune', 'Raigarh', 'Ranchi', 'Raipur',
  'Salem', 'Siliguri', 'Surat', 'Varanasi', 'Ujjain', 'Dewas', 'Kalyan'
];

let currentUser = null;
let orderItems = [];

document.addEventListener('DOMContentLoaded', async () => {
  orderItems = Cart.get();
  if (!orderItems.length) {
    window.location.href = '/cart';
    return;
  }

  try {
    const userRes = await API.me();
    if (userRes && userRes.success && userRes.user) {
      currentUser = userRes.user;
      renderCheckoutDetails();
      renderOrderSummary();
      initPlaceOrder();
    } else {
      throw new Error('Failed to get user profile details');
    }
  } catch (err) {
    showToast('Failed to load user profile. Please login again.', 'error');
    setTimeout(() => {
      window.location.href = '/auth';
    }, 2000);
  }
});

function calculateShipping(items, city = '') {
  const isStorePickup = sessionStorage.getItem('storePickup') === 'true';
  if (isStorePickup) return 0;

  let totalWeight = items.reduce((w, i) => w + (parseFloat(i.weight) || 0) * i.quantity, 0);
  if (totalWeight === 0 && items.length > 0) totalWeight = 1;
  const isBranch = BRANCH_CITIES.some(c => c.toLowerCase() === city.trim().toLowerCase());
  const rate = isBranch ? 75 : 100;
  return Math.ceil(totalWeight) * rate;
}

function renderCheckoutDetails() {
  const container = document.getElementById('checkoutUserDetails');
  if (!container) return;

  const isStorePickup = sessionStorage.getItem('storePickup') === 'true';

  if (isStorePickup) {
    container.innerHTML = `
      <div style="background: rgba(200, 135, 58, 0.08); padding: 16px; border-radius: 8px; border: 1px solid rgba(200, 135, 58, 0.2);">
        <p style="font-weight: 700; color: var(--gold); font-size: 1.05rem; margin-bottom: 6px;">🏪 Store Pickup Selected</p>
        <p>Your order will be prepared and held for pickup at our main branch.</p>
        <p style="font-size: 0.85rem; margin-top: 8px; color: var(--mid);">
          <strong>Store Address:</strong> Shop no: 06, Marothiya Bazar, near Bajaj Khana Chowk, Indore (M.P.)
        </p>
      </div>
      <div style="margin-top: 10px;">
        <p><strong>Contact Person:</strong> ${currentUser.name}</p>
        <p><strong>Business Name:</strong> ${currentUser.businessName || '—'}</p>
        <p><strong>Phone:</strong> ${currentUser.contactNumber || currentUser.phone || '—'}</p>
        <p><strong>Email:</strong> ${currentUser.email}</p>
      </div>
    `;
  } else {
    const addr = currentUser.address || {};
    const street = addr.street || '—';
    const city = addr.city || '—';
    const state = addr.state || '—';
    const pincode = addr.pincode || '—';

    container.innerHTML = `
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
        <div>
          <p style="color: var(--mid); font-size: 0.78rem; text-transform: uppercase; font-weight: 600;">Recipient</p>
          <p style="font-weight: 600; font-size: 1rem;">${currentUser.name}</p>
          <p>${currentUser.businessName ? `🏢 ${currentUser.businessName}` : ''}</p>
        </div>
        <div>
          <p style="color: var(--mid); font-size: 0.78rem; text-transform: uppercase; font-weight: 600;">Contact Details</p>
          <p>📞 ${currentUser.contactNumber || currentUser.phone || '—'}</p>
          <p>✉️ ${currentUser.email}</p>
        </div>
      </div>
      <div style="margin-top: 14px; padding-top: 14px; border-top: 1px dashed rgba(0,0,0,0.08);">
        <p style="color: var(--mid); font-size: 0.78rem; text-transform: uppercase; font-weight: 600; margin-bottom: 4px;">Shipping Address</p>
        <p style="font-weight: 500;">${street}</p>
        <p>${city}, ${state} — <strong>${pincode}</strong></p>
      </div>
    `;
  }
}

function renderOrderSummary() {
  const container = document.getElementById('checkoutOrderItems');
  if (!container) return;

  container.innerHTML = orderItems.map(item => `
    <div class="order-item-row" style="display: flex; gap: 12px; margin-bottom: 16px; align-items: center; border-bottom: 1px solid rgba(0,0,0,0.04); padding-bottom: 12px;">
      <div class="order-item-img" style="width: 50px; height: 50px; border-radius: 6px; overflow: hidden; background: var(--cream); flex-shrink: 0;">
        ${item.image
          ? `<img src="${item.image}" alt="${item.name}" style="width: 100%; height: 100%; object-fit: cover;"/>`
          : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:1.2rem;">🛍️</div>`}
      </div>
      <div style="flex: 1;">
        <div class="order-item-name" style="font-weight: 600; font-size: 0.9rem;">${item.name}</div>
        <div class="order-item-qty" style="color: var(--mid); font-size: 0.8rem;">Qty: ${item.quantity}</div>
      </div>
      <div class="order-item-price" style="font-weight: 600; font-size: 0.9rem; text-align: right;">${formatRupees(item.price * item.quantity)}</div>
    </div>`).join('');

  const subtotal = orderItems.reduce((s, i) => s + i.price * i.quantity, 0);
  const city = currentUser?.address?.city || '';
  const shipping = calculateShipping(orderItems, city);
  const total = subtotal + shipping;

  document.getElementById('coSubtotal').textContent = formatRupees(subtotal);
  
  const weightEl = document.getElementById('coWeight');
  if (weightEl) {
    let totalWeight = orderItems.reduce((w, i) => w + (parseFloat(i.weight) || 0) * i.quantity, 0);
    weightEl.textContent = (totalWeight || 0).toFixed(3) + ' kg';
  }
  
  const shipEl = document.getElementById('coShipping');
  const shipLine = document.getElementById('coShippingLine');
  if (shipping === 0) { 
    shipEl.textContent = 'FREE'; 
    if(shipLine) shipLine.classList.add('free'); 
  } else { 
    shipEl.textContent = formatRupees(shipping);
    if(shipLine) shipLine.classList.remove('free');
  }
  document.getElementById('coTotal').textContent = formatRupees(total);
}

function initPlaceOrder() {
  const btn = document.getElementById('placeOrderBtn');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    const btnText = document.getElementById('placeOrderText');
    if (btnText) btnText.textContent = 'Placing Order...';

    const isStorePickup = sessionStorage.getItem('storePickup') === 'true';
    const notes = document.getElementById('orderNotes')?.value.trim() || '';
    const subtotal = orderItems.reduce((s, i) => s + i.price * i.quantity, 0);
    const city = currentUser.address?.city || '';
    const shipping = calculateShipping(orderItems, city);
    const total = subtotal + shipping;

    const shippingAddress = {
      name: currentUser.name,
      phone: currentUser.contactNumber || currentUser.phone || '—',
      email: currentUser.email,
      street: isStorePickup ? 'Store Pickup' : (currentUser.address?.street || '—'),
      city: isStorePickup ? 'Indore' : (currentUser.address?.city || '—'),
      state: isStorePickup ? 'Madhya Pradesh' : (currentUser.address?.state || '—'),
      pincode: isStorePickup ? '452002' : (currentUser.address?.pincode || '—')
    };

    const orderPayload = {
      items: orderItems.map(i => ({ 
        productId: i.productId, 
        quantity: i.quantity,
        variationId: i.variationId,
        color: i.color,
        size: i.size,
        price: i.price
      })),
      shippingAddress,
      notes,
      subtotal,
      shippingCost: shipping,
      total,
      paymentMethod: 'upi',
      isStorePickup
    };

    try {
      const res = await API.placeOrder(orderPayload);
      if (res && res.success && res.order) {
        showToast('Order confirmed!', 'success');
        Cart.clear();
        sessionStorage.removeItem('storePickup');
        setTimeout(() => {
          window.location.href = `/bill?id=${res.order._id}`;
        }, 1000);
      } else {
        throw new Error(res.message || 'Order failed');
      }
    } catch (err) {
      showToast(err.message || 'Failed to place order. Please try again.', 'error');
      btn.disabled = false;
      if (btnText) btnText.textContent = 'Confirm & Place Order';
    }
  });
}
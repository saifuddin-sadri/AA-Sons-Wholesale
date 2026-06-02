const BRANCH_CITIES = [
  'Kolkata', 'Bengaluru', 'Delhi', 'Mumbai', 'Ahmedabad', 'Amritsar', 'Bhagalpur', 'Bhopal', 'Bhubaneswar',
  'Chennai', 'Coimbatore', 'Cuttack', 'Guwahati', 'Indore', 'Jabalpur', 'Jaipur', 'Jammu',
  'Jodhpur', 'Kanpur', 'Ludhiana', 'Nashik', 'Patna', 'Pune', 'Raigarh', 'Ranchi', 'Raipur',
  'Salem', 'Siliguri', 'Surat', 'Varanasi', 'Ujjain', 'Dewas', 'Kalyan'
];

const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat",
  "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh",
  "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab",
  "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh",
  "Uttarakhand", "West Bengal", "Andaman and Nicobar Islands", "Chandigarh",
  "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Jammu and Kashmir",
  "Ladakh", "Lakshadweep", "Puducherry"
];

document.addEventListener('DOMContentLoaded', () => {
  const items = Cart.get();
  if (!items.length) { window.location.href = '/cart'; return; }

  renderOrderSummary(items);
  initPlaceOrder(items);
  initPhoneFormatting();
  initShippingUpdate(items);
  initStateAutocomplete();
});

function initStateAutocomplete() {
  const dl = document.getElementById('statesList');
  if (!dl) return;
  dl.innerHTML = INDIAN_STATES.map(s => `<option value="${s}">`).join('');
}

function initShippingUpdate(items) {
  const cityInput = document.getElementById('shCity');
  if (cityInput) {
    cityInput.addEventListener('input', () => renderOrderSummary(items));
  }
  const pickupToggle = document.getElementById('storePickupToggle');
  if (pickupToggle) {
    pickupToggle.addEventListener('change', () => renderOrderSummary(items));
  }
}

function calculateShipping(items, city = '') {
  const isStorePickup = document.getElementById('storePickupToggle')?.checked;
  if (isStorePickup) return 0;

  let totalWeight = items.reduce((w, i) => w + (parseFloat(i.weight) || 0) * i.quantity, 0);
  if (totalWeight === 0 && items.length > 0) totalWeight = 1;
  const isBranch = BRANCH_CITIES.some(c => c.toLowerCase() === city.trim().toLowerCase());
  const rate = isBranch ? 75 : 100;
  return Math.ceil(totalWeight) * rate;
}


function initPhoneFormatting() {
  const phoneInput = document.getElementById('shPhone');
  if (!phoneInput) return;

  phoneInput.addEventListener('input', (e) => {
    // Get digits only
    let digits = e.target.value.replace(/\D/g, '');
    
    // If it starts with 91, treat it as the country code
    if (digits.startsWith('91')) {
      digits = digits.substring(2);
    }
    
    // Limit to 10 digits
    if (digits.length > 10) {
      digits = digits.substring(0, 10);
    }
    
    // Format: +91 + digits
    e.target.value = digits ? '+91' + digits : '';
  });
}

function renderOrderSummary(items) {
  const container = document.getElementById('checkoutOrderItems');
  const city = document.getElementById('shCity')?.value || '';
  
  container.innerHTML = items.map(item => `
    <div class="order-item-row">
      <div class="order-item-img">
        ${item.image
          ? `<img src="${item.image}" alt="${item.name}" loading="lazy"/>`
          : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:1.5rem;background:var(--cream)">🛍️</div>`}
      </div>
      <div style="flex:1">
        <div class="order-item-name">${item.name}</div>
        <div class="order-item-qty">Qty: ${item.quantity}</div>
      </div>
      <div class="order-item-price">${formatRupees(item.price * item.quantity)}</div>
    </div>`).join('');

  const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
  const shipping = calculateShipping(items, city);
  const total    = subtotal + shipping;

  document.getElementById('coSubtotal').textContent = formatRupees(subtotal);
  const weightEl = document.getElementById('coWeight');
  if (weightEl) {
    let totalWeight = items.reduce((w, i) => w + (parseFloat(i.weight) || 0) * i.quantity, 0);
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

// Intentionally removed prefillUserData to prevent Admin credentials from autofilling as guest customer



function getShippingAddress() {
  return {
    name:    document.getElementById('shName').value.trim(),
    phone:   document.getElementById('shPhone').value.trim(),
    email:   document.getElementById('shEmail').value.trim(),
    street:  document.getElementById('shStreet').value.trim(),
    city:    document.getElementById('shCity').value.trim(),
    state:   document.getElementById('shState').value.trim(),
    pincode: document.getElementById('shPincode').value.trim()
  };
}

function validateForm() {
  const addr = getShippingAddress();
  const required = ['name', 'phone', 'street', 'city', 'state', 'pincode'];
  for (const field of required) {
    if (!addr[field]) {
      showToast(`Please fill in ${field}`, 'error');
      document.getElementById(`sh${field.charAt(0).toUpperCase() + field.slice(1)}`)?.focus();
      return false;
    }
  }
  if (!/^\d{6}$/.test(addr.pincode)) {
    showToast('Enter a valid 6-digit PIN code', 'error'); return false;
  }
  if (!/^\+91\d{10}$/.test(addr.phone)) {
    showToast('Enter a valid 10-digit phone number (+91XXXXXXXXXX)', 'error'); return false;
  }
  return true;
}

function initPlaceOrder(items) {
  document.getElementById('placeOrderBtn').addEventListener('click', async () => {
    if (!validateForm()) return;

    const shippingAddress = getShippingAddress();
    const notes           = document.getElementById('orderNotes')?.value.trim();
    const isStorePickup   = document.getElementById('storePickupToggle')?.checked || false;

    const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
    const shipping = calculateShipping(items, shippingAddress.city);
    const total    = subtotal + shipping;

    const orderPayload = {
      items: items.map(i => ({ 
        productId: i.productId, 
        quantity: i.quantity,
        variationId: i.variationId,
        color: i.color,
        size: i.size,
        price: i.price
      })),
      shippingAddress, notes,
      subtotal, shippingCost: shipping, total,
      paymentMethod: 'upi',
      isStorePickup
    };

    const btn = document.getElementById('placeOrderBtn');
    const btnText = document.getElementById('placeOrderText');

    await handleUPIPayment(orderPayload, btn, btnText);
  });
}



async function handleUPIPayment(orderPayload, btn, btnText) {
  btn.disabled = true;
  btnText.textContent = 'Proceeding to Payment…';

  try {
    // Save pending payload to sessionStorage instead of submitting now
    sessionStorage.setItem('pendingUpiOrder', JSON.stringify(orderPayload));
    
    // Redirect to the payment page to collect screenshot and place order
    window.location.href = `/payment`;
  } catch (err) {
    showToast(err.message || 'Failed to proceed to payment', 'error');
    btn.disabled = false;
    btnText.textContent = 'Place Order';
  }
}
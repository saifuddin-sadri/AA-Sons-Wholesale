// frontend/js/admin-order-details.js

document.addEventListener('DOMContentLoaded', () => {
  if (!API.isAdmin()) {
    window.location.href = '/admin';
    return;
  }
  initOrderDetails();
});

let currentOrderId = null;

const SKY_KING_CITIES = [
  'Kolkata', 'Bengaluru', 'Delhi', 'Mumbai', 'Ahmedabad', 'Amritsar', 'Bhagalpur', 'Bhopal', 'Bhubaneswar',
  'Chennai', 'Coimbatore', 'Cuttack', 'Guwahati', 'Indore', 'Jabalpur', 'Jaipur', 'Jammu',
  'Jodhpur', 'Kanpur', 'Ludhiana', 'Nashik', 'Patna', 'Pune', 'Raigarh', 'Ranchi', 'Raipur',
  'Salem', 'Siliguri', 'Surat', 'Varanasi', 'Ujjain', 'Dewas', 'Kalyan'
];

const COURIER_PARTNERS = {
  'Madhure Courier': {
    url: 'https://www.madhurcouriers.in/',
    phone: '+91 7611117696'
  },
  'Delhivery': {
    url: 'https://trackcourier.io/delhivery-courier-tracking',
    phone: '+91 1246719500'
  },
  'Skyking': {
    url: 'https://skyking.co/',
    phone: '+91 6291187097'
  }
};

async function initOrderDetails() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  if (!id) {
    showToast('No order ID found', 'error');
    setTimeout(() => window.location.href = '/admin', 1500);
    return;
  }
  currentOrderId = id;
  loadOrderData();
}

function getSkyKingDetails(city) {
  if (!city) return null;
  const match = SKY_KING_CITIES.find(c => c.toLowerCase() === city.trim().toLowerCase());
  if (match) {
    return {
      company: 'Skyking',
      url: 'https://skyking.co/',
      phone: '+91 6291187097'
    };
  }
  return null;
}

window.handleCourierSelection = (val) => {
  const partner = COURIER_PARTNERS[val];
  if (partner) {
    document.getElementById('trackUrl').value = partner.url;
    document.getElementById('trackPhone').value = partner.phone;
  }
};

async function loadOrderData() {
  try {
    const data = await API.adminGetOrder(currentOrderId);
    renderOrderDetails(data.order);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function formatRupees(amount) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(amount);
}

function renderOrderDetails(o) {
  document.getElementById('orderTitle').textContent = `Order ${o.orderNumber}`;
  
  // Add Open Invoice Button to the header
  const badgeWrap = document.getElementById('orderBadgeWrap');
  if (badgeWrap) {
    badgeWrap.innerHTML = `
      <div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap;">
        <span class="badge badge-${o.status}">${o.status}</span>
        <button class="btn-edit-order" onclick="openEditOrderModal('${o._id}')" style="padding:8px 16px; font-size:0.8rem;">✏️ Edit Order</button>
        <button onclick="window.open('/invoice?id=${o._id}', '_blank')" class="btn-nav-outline" style="padding:8px 16px; font-size:0.75rem; background:white;">
          Open Invoice
        </button>
        <button onclick="window.open('/worker-bill?id=${o._id}', '_blank')" class="btn-nav-outline" style="padding:8px 16px; font-size:0.75rem; background:var(--gold); color:white; border-color:var(--gold);">
          Worker Bill
        </button>
      </div>
    `;
    console.log('✅ Invoice button rendered in header');
  }
  
  const content = document.getElementById('orderDetailsContent');
  let t = o.tracking || {};

  // Autofill logic for specific cities if tracking is not set yet
  if (!t.id && !t.company && !t.url) {
    const autoFill = getSkyKingDetails(o.shippingAddress?.city);
    if (autoFill) t = { ...t, ...autoFill };
  }

  content.innerHTML = `
    <div class="detail-card">
      <div class="detail-grid">
        <!-- Section: Customer Info -->
        <div class="order-detail-section">
          <h4>👤 Customer & Shipping</h4>
          <div style="font-size:.9rem; color:var(--dark-soft); line-height:1.7;">
            <p><strong>Name:</strong> ${o.shippingAddress?.name || '—'}</p>
            <p><strong>Phone:</strong> ${o.shippingAddress?.phone || '—'}</p>
            ${o.shippingAddress?.email ? `<p><strong>Email:</strong> ${o.shippingAddress.email}</p>` : ''}
            <p><strong>Address:</strong><br>
            ${o.shippingAddress?.street}, ${o.shippingAddress?.city},<br>
            ${o.shippingAddress?.state} — ${o.shippingAddress?.pincode}</p>
          </div>
        </div>

        <!-- Section: Payment Info -->
        <div class="order-detail-section">
          <h4>💳 Payment Information</h4>
          <div style="font-size:.9rem; color:var(--dark-soft); line-height:1.7;">
            <p><strong>Method:</strong> <span style="text-transform:uppercase;">${o.paymentMethod || '—'}</span></p>
            <p><strong>Status:</strong> <span class="badge badge-${o.paymentStatus}">${o.paymentStatus}</span></p>
            ${o.paymentId ? `<p><strong>${o.paymentMethod === 'upi' ? 'UTR:' : 'Payment ID:'}</strong> <code style="font-size:0.75rem;">${o.paymentId}</code></p>` : ''}
            ${o.paymentScreenshot ? `
              <p>
                <strong>Screenshot:</strong><br>
                <a href="${o.paymentScreenshot}" target="_blank">
                  <img src="${o.paymentScreenshot}" style="max-width: 150px; border-radius: 8px; margin-top: 8px; border: 1px solid #ddd;" alt="Payment Proof" />
                </a>
              </p>
              ${o.status === 'payment_pending' ? `
                <button onclick="verifyScreenshot()" class="btn-hero-primary" style="padding: 8px 16px; font-size: 0.8rem; margin-top: 8px;">
                  Verify Payment
                </button>
              ` : ''}
            ` : ''}
            <p><strong>Date:</strong> ${new Date(o.createdAt).toLocaleString('en-IN')}</p>
          </div>
        </div>
      </div>

      <!-- Section: Status Update -->
      <div class="order-detail-section" style="background:#f9f9f9; padding:20px; border-radius:8px; margin-bottom:32px;">
        <h4>⚙️ Update Order Status</h4>
        <div class="status-update-row">
          <select class="status-select" id="newOrderStatus">
            ${[
              { val: 'payment_pending', lbl: 'Payment Pending' },
              { val: 'payment_received', lbl: 'Payment Received' },
              { val: 'confirmed', lbl: 'Confirmed' },
              { val: 'processing', lbl: 'Processing' },
              { val: 'shipped', lbl: 'Shipped' },
              { val: 'delivered', lbl: 'Delivered' },
              { val: 'cancelled', lbl: 'Cancelled' }
            ].map(s =>
              `<option value="${s.val}" ${o.status === s.val ? 'selected' : ''}>${s.lbl}</option>`
            ).join('')}
          </select>
          <input type="text" class="status-note" id="statusNote" placeholder="Add a note for internal records..."/>
          <button class="btn-update-status" onclick="updateStatus()">Update Status</button>
          <button class="btn-nav-outline" id="mainInvoiceBtn" onclick="window.open('/invoice?id=${o._id}', '_blank')" style="padding:10px 20px; font-weight:600; background:var(--teal); color:white;">Open Invoice</button>
          <button class="btn-nav-outline" onclick="window.open('/worker-bill?id=${o._id}', '_blank')" style="padding:10px 20px; font-weight:600; background:var(--gold); color:white; border-color:var(--gold);">Worker Bill</button>
        </div>
      </div>

      <!-- Section: Tracking Details / Store Pickup Notice -->
      ${o.isStorePickup ? `
        <div class="order-detail-section" style="background:rgba(27, 94, 75, 0.05); border:1.5px dashed var(--teal); padding:24px; border-radius:12px; text-align:center;">
          <div style="font-size:2rem; margin-bottom:10px;">🏘️</div>
          <h4 style="color:var(--teal); margin-bottom:8px;">Store Pickup</h4>
          <p style="font-weight:700; color:var(--teal); font-size:1.1rem; margin:0;">
            No tracking needed - Customer will collect the product from the store directly.
          </p>
        </div>
      ` : `
        <div class="order-detail-section tracking-form">
          <h4 style="color:var(--teal)">🚚 Tracking Details</h4>
          <div class="tracking-grid">
            <div class="form-group">
              <label class="form-label">Tracking ID</label>
              <input type="text" class="form-input" id="trackId" value="${t.id || ''}" placeholder="e.g. SF123456789"/>
            </div>
            <div class="form-group">
              <label class="form-label">Delivery Company Name</label>
              <input type="text" class="form-input" id="trackCompany" value="${t.company || ''}" list="courierPartners" oninput="handleCourierSelection(this.value)" placeholder="e.g. BlueDart, Delhivery"/>
              <datalist id="courierPartners">
                ${Object.keys(COURIER_PARTNERS).map(name => `<option value="${name}">`).join('')}
              </datalist>
            </div>
            <div class="form-group">
              <label class="form-label">Tracking Website Link</label>
              <input type="url" class="form-input" id="trackUrl" value="${t.url || ''}" placeholder="https://tracking-website.com/info"/>
            </div>
            <div class="form-group">
              <label class="form-label">Company Contact Number</label>
              <input type="text" class="form-input" id="trackPhone" value="${t.phone || ''}" placeholder="e.g. 1800-123-456"/>
            </div>
          </div>
          <div style="margin-top:20px; display:flex; gap:12px;">
            <button class="btn-nav-cta" onclick="updateTracking(event)" style="padding:12px 24px; font-weight:700;">
              Update Tracking Data & Notify Customer
            </button>
          </div>
          <p style="font-size:.72rem; color:var(--mid); margin-top:10px;">
            * Updating tracking data will automatically notify the customer via email.
          </p>
        </div>
      `}
    </div>

    <!-- Section: Items -->
    <div class="detail-card">
      <h4>🛍️ Order Items</h4>
      <div class="items-list">
        ${o.items.map(item => `
          <div class="order-item-row">
            <img src="${item.image || '/logo.png'}" class="order-item-img" alt="${item.name}"/>
            <div style="flex:1">
              <div style="font-weight:600; font-size:1rem;">
                ${item.product ? `
                  <a href="/product-detail?id=${item.product?._id || item.product}" target="_blank" style="text-decoration:none; color:inherit;">
                    ${item.name}
                  </a>
                ` : `
                  <span>${item.name}</span>
                `}
              </div>
              <div style="font-size:.84rem; color:var(--mid); margin-top:4px;">
                ${item.size ? `<strong>Size:</strong> ${item.size} | ` : ''}
                ${item.color ? `<strong>Color:</strong> ${item.color} | ` : ''}
                <strong>Qty:</strong> ${item.quantity}
              </div>
            </div>
            <div style="text-align:right">
              <div style="font-weight:700; color:var(--teal)">${formatRupees(item.price * item.quantity)}</div>
              <div style="font-size:.72rem; color:var(--mid)">${formatRupees(item.price)} each</div>
            </div>
          </div>
        `).join('')}
      </div>
      
      <div style="margin-top:24px; border-top:2px solid #f9f9f9; padding-top:20px;">
        <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
           <span style="color:var(--mid)">Subtotal</span>
           <span>${formatRupees(o.subtotal)}</span>
        </div>
        <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
           <span style="color:var(--mid)">Shipping</span>
           <span>${o.shippingCost === 0 ? 'FREE' : formatRupees(o.shippingCost)}</span>
        </div>
        <div style="display:flex; justify-content:space-between; font-size:1.4rem; font-weight:700; color:var(--teal); margin-top:12px;">
           <span>Total sum</span>
           <span>${formatRupees(o.total)}</span>
        </div>
      </div>
    </div>

    <!-- Section: Order History -->
    <div class="detail-card">
      <h4>📋 Order History</h4>
      <div style="display:flex; flex-direction:column; gap:12px;">
        ${o.statusHistory?.slice().reverse().map(h => `
          <div style="display:flex; gap:12px; align-items:center;">
             <span class="badge badge-${h.status}" style="min-width:80px; text-align:center;">${h.status}</span>
             <div style="flex:1">
               <div style="font-size:.84rem; font-weight:500;">${h.note || 'Status updated'}</div>
               <div style="font-size:.72rem; color:var(--mid);">${new Date(h.updatedAt).toLocaleString('en-IN')}</div>
             </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

async function updateStatus() {
  const status = document.getElementById('newOrderStatus').value;
  const note   = document.getElementById('statusNote').value.trim();
  const btn    = document.querySelector('.btn-update-status');
  
  try {
    btn.disabled = true;
    btn.textContent = 'Updating...';
    await API.adminUpdateStatus(currentOrderId, { status, note });
    showToast('Status updated successfully!', 'success');
    loadOrderData();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Update Status';
  }
}

async function verifyScreenshot() {
  try {
    // We update status to 'payment_received' (which is the step after payment is verified)
    await API.adminUpdateStatus(currentOrderId, { status: 'payment_received', note: 'Payment verified by Admin' });
    showToast('Payment verified successfully!', 'success');
    loadOrderData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function updateTracking(event) {
  const idEl      = document.getElementById('trackId');
  const companyEl = document.getElementById('trackCompany');
  const urlEl     = document.getElementById('trackUrl');

  // Clear any previous error highlights
  [idEl, companyEl, urlEl].forEach(el => el.style.borderColor = '');

  const trackingData = {
    id:      idEl.value.trim(),
    company: companyEl.value.trim(),
    url:     urlEl.value.trim(),
    phone:   document.getElementById('trackPhone').value.trim()
  };

  // Validate and highlight the specific missing field
  if (!trackingData.id) {
    idEl.style.borderColor = '#e53e3e';
    idEl.focus();
    showToast('Please enter the Tracking ID (e.g. SF123456789).', 'error');
    return;
  }
  if (!trackingData.company) {
    companyEl.style.borderColor = '#e53e3e';
    companyEl.focus();
    showToast('Please enter the Delivery Company Name.', 'error');
    return;
  }
  if (!trackingData.url) {
    urlEl.style.borderColor = '#e53e3e';
    urlEl.focus();
    showToast('Please enter the Tracking Website Link.', 'error');
    return;
  }

  const btn = event.target;
  try {
    btn.disabled = true;
    btn.textContent = 'Sending details...';
    await API.adminUpdateTracking(currentOrderId, trackingData);
    showToast('Tracking updated & customer notified!', 'success');
    loadOrderData();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Update Tracking Data & Notify Customer';
  }
}

function showToast(msg, type = 'info') {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = `toast show ${type}`;
  setTimeout(() => t.classList.remove('show'), 3000);
}

/* ══════════════════════════════════════════════════════════
   EDIT ORDER MODAL — Full Logic (Order Details Page)
══════════════════════════════════════════════════════════ */
let editOrderData = null;
let editOrderItems = [];

async function openEditOrderModal(orderId) {
  try {
    const data = await API.adminGetOrder(orderId);
    editOrderData = JSON.parse(JSON.stringify(data.order || data));
    editOrderItems = (editOrderData.items || []).map(it => ({
      productId: it.product?._id || it.product || null,
      name: it.name || it.product?.name || 'Unknown',
      image: it.image || (typeof it.product?.images?.[0] === 'object' ? it.product.images[0]?.url : it.product?.images?.[0]) || '/images/placeholder.svg',
      variant: it.variant || '',
      size: it.size || '',
      color: it.color || '',
      price: it.price || 0,
      quantity: it.quantity || 1,
      isCustom: !it.product || it.isCustom || false
    }));
    document.getElementById('editOrderNumber').textContent = editOrderData.orderNumber || editOrderData._id?.slice(-8);
    renderEditOrderBody();
    document.getElementById('editOrderBackdrop').classList.add('open');
    document.getElementById('editOrderModal').classList.add('open');
    document.body.style.overflow = 'hidden';
  } catch (err) {
    showToast('Failed to load order: ' + err.message, 'error');
  }
}

function closeEditOrderModal() {
  document.getElementById('editOrderBackdrop').classList.remove('open');
  document.getElementById('editOrderModal').classList.remove('open');
  document.body.style.overflow = '';
  editOrderData = null;
  editOrderItems = [];
}

function renderEditOrderBody() {
  const o = editOrderData;
  const addr = o.shippingAddress || {};
  const body = document.getElementById('editOrderBody');
  body.innerHTML = `
    <div class="edit-order-section">
      <h3>📋 Order & Shipping Info</h3>
      <div class="edit-order-grid">
        <div><label class="edit-order-label">Customer Name</label><input class="edit-order-input" id="eoCustomerName" value="${escHtml(o.customerName || o.user?.name || '')}" /></div>
        <div><label class="edit-order-label">Phone</label><input class="edit-order-input" id="eoPhone" value="${escHtml(addr.phone || o.user?.contactNumber || '')}" /></div>
        <div><label class="edit-order-label">Email</label><input class="edit-order-input" id="eoEmail" value="${escHtml(o.user?.email || '')}" /></div>
        <div class="wide"><label class="edit-order-label">Street / Address</label><input class="edit-order-input" id="eoStreet" value="${escHtml(addr.street || addr.addressLine || '')}" /></div>
        <div><label class="edit-order-label">City</label><input class="edit-order-input" id="eoCity" value="${escHtml(addr.city || '')}" /></div>
        <div><label class="edit-order-label">State</label><input class="edit-order-input" id="eoState" value="${escHtml(addr.state || '')}" /></div>
        <div><label class="edit-order-label">Pincode</label><input class="edit-order-input" id="eoPincode" value="${escHtml(addr.pincode || addr.zip || '')}" /></div>
        <div><label class="edit-order-label">Payment Method</label>
          <select class="edit-order-input" id="eoPaymentMethod">
            <option value="COD" ${o.paymentMethod==='COD'?'selected':''}>COD</option>
            <option value="Online" ${o.paymentMethod==='Online'?'selected':''}>Online</option>
            <option value="UPI" ${o.paymentMethod==='UPI'?'selected':''}>UPI</option>
            <option value="Bank Transfer" ${o.paymentMethod==='Bank Transfer'?'selected':''}>Bank Transfer</option>
          </select>
        </div>
        <div><label class="edit-order-label">Payment Status</label>
          <select class="edit-order-input" id="eoPaymentStatus">
            <option value="Pending" ${o.paymentStatus==='Pending'?'selected':''}>Pending</option>
            <option value="Paid" ${o.paymentStatus==='Paid'?'selected':''}>Paid</option>
            <option value="Failed" ${o.paymentStatus==='Failed'?'selected':''}>Failed</option>
          </select>
        </div>
        <div><label class="edit-order-label">Order Status</label>
          <select class="edit-order-input" id="eoStatus">
            <option value="Pending" ${o.status==='Pending'?'selected':''}>Pending</option>
            <option value="Confirmed" ${o.status==='Confirmed'?'selected':''}>Confirmed</option>
            <option value="Processing" ${o.status==='Processing'?'selected':''}>Processing</option>
            <option value="Shipped" ${o.status==='Shipped'?'selected':''}>Shipped</option>
            <option value="Delivered" ${o.status==='Delivered'?'selected':''}>Delivered</option>
            <option value="Cancelled" ${o.status==='Cancelled'?'selected':''}>Cancelled</option>
          </select>
        </div>
        <div class="wide"><div class="edit-order-store-pickup"><input type="checkbox" id="eoStorePickup" ${o.storePickup?'checked':''} /><span>Store Pickup</span></div></div>
        <div class="wide"><label class="edit-order-label">Admin Notes</label><textarea class="edit-order-input" id="eoNotes" rows="2">${escHtml(o.notes || o.adminNotes || '')}</textarea></div>
      </div>
    </div>
    <div class="edit-order-section">
      <div class="edit-order-products-header">
        <h3>📦 Products</h3>
        <div class="edit-order-products-btns">
          <button class="btn-add-catalog" onclick="openCatalogPicker()">+ From Catalog</button>
          <button class="btn-add-custom" onclick="addCustomItem()">+ Custom Item</button>
        </div>
      </div>
      <div id="eoItemsList">${editOrderItems.map((it,i) => renderEditOrderItem(it,i)).join('')}</div>
    </div>
    <div class="edit-order-summary">
      <h3>💰 Order Summary</h3>
      <div class="edit-order-summary-row"><span>Subtotal</span><span class="edit-order-summary-val" id="eoSubtotal">₹0</span></div>
      <div class="edit-order-summary-row"><span>Shipping Fee</span><input class="edit-order-summary-input" id="eoShippingFee" type="number" min="0" value="${o.shippingFee||0}" onchange="recalcEditTotals()" /></div>
      <div class="edit-order-summary-row"><span>Packaging Fee</span><input class="edit-order-summary-input" id="eoPackagingFee" type="number" min="0" value="${o.packagingFee||0}" onchange="recalcEditTotals()" /></div>
      <div class="edit-order-summary-row"><span>Discount</span><input class="edit-order-summary-input" id="eoDiscount" type="number" min="0" value="${o.discount||0}" onchange="recalcEditTotals()" /></div>
      <div class="edit-order-summary-row total"><span>Grand Total</span><span class="edit-order-summary-val" id="eoGrandTotal">₹0</span></div>
    </div>
  `;
  recalcEditTotals();
}

function renderEditOrderItem(it, idx) {
  const total = (it.price * it.quantity).toFixed(2);
  return `
    <div class="edit-order-item" data-idx="${idx}">
      <img class="edit-order-item-img" src="${it.image||'/images/placeholder.svg'}" alt="" onerror="this.src='/images/placeholder.svg'" />
      <div class="edit-order-item-details">
        <input class="edit-order-item-name-input" value="${escHtml(it.name)}" onchange="editOrderItems[${idx}].name=this.value" />
        <div class="edit-order-item-variants">
          <input class="edit-order-item-variant-input" placeholder="Variant" value="${escHtml(it.variant)}" onchange="editOrderItems[${idx}].variant=this.value" />
          <input class="edit-order-item-variant-input" placeholder="Size" value="${escHtml(it.size)}" onchange="editOrderItems[${idx}].size=this.value" />
          <input class="edit-order-item-variant-input" placeholder="Color" value="${escHtml(it.color)}" onchange="editOrderItems[${idx}].color=this.value" />
        </div>
      </div>
      <div class="edit-order-item-pricing">
        <div><label>Price (₹)</label><input class="edit-order-item-price-input" type="number" min="0" value="${it.price}" onchange="editOrderItems[${idx}].price=+this.value; recalcEditTotals()" /></div>
        <div><label>Qty</label><input class="edit-order-item-qty-input" type="number" min="1" value="${it.quantity}" onchange="editOrderItems[${idx}].quantity=+this.value; recalcEditTotals()" /></div>
      </div>
      <div class="edit-order-item-total"><label>Total</label><span class="edit-order-item-total-val">₹${total}</span></div>
      <button class="edit-order-item-remove" onclick="removeEditItem(${idx})">✕</button>
    </div>
  `;
}

function recalcEditTotals() {
  let subtotal = 0;
  editOrderItems.forEach((it, i) => {
    const t = it.price * it.quantity;
    subtotal += t;
    const el = document.querySelector(`.edit-order-item[data-idx="${i}"] .edit-order-item-total-val`);
    if (el) el.textContent = '₹' + t.toFixed(2);
  });
  const shipping = parseFloat(document.getElementById('eoShippingFee')?.value) || 0;
  const packaging = parseFloat(document.getElementById('eoPackagingFee')?.value) || 0;
  const discount = parseFloat(document.getElementById('eoDiscount')?.value) || 0;
  const grand = subtotal + shipping + packaging - discount;
  const subEl = document.getElementById('eoSubtotal');
  const grandEl = document.getElementById('eoGrandTotal');
  if (subEl) subEl.textContent = '₹' + subtotal.toFixed(2);
  if (grandEl) grandEl.textContent = '₹' + grand.toFixed(2);
}

function removeEditItem(idx) {
  editOrderItems.splice(idx, 1);
  document.getElementById('eoItemsList').innerHTML = editOrderItems.map((it, i) => renderEditOrderItem(it, i)).join('');
  recalcEditTotals();
}

function addCustomItem() {
  editOrderItems.push({ productId:null, name:'Custom Product', image:'/images/placeholder.svg', variant:'', size:'', color:'', price:0, quantity:1, isCustom:true });
  document.getElementById('eoItemsList').innerHTML = editOrderItems.map((it, i) => renderEditOrderItem(it, i)).join('');
  recalcEditTotals();
}

let catalogAllProducts = [];

async function openCatalogPicker() {
  document.getElementById('catalogPickerBackdrop').classList.add('open');
  document.getElementById('catalogPickerModal').classList.add('open');
  document.getElementById('catalogPickerSearch').value = '';
  document.getElementById('catalogPickerResults').innerHTML = '<p style="text-align:center;color:var(--mid);padding:20px">Loading…</p>';
  try {
    const data = await API.adminGetProducts({ limit: 500 });
    catalogAllProducts = data.products || data || [];
    document.getElementById('catalogPickerResults').innerHTML = '<p style="text-align:center;color:var(--mid);padding:20px">Type to search…</p>';
  } catch (err) {
    document.getElementById('catalogPickerResults').innerHTML = '<p style="text-align:center;color:red;padding:20px">Failed to load</p>';
  }
}

function closeCatalogPicker() {
  document.getElementById('catalogPickerBackdrop').classList.remove('open');
  document.getElementById('catalogPickerModal').classList.remove('open');
}

function searchCatalogProducts() {
  const q = document.getElementById('catalogPickerSearch').value.trim().toLowerCase();
  if (!q) { document.getElementById('catalogPickerResults').innerHTML = '<p style="text-align:center;color:var(--mid);padding:20px">Type to search…</p>'; return; }
  const matches = catalogAllProducts.filter(p => p.name?.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q)).slice(0,20);
  if (!matches.length) { document.getElementById('catalogPickerResults').innerHTML = '<p style="text-align:center;color:var(--mid);padding:20px">No products found</p>'; return; }
  document.getElementById('catalogPickerResults').innerHTML = matches.map(p => `
    <div class="catalog-picker-item" onclick='pickCatalogProduct(${JSON.stringify({id:p._id,name:p.name,image:(typeof p.images?.[0]==='object'?p.images[0]?.url:p.images?.[0])||'/images/placeholder.svg',price:p.wholesalePrice||p.price||0,variant:p.variant||'',size:p.size||'',color:p.color||''}).replace(/'/g,"&#39;")})'>
      <img src="${(typeof p.images?.[0]==='object'?p.images[0]?.url:p.images?.[0])||'/images/placeholder.svg'}" alt="" onerror="this.src='/images/placeholder.svg'" />
      <div class="catalog-picker-item-info"><div class="catalog-picker-item-name">${escHtml(p.name)}</div><div class="catalog-picker-item-price">₹${(p.wholesalePrice||p.price||0).toLocaleString('en-IN')}</div></div>
    </div>
  `).join('');
}

function pickCatalogProduct(prod) {
  editOrderItems.push({ productId:prod.id, name:prod.name, image:prod.image, variant:prod.variant||'', size:prod.size||'', color:prod.color||'', price:prod.price, quantity:1, isCustom:false });
  closeCatalogPicker();
  document.getElementById('eoItemsList').innerHTML = editOrderItems.map((it,i) => renderEditOrderItem(it,i)).join('');
  recalcEditTotals();
}

async function saveEditOrder() {
  if (!editOrderData) return;
  const saveBtn = document.querySelector('.btn-edit-save');
  try {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';
    const payload = {
      customerName: document.getElementById('eoCustomerName')?.value || '',
      shippingAddress: {
        street: document.getElementById('eoStreet')?.value || '',
        city: document.getElementById('eoCity')?.value || '',
        state: document.getElementById('eoState')?.value || '',
        pincode: document.getElementById('eoPincode')?.value || '',
        phone: document.getElementById('eoPhone')?.value || ''
      },
      items: editOrderItems.map(it => ({ product: it.productId||undefined, name:it.name, image:it.image, variant:it.variant, size:it.size, color:it.color, price:+it.price, quantity:+it.quantity, isCustom:it.isCustom })),
      paymentMethod: document.getElementById('eoPaymentMethod')?.value || 'COD',
      paymentStatus: document.getElementById('eoPaymentStatus')?.value || 'Pending',
      status: document.getElementById('eoStatus')?.value || editOrderData.status,
      storePickup: document.getElementById('eoStorePickup')?.checked || false,
      shippingFee: parseFloat(document.getElementById('eoShippingFee')?.value) || 0,
      packagingFee: parseFloat(document.getElementById('eoPackagingFee')?.value) || 0,
      discount: parseFloat(document.getElementById('eoDiscount')?.value) || 0,
      notes: document.getElementById('eoNotes')?.value || ''
    };
    await API.adminUpdateOrder(editOrderData._id, payload);
    showToast('Order updated successfully!', 'success');
    closeEditOrderModal();
    loadOrderData();
  } catch (err) {
    showToast('Failed to save: ' + err.message, 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save Changes';
  }
}

function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

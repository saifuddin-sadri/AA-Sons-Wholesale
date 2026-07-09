document.addEventListener('DOMContentLoaded', async () => {
  const loadingEl = document.getElementById('ordersLoading');
  const emptyEl = document.getElementById('emptyHistory');
  const listEl = document.getElementById('ordersList');

  try {
    const data = await API.myOrders();
    if (loadingEl) loadingEl.style.display = 'none';

    if (data && data.success && data.orders && data.orders.length > 0) {
      if (listEl) {
        listEl.innerHTML = renderOrders(data.orders);
        listEl.style.display = 'block';
      }
    } else {
      if (emptyEl) emptyEl.style.display = 'block';
    }
  } catch (err) {
    console.error(err);
    if (loadingEl) {
      loadingEl.innerHTML = `<p style="color: #C62828; text-align: center;">Failed to load order history: ${err.message}</p>`;
    }
  }
});

function formatRupees(amount) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(amount);
}

function getStatusBadgeClass(status) {
  switch (status) {
    case 'placed': return 'status-placed';
    case 'confirmed': return 'status-confirmed';
    case 'processing': return 'status-processing';
    case 'shipped': return 'status-shipped';
    case 'delivered': return 'status-delivered';
    case 'payment_pending': return 'status-pending';
    case 'cancelled': return 'status-cancelled';
    default: return 'status-placed';
  }
}

function getStatusLabel(status) {
  switch (status) {
    case 'placed': return 'Placed';
    case 'confirmed': return 'Confirmed';
    case 'processing': return 'Processing';
    case 'shipped': return 'Shipped';
    case 'delivered': return 'Delivered';
    case 'payment_pending': return 'Payment Pending';
    case 'cancelled': return 'Cancelled';
    default: return status;
  }
}

function renderOrders(orders) {
  return orders.map(o => {
    const itemsPreview = o.items.map(item => `
      <div class="preview-item">
        <span class="preview-item-name">${item.name}</span>
        <span class="preview-item-qty">Qty: ${item.quantity}</span>
      </div>
    `).join('');

    return `
      <div class="order-card animate-in">
        <div class="order-card-header">
          <div class="order-meta-group">
            <div class="order-meta-item">
              Order Number
              <strong>#${o.orderNumber}</strong>
            </div>
            <div class="order-meta-item">
              Date Placed
              <strong>${new Date(o.createdAt).toLocaleDateString('en-IN')}</strong>
            </div>
            <div class="order-meta-item">
              Destination
              <strong>${o.isStorePickup ? 'Store Pickup' : (o.shippingAddress?.city || '—')}</strong>
            </div>
          </div>
          <span class="order-status-badge ${getStatusBadgeClass(o.status)}">
            ${getStatusLabel(o.status)}
          </span>
        </div>
        <div class="order-items-preview">
          ${itemsPreview}
        </div>
        <div class="order-card-footer">
          <div class="order-total-amount">
            Total Amount: <strong>${formatRupees(o.total)}</strong>
          </div>
          <a href="/bill?id=${o._id}" class="btn-view-invoice">
            📄 View Bill
          </a>
        </div>
      </div>
    `;
  }).join('');
}

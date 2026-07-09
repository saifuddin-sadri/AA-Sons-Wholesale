document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const orderId = urlParams.get('id');

  if (!orderId) {
    alert('Order ID missing');
    window.location.href = '/';
    return;
  }

  try {
    const data = await API.getOrder(orderId);
    if (!data || !data.success || !data.order) {
      throw new Error(data.message || 'Order not found');
    }

    const o = data.order;
    renderBillDetails(o);
    setupActionButtons(o);
  } catch (err) {
    console.error(err);
    const overlay = document.getElementById('billLoadingOverlay');
    if (overlay) {
      overlay.innerHTML = `<p style="font-family: 'Poppins', sans-serif; font-weight: 600; font-size: 1rem; color: #C62828;">Failed to load bill: ${err.message}</p>`;
    }
    alert('Failed to load bill: ' + err.message);
  }
});

function formatRupees(amount) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(amount);
}

function renderBillDetails(o) {
  // Order info
  document.getElementById('val-orderNum').textContent = o.orderNumber;
  document.getElementById('val-date').textContent = new Date(o.createdAt).toLocaleDateString('en-IN');
  
  // Status display format
  let statusText = o.status;
  if (statusText === 'payment_pending') statusText = 'Payment Pending';
  else if (statusText === 'payment_received') statusText = 'Payment Received';
  else if (statusText === 'placed') statusText = 'Placed';
  else if (statusText === 'confirmed') statusText = 'Confirmed';
  else if (statusText === 'processing') statusText = 'Processing';
  else if (statusText === 'shipped') statusText = 'Shipped';
  else if (statusText === 'delivered') statusText = 'Delivered';
  else if (statusText === 'cancelled') statusText = 'Cancelled';
  
  document.getElementById('val-status').textContent = statusText;

  // Customer info
  document.getElementById('val-custName').textContent = o.shippingAddress?.name || o.user?.name || '—';
  document.getElementById('val-businessName').textContent = o.user?.businessName || '—';
  document.getElementById('val-custPhone').textContent = o.shippingAddress?.phone || o.user?.contactNumber || o.user?.phone || '—';

  // Shipping details
  const shippingContainer = document.getElementById('val-shippingAddress');
  if (o.isStorePickup) {
    shippingContainer.innerHTML = `
      <strong>🏪 Collect from Store</strong><br>
      A.A & Sons Indore Branch<br>
      Indore, Madhya Pradesh
    `;
  } else {
    const addr = o.shippingAddress;
    shippingContainer.innerHTML = `
      <strong>${addr.street}</strong><br>
      ${addr.city}, ${addr.state} — <strong>${addr.pincode}</strong>
    `;
  }

  // Items table (Text-only as requested by user)
  const itemsBody = document.getElementById('val-itemsList');
  itemsBody.innerHTML = o.items.map(item => {
    let detailsText = '';
    if (item.size || item.color) {
      detailsText = `<br><span style="font-size:0.75rem; color:#6b7280;">(${item.size ? 'Size: ' + item.size : ''}${item.size && item.color ? ', ' : ''}${item.color ? 'Color: ' + item.color : ''})</span>`;
    }
    return `
      <tr>
        <td style="padding: 14px 16px; border-bottom: 1px solid #eaeaea;">
          <strong>${item.name}</strong>${detailsText}
        </td>
        <td style="text-align: center; padding: 14px 16px; border-bottom: 1px solid #eaeaea;">${item.quantity}</td>
        <td style="text-align: right; padding: 14px 16px; border-bottom: 1px solid #eaeaea;">${formatRupees(item.price)}</td>
        <td style="text-align: right; padding: 14px 16px; border-bottom: 1px solid #eaeaea;">${formatRupees(item.price * item.quantity)}</td>
      </tr>
    `;
  }).join('');

  // Totals
  const shipping = o.shippingCost !== undefined ? o.shippingCost : 0;
  const subtotal = o.subtotal !== undefined ? o.subtotal : (o.total - shipping);

  document.getElementById('val-subtotal').textContent = formatRupees(subtotal);
  document.getElementById('val-shipping').textContent = shipping === 0 ? 'FREE' : formatRupees(shipping);
  document.getElementById('val-total').textContent = formatRupees(o.total);

  // Hide loader
  const overlay = document.getElementById('billLoadingOverlay');
  if (overlay) overlay.style.display = 'none';
}

function setupActionButtons(o) {
  // Download PDF button
  const downloadPdfBtn = document.getElementById('downloadPdfBtn');
  if (downloadPdfBtn) {
    downloadPdfBtn.addEventListener('click', () => {
      const element = document.getElementById('bill-card-content');
      const opt = {
        margin: 10,
        filename: `Bill_${o.orderNumber}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { 
          scale: 2.5,
          useCORS: true,
          scrollX: 0,
          scrollY: 0
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
      };
      html2pdf().from(element).set(opt).save();
    });
  }

  // Share to WhatsApp button
  const shareWhatsappBtn = document.getElementById('shareWhatsappBtn');
  if (shareWhatsappBtn) {
    shareWhatsappBtn.addEventListener('click', () => {
      let text = `*A.A & Sons wholesale order summary*\n\n`;
      text += `*Order Number:* ${o.orderNumber}\n`;
      text += `*Date:* ${new Date(o.createdAt).toLocaleDateString('en-IN')}\n`;
      text += `*Status:* Placed\n`;
      text += `------------------------------------\n`;
      text += `*Customer:* ${o.shippingAddress?.name || '—'}\n`;
      if (o.isStorePickup) {
        text += `*Type:* Store Pickup (Indore Branch)\n`;
      } else {
        text += `*Address:* ${o.shippingAddress?.street}, ${o.shippingAddress?.city}\n`;
      }
      text += `------------------------------------\n`;
      text += `*Items Ordered:*\n`;
      
      o.items.forEach(item => {
        text += `- ${item.name} x ${item.quantity} (${formatRupees(item.price)} each)\n`;
      });
      
      text += `------------------------------------\n`;
      text += `*Subtotal:* ${formatRupees(o.subtotal)}\n`;
      text += `*Shipping:* ${o.shippingCost === 0 ? 'FREE' : formatRupees(o.shippingCost)}\n`;
      text += `*Grand Total:* ${formatRupees(o.total)}\n\n`;
      text += `Thank you for your order!`;

      const encodedText = encodeURIComponent(text);
      window.open(`https://wa.me/?text=${encodedText}`, '_blank');
    });
  }
}

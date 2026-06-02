// frontend/js/payment.js

document.addEventListener('DOMContentLoaded', async () => {
  const pendingOrderStr = sessionStorage.getItem('pendingUpiOrder');
  
  if (!pendingOrderStr) {
    showToast('No pending order found. Please checkout first.', 'error');
    setTimeout(() => window.location.href = '/cart', 2000);
    return;
  }

  let orderPayload = null;
  let serverConfig = null;

  try {
    orderPayload = JSON.parse(pendingOrderStr);
    
    try {
      const configRes = await API.getPaymentConfig();
      if (configRes && configRes.success && configRes.config) {
        serverConfig = configRes.config;
      } else {
        throw new Error();
      }
    } catch(err) {
      console.warn("Could not fetch payment config, using defaults");
      serverConfig = { upiId: '' };
    }

    // Fake an order info block for UI since we haven't created the order yet
    const tempOrderId = 'PAY-' + Math.floor(1000 + Math.random() * 9000);
    const orderDataForUI = {
      orderNumber: tempOrderId,
      total: orderPayload.total
    };

    const checkInputs = () => {
      const fileInput = document.getElementById('inpScreenshot');
      const btn = document.getElementById('btnSubmitUtr');
      btn.disabled = !fileInput.files || fileInput.files.length === 0;
      
      const fileNameDisplay = document.getElementById('fileNameDisplay');
      if (fileNameDisplay) {
        if (fileInput.files && fileInput.files.length > 0) {
          fileNameDisplay.textContent = fileInput.files[0].name;
        } else {
          fileNameDisplay.textContent = 'Click to choose file';
        }
      }
    };

    // Add drag and drop styling
    const dropzone = document.getElementById('uploadDropzone');
    if (dropzone) {
        dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('dragover'); });
        dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
        dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropzone.classList.remove('dragover');
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                document.getElementById('inpScreenshot').files = e.dataTransfer.files;
                checkInputs();
            }
        });
    }

    document.getElementById('inpScreenshot').addEventListener('change', checkInputs);

    renderPaymentPage(orderDataForUI, serverConfig);
  } catch (err) {
    showToast(err.message || 'Error loading payment details', 'error');
    document.getElementById('loadingState').textContent = 'Error loading payment details. Please go back.';
  }

  document.getElementById('btnSubmitUtr').addEventListener('click', () => handleUtrSubmit(orderPayload));
});

function renderPaymentPage(order, config) {
  document.getElementById('loadingState').style.display = 'none';
  document.getElementById('paymentCard').style.display = 'block';

  document.getElementById('lblOrderId').textContent = order.orderNumber;
  document.getElementById('lblAmount').textContent = `₹${order.total}`;

  // Generate UPI URI
  const upiId = config.upiId;
  const amount = order.total;
  const name = "A.A & Sons";
  const tr = order.orderNumber; // transaction reference
  
  const upiString = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(name)}&am=${amount}&tr=${encodeURIComponent(tr)}&cu=INR`;

  // Generate QR Code
  const qrContainer = document.getElementById('qrcode');
  qrContainer.innerHTML = ''; 
  
  new QRCode(qrContainer, {
    text: upiString,
    width: 200,
    height: 200,
    colorDark : "#1B5E4B",
    colorLight : "#ffffff",
    correctLevel : QRCode.CorrectLevel.H
  });

  // Handle Direct UPI App Links
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const gpayLink = isIOS ? `tez://upi/pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(name)}&am=${amount}&tr=${encodeURIComponent(tr)}&cu=INR` : upiString;
  const phonepeLink = isIOS ? `phonepe://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(name)}&am=${amount}&tr=${encodeURIComponent(tr)}&cu=INR` : upiString;
  const paytmLink = isIOS ? `paytmmp://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(name)}&am=${amount}&tr=${encodeURIComponent(tr)}&cu=INR` : upiString;

  const linkGPay = document.getElementById('directGPay');
  const linkPhonePe = document.getElementById('directPhonePe');
  const linkPaytm = document.getElementById('directPaytm');

  if (linkGPay) linkGPay.href = gpayLink;
  if (linkPhonePe) linkPhonePe.href = phonepeLink;
  if (linkPaytm) linkPaytm.href = paytmLink;

  // Handle High Value Transaction (> 2000 INR)
  if (amount > 2000) {
    const highValueSec = document.getElementById('highValuePayment');
    const txtUpiId = document.getElementById('txtUpiId');
    const btnCopy = document.getElementById('btnCopyUpi');

    if (highValueSec && txtUpiId) {
      highValueSec.style.display = 'block';
      txtUpiId.textContent = upiId;
      
      if (btnCopy) {
        btnCopy.onclick = () => {
          navigator.clipboard.writeText(upiId).then(() => {
            btnCopy.textContent = 'Copied!';
            setTimeout(() => btnCopy.textContent = 'Copy', 2000);
          }).catch(() => {
            showToast('Failed to copy. Please copy manually.', 'error');
          });
        };
      }
    }
  }
}

// Modal Toggle Functions
function openUpiModal() {
  const modal = document.getElementById('upiModal');
  modal.classList.add('open');
  document.body.style.overflow = 'hidden'; // prevent scroll
  
  // Close triggers
  const closeBtn = document.getElementById('closeUpiModal');
  const overlay = document.getElementById('upiModalOverlay');
  
  const closeModal = () => {
    modal.classList.remove('open');
    document.body.style.overflow = '';
  };
  
  closeBtn.onclick = closeModal;
  overlay.onclick = closeModal;
}

async function handleUtrSubmit(payload) {
  const fileInput = document.getElementById('inpScreenshot');

  if (!fileInput.files || fileInput.files.length === 0) {
    showToast('Please select a payment screenshot', 'warning');
    return;
  }

  const btn = document.getElementById('btnSubmitUtr');
  btn.disabled = true;
  btn.textContent = 'Uploading Screenshot...';

  try {
    const formData = new FormData();
    formData.append('image', fileInput.files[0]);

    // Fast direct upload
    const uploadRes = await fetch('/api/upload/payment-proof', {
      method: 'POST',
      body: formData
    });
    const uploadData = await uploadRes.json();
    if (!uploadData.success) throw new Error(uploadData.message || 'Failed to upload screenshot');

    btn.textContent = 'Placing Order...';

    // Directly append the screenshot URL and place the actual order
    payload.paymentScreenshot = uploadData.image.url;
    
    // Call the original placeOrder logic
    const res = await API.placeOrder(payload);
    if (!res.success) throw new Error(res.message);

    showToast('Order placed successfully!', 'success');
    
    // Wipe cart and local session variables
    Cart.clear();
    sessionStorage.removeItem('pendingUpiOrder');
    
    // Redirect to success page indicating it's awaiting backend verification
    window.location.href = `/order-success?id=${res.order._id}`;

  } catch (err) {
    showToast(err.message || 'Failed to submit payment details', 'error');
    btn.disabled = false;
    btn.textContent = "I've Paid";
  }
}

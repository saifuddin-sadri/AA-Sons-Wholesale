// frontend/js/auth.js
(function() {
  'use strict';

  // ─── Check URL params for approved login ──────────
  const params = new URLSearchParams(window.location.search);
  const isApproved = params.get('approved') === 'true';
  const prefilledEmail = params.get('email') || '';

  // ─── Tab Switching ────────────────────────────────
  const tabs = document.querySelectorAll('.auth-tab');
  const loginPanel = document.getElementById('panelLogin');
  const registerPanel = document.getElementById('panelRegister');
  const loginSuccess = document.getElementById('loginSuccess');
  const registerSuccess = document.getElementById('registerSuccess');
  const approvedBanner = document.getElementById('approvedBanner');

  window.switchTab = function(tab) {
    tabs.forEach(t => t.classList.remove('active'));
    document.querySelector(`[data-tab="${tab}"]`).classList.add('active');

    loginPanel.classList.remove('active');
    registerPanel.classList.remove('active');
    loginSuccess.classList.remove('visible');
    registerSuccess.classList.remove('visible');

    if (tab === 'login') {
      loginPanel.classList.add('active');
    } else {
      registerPanel.classList.add('active');
    }

    // Clear messages
    hideMessage('loginMessage');
    hideMessage('registerMessage');
  };

  tabs.forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  // If user came from approved login email, show banner and prefill email
  if (isApproved) {
    switchTab('login');
    approvedBanner.classList.add('visible');
    document.getElementById('loginEmail').value = decodeURIComponent(prefilledEmail);
    // Change button text to "Login" since they already have approval
    document.getElementById('loginBtnText').textContent = 'Login to Portal';
    // Set a flag so we know to do direct login
    window.__loginApproved = true;
  }

  // ─── Message Helpers ──────────────────────────────
  function showMessage(id, text, type) {
    const el = document.getElementById(id);
    el.textContent = text;
    el.className = `auth-message ${type}`;
    el.style.display = 'block';
  }

  function hideMessage(id) {
    const el = document.getElementById(id);
    el.className = 'auth-message';
    el.style.display = 'none';
  }

  // ─── Password Strength ───────────────────────────
  const regPassword = document.getElementById('regPassword');
  const strengthEl = document.getElementById('passwordStrength');

  if (regPassword) {
    regPassword.addEventListener('input', () => {
      const val = regPassword.value;
      strengthEl.className = 'password-strength';
      if (val.length >= 8 && /[A-Z]/.test(val) && /[0-9]/.test(val)) {
        strengthEl.classList.add('strong');
      } else if (val.length >= 6) {
        strengthEl.classList.add('medium');
      } else if (val.length > 0) {
        strengthEl.classList.add('weak');
      }
    });
  }

  // ─── Business Card Upload ────────────────────────
  const fileInput = document.getElementById('regBusinessCard');
  const uploadArea = document.getElementById('uploadArea');
  const fileName = document.getElementById('fileName');
  const uploadPreview = document.getElementById('uploadPreview');
  let businessCardUrl = '';

  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      if (file.size > 5 * 1024 * 1024) {
        showMessage('registerMessage', 'Business card image must be under 5MB', 'error');
        return;
      }

      uploadArea.classList.add('has-file');
      fileName.textContent = file.name;
      fileName.style.display = 'block';

      // Preview
      const reader = new FileReader();
      reader.onload = (ev) => {
        uploadPreview.src = ev.target.result;
        uploadPreview.style.display = 'block';
      };
      reader.readAsDataURL(file);
    });
  }

  // ─── Upload business card to Cloudinary ──────────
  async function uploadBusinessCard() {
    const file = fileInput.files[0];
    if (!file) return '';

    try {
      const fd = new FormData();
      fd.append('image', file);
      // Use the public business-card endpoint (no auth required)
      const hostname = window.location.hostname;
      const isDev = (hostname === 'localhost' || hostname === '127.0.0.1') && window.location.port !== '5001';
      const base = isDev ? 'http://localhost:5001/api' : '/api';
      const res = await fetch(`${base}/upload/business-card`, {
        method: 'POST',
        body: fd
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Upload failed');
      return data.image?.url || '';
    } catch (err) {
      console.error('Upload failed:', err);
      return '';
    }
  }

  // ─── LOGIN FORM ──────────────────────────────────
  const loginForm = document.getElementById('loginForm');
  const loginBtn = document.getElementById('loginBtn');
  const loginBtnText = document.getElementById('loginBtnText');

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;

    if (!email || !password) {
      showMessage('loginMessage', 'Please fill in all fields', 'error');
      return;
    }

    loginBtn.disabled = true;
    loginBtnText.innerHTML = '<span class="spinner"></span> Processing...';
    hideMessage('loginMessage');

    try {
      if (window.__loginApproved) {
        // Direct login — user came from approved email link
        const data = await API.login({ email, password });
        if (data.success) {
          saveAuth(data.token, data.user);
          if (data.sessionExpiry) {
            localStorage.setItem('aa_session_expiry', data.sessionExpiry);
          }
          // Redirect to main site
          window.location.href = '/';
        }
      } else {
        // Send login request
        const data = await API.loginRequest({ email, password });
        if (data.success) {
          // Check if admin (bypass request system)
          if (data.isAdmin) {
            saveAuth(data.token, data.user);
            window.location.href = '/admin';
            return;
          }
          // Direct login if the request was already approved
          if (data.directLogin) {
            saveAuth(data.token, data.user);
            if (data.sessionExpiry) {
              localStorage.setItem('aa_session_expiry', data.sessionExpiry);
            }
            window.location.href = '/';
            return;
          }
          loginPanel.classList.remove('active');
          loginSuccess.classList.add('visible');
        }
      }
    } catch (err) {
      showMessage('loginMessage', err.message, 'error');
    } finally {
      loginBtn.disabled = false;
      loginBtnText.textContent = window.__loginApproved ? 'Login to Portal' : 'Send Login Request';
    }
  });

  window.resetLoginForm = function() {
    loginSuccess.classList.remove('visible');
    loginPanel.classList.add('active');
    loginForm.reset();
    hideMessage('loginMessage');
  };

  // ─── REGISTER FORM ──────────────────────────────
  const registerForm = document.getElementById('registerForm');
  const registerBtn = document.getElementById('registerBtn');
  const registerBtnText = document.getElementById('registerBtnText');

  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = document.getElementById('regName').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const password = document.getElementById('regPassword').value;
    const businessName = document.getElementById('regBusinessName').value.trim();
    const contactNumber = document.getElementById('regContactNumber').value.trim();
    const street = document.getElementById('regStreet').value.trim();
    const city = document.getElementById('regCity').value.trim();
    const state = document.getElementById('regState').value.trim();
    const pincode = document.getElementById('regPincode').value.trim();

    if (!name || !email || !password || !businessName || !contactNumber || !street || !city || !state || !pincode) {
      showMessage('registerMessage', 'Please fill in all required fields', 'error');
      return;
    }

    if (password.length < 6) {
      showMessage('registerMessage', 'Password must be at least 6 characters', 'error');
      return;
    }

    if (!/^\d{6}$/.test(pincode)) {
      showMessage('registerMessage', 'Please enter a valid 6-digit PIN code', 'error');
      return;
    }

    registerBtn.disabled = true;
    registerBtnText.innerHTML = '<span class="spinner"></span> Submitting...';
    hideMessage('registerMessage');

    try {
      // Upload business card if provided
      let cardUrl = '';
      if (fileInput.files[0]) {
        registerBtnText.innerHTML = '<span class="spinner"></span> Uploading card...';
        cardUrl = await uploadBusinessCard();
      }

      const data = await API.registerRequest({
        name, email, password, businessName, contactNumber,
        businessCard: cardUrl,
        address: { street, city, state, pincode }
      });

      if (data.success) {
        registerPanel.classList.remove('active');
        registerSuccess.classList.add('visible');
      }
    } catch (err) {
      showMessage('registerMessage', err.message, 'error');
    } finally {
      registerBtn.disabled = false;
      registerBtnText.textContent = 'Send Registration Request';
    }
  });

  // ─── Check if already logged in ──────────────────
  function checkExistingSession() {
    const token = API.getToken();
    const user = API.getUser();
    if (!token || !user) return;

    // Admin goes straight to admin panel
    if (user.role === 'admin') {
      window.location.href = '/admin';
      return;
    }

    // Check session expiry
    const expiry = localStorage.getItem('aa_session_expiry');
    if (expiry && new Date() < new Date(expiry)) {
      // Session is still valid, redirect to home
      window.location.href = '/';
      return;
    }

    // Session expired — clear auth
    localStorage.removeItem('aa_token');
    localStorage.removeItem('aa_user');
    localStorage.removeItem('aa_session_expiry');
  }

  checkExistingSession();
})();

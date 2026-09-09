// frontend/js/auth.js
(function() {
  'use strict';

  // ─── Check URL params for approved login ──────────
  const params = new URLSearchParams(window.location.search);
  const isApproved = params.get('approved') === 'true';
  const prefilledMobile = params.get('mobile') || params.get('contactNumber') || params.get('email') || '';

  // ─── Tab Switching & Admin Toggle ─────────────────
  const tabs = document.querySelectorAll('.auth-tab');
  const loginPanel = document.getElementById('panelLogin');
  const registerPanel = document.getElementById('panelRegister');
  const loginSuccess = document.getElementById('loginSuccess');
  const registerSuccess = document.getElementById('registerSuccess');
  const approvedBanner = document.getElementById('approvedBanner');
  const userLoginFields = document.getElementById('userLoginFields');
  const adminLoginFields = document.getElementById('adminLoginFields');
  const toggleAdminBtn = document.getElementById('toggleAdminBtn');

  let isAdminMode = false;

  function setAdminMode(enabled) {
    isAdminMode = enabled;
    if (isAdminMode) {
      userLoginFields.style.display = 'none';
      adminLoginFields.style.display = 'block';
      toggleAdminBtn.textContent = '← Back to Mobile Login';
      document.getElementById('loginBtnText').textContent = 'Admin Login';
      document.getElementById('loginMobile').removeAttribute('required');
      document.getElementById('loginAdminEmail').setAttribute('required', 'true');
      document.getElementById('loginAdminPassword').setAttribute('required', 'true');
    } else {
      adminLoginFields.style.display = 'none';
      userLoginFields.style.display = 'block';
      toggleAdminBtn.textContent = '🔐 Admin Login (Email & Password)';
      document.getElementById('loginBtnText').textContent = window.__loginApproved ? 'Login to Portal' : 'Send Login Request';
      document.getElementById('loginAdminEmail').removeAttribute('required');
      document.getElementById('loginAdminPassword').removeAttribute('required');
      document.getElementById('loginMobile').setAttribute('required', 'true');
    }
  }

  if (toggleAdminBtn) {
    toggleAdminBtn.addEventListener('click', () => {
      setAdminMode(!isAdminMode);
      hideMessage('loginMessage');
    });
  }

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

  // If user came from approved login notification, show banner and prefill mobile
  if (isApproved) {
    switchTab('login');
    approvedBanner.classList.add('visible');
    const loginMobileInput = document.getElementById('loginMobile');
    if (loginMobileInput) {
      loginMobileInput.value = decodeURIComponent(prefilledMobile);
    }
    document.getElementById('loginBtnText').textContent = 'Login to Portal';
    window.__loginApproved = true;
  }

  // ─── Message Helpers ──────────────────────────────
  function showMessage(id, text, type) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
    el.className = `auth-message ${type}`;
    el.style.display = 'block';
  }

  function hideMessage(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.className = 'auth-message';
    el.style.display = 'none';
  }

  // ─── Business Card Upload ────────────────────────
  const fileInput = document.getElementById('regBusinessCard');
  const uploadArea = document.getElementById('uploadArea');
  const fileName = document.getElementById('fileName');
  const uploadPreview = document.getElementById('uploadPreview');

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
    const file = fileInput ? fileInput.files[0] : null;
    if (!file) return '';

    try {
      const fd = new FormData();
      fd.append('image', file);
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

    if (isAdminMode) {
      const email = document.getElementById('loginAdminEmail').value.trim();
      const password = document.getElementById('loginAdminPassword').value;

      if (!email || !password) {
        showMessage('loginMessage', 'Please enter admin email and password', 'error');
        return;
      }

      loginBtn.disabled = true;
      loginBtnText.innerHTML = '<span class="spinner"></span> Logging in...';
      hideMessage('loginMessage');

      try {
        const data = await API.login({ email, password });
        if (data.success && data.isAdmin) {
          saveAuth(data.token, data.user);
          window.location.href = '/admin';
          return;
        }
      } catch (err) {
        showMessage('loginMessage', err.message, 'error');
      } finally {
        loginBtn.disabled = false;
        loginBtnText.textContent = 'Admin Login';
      }
      return;
    }

    // Regular Mobile Number Login Flow
    const mobile = document.getElementById('loginMobile').value.trim();
    if (!mobile) {
      showMessage('loginMessage', 'Please enter your registered mobile number', 'error');
      return;
    }

    loginBtn.disabled = true;
    loginBtnText.innerHTML = '<span class="spinner"></span> Processing...';
    hideMessage('loginMessage');

    // Clear any previous session state when attempting a new login
    API.logout();

    try {
      if (window.__loginApproved) {
        // Direct login if request was approved via link
        const data = await API.login({ contactNumber: mobile });
        if (data.success) {
          saveAuth(data.token, data.user);
          if (data.sessionExpiry) {
            localStorage.setItem('aa_session_expiry', data.sessionExpiry);
          }
          window.location.href = '/';
          return;
        }
      } else {
        // Send login request
        const data = await API.loginRequest({ contactNumber: mobile });
        if (data.success) {
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
    const businessName = document.getElementById('regBusinessName').value.trim();
    const contactNumber = document.getElementById('regContactNumber').value.trim();
    const street = document.getElementById('regStreet').value.trim();
    const city = document.getElementById('regCity').value.trim();
    const state = document.getElementById('regState').value.trim();
    const pincode = document.getElementById('regPincode').value.trim();

    if (!name || !email || !businessName || !contactNumber || !street || !city || !state || !pincode) {
      showMessage('registerMessage', 'Please fill in all required fields', 'error');
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
      let cardUrl = '';
      if (fileInput && fileInput.files[0]) {
        registerBtnText.innerHTML = '<span class="spinner"></span> Uploading card...';
        cardUrl = await uploadBusinessCard();
      }

      const data = await API.registerRequest({
        name, email, businessName, contactNumber,
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

  // ─── Check existing session ──────────────────────
  function checkExistingSession() {
    // If coming from an approved login link, don't show active session notice
    if (isApproved) return;

    const token = API.getToken();
    const user = API.getUser();
    if (!token || !user) return;

    // Check session expiry
    const expiry = localStorage.getItem('aa_session_expiry');
    if (expiry && new Date() < new Date(expiry)) {
      // If user came to /auth, show active session notice without auto-redirecting
      if (approvedBanner && user.name) {
        approvedBanner.className = 'approved-banner visible';
        approvedBanner.style.background = 'rgba(27,94,75,0.08)';
        approvedBanner.style.borderColor = 'rgba(27,94,75,0.2)';
        approvedBanner.innerHTML = `<span class="icon">👤</span><span class="text" style="color: var(--teal);">Currently logged in as <strong>${user.name}</strong> (${user.contactNumber || user.email || ''}). <a href="/" style="color: var(--teal); font-weight:700; text-decoration: underline; margin-left: 6px;">Go to Portal →</a></span>`;
      }
      return;
    }

    // Session expired — clear auth
    API.logout();
  }

  checkExistingSession();
})();

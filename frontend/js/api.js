// ─── AUTH GATE: Runs on page load for all gated pages ───
(function authGate() {
  const path = window.location.pathname;
  if (path === '/auth' || path === '/admin') return;

  const token = localStorage.getItem('aa_token');
  const userStr = localStorage.getItem('aa_user');

  if (!token || !userStr) {
    window.location.href = '/auth';
    return;
  }

  try {
    const user = JSON.parse(userStr);
    if (user.role === 'admin') return; // Admins bypass expiry check
  } catch (e) {
    window.location.href = '/auth';
    return;
  }

  const expiry = localStorage.getItem('aa_session_expiry');
  if (!expiry || new Date() >= new Date(expiry)) {
    localStorage.removeItem('aa_token');
    localStorage.removeItem('aa_user');
    localStorage.removeItem('aa_session_expiry');
    window.location.href = '/auth';
    return;
  }
})();

const API = (() => {
  // In production (Render), use relative paths. In dev, proxy to local backend.
  const hostname = window.location.hostname;
  const isDev = (hostname === 'localhost' || hostname === '127.0.0.1') && window.location.port !== '5001';
  const BASE = isDev ? 'http://localhost:5001/api' : '/api';

  const getToken = () => localStorage.getItem('aa_token');
  const getUser  = () => { try { return JSON.parse(localStorage.getItem('aa_user')); } catch { return null; } };

  const headers = (extra = {}) => {
    const h = { 'Content-Type': 'application/json', ...extra };
    const token = getToken();
    if (token) h['Authorization'] = `Bearer ${token}`;
    return h;
  };

  const req = async (method, path, body, noContent = false) => {
    const opts = { method, headers: headers() };
    if (body && !noContent) opts.body = JSON.stringify(body);
    const res = await fetch(BASE + path, opts);
    
    // Auto-logout if token is expired or unauthorized
    if (res.status === 401 && !['/auth/login', '/auth/login-request', '/auth/register-request'].includes(path)) {
      localStorage.removeItem('aa_token');
      localStorage.removeItem('aa_user');
      window.location.href = '/?login=true';
      return;
    }

    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Request failed');
    return data;
  };

  return {
    getToken, getUser,
    isLoggedIn: () => !!getToken(),
    isAdmin: () => getUser()?.role === 'admin',

    // Auth
    login:    (body) => req('POST', '/auth/login', body),
    register: (body) => req('POST', '/auth/register', body),
    me:       ()     => req('GET',  '/auth/me'),
    logout: () => { localStorage.removeItem('aa_token'); localStorage.removeItem('aa_user'); },

    // Products
    getProducts:     (params) => req('GET', `/products?${new URLSearchParams(params)}`),
    getProduct:      (id)     => req('GET', `/products/${id}`),
    getCategories:   ()       => req('GET', '/categories/active'),
    createProduct:   (body)   => req('POST', '/products', body),
    updateProduct:   (id, b)  => req('PUT',  `/products/${id}`, b),
    deleteProduct:   (id)     => req('DELETE',`/products/${id}`),
    adminGetProducts:(p)      => req('GET',  `/products/admin/all?${new URLSearchParams(p)}`),

    // Categories
    adminGetCategories:    ()     => req('GET',  '/categories'),
    adminCreateCategory:   (body) => req('POST', '/categories', body),
    adminUpdateCategory:   (id, b)=> req('PUT',  `/categories/${id}`, b),
    adminDeleteCategory:   (id)   => req('DELETE',`/categories/${id}`),

    // FAQs
    adminGetFaqs:          ()     => req('GET',  '/faqs/admin'),
    adminAnswerFaq:        (id, b)=> req('POST', `/faqs/admin/answer/${id}`, b),
    adminUpdateFaq:        (id, b)=> req('PUT',  `/faqs/admin/${id}`, b),
    adminDeleteFaq:        (id)   => req('DELETE', `/faqs/admin/${id}`),

    // Cart validate
    validateCart:    (items)  => req('POST', '/cart/validate', { items }),

    // Orders
    placeOrder:      (body)   => req('POST', '/orders', body),
    myOrders:        ()       => req('GET',  '/orders/my'),
    adminGetOrders:  (p)      => req('GET',  `/orders/admin/all?${new URLSearchParams(p)}`),
    adminGetOrder:   (id)     => req('GET',  `/orders/admin/${id}`),
    adminUpdateStatus:   (id, b) => req('PATCH', `/orders/admin/${id}/status`, b),
    adminUpdateTracking: (id, b) => req('PATCH', `/orders/admin/${id}/tracking`, b),
    adminCreateManualOrder: (body) => req('POST', '/orders/admin/manual-order', body),
    dashboardStats:  (filter) => req('GET',  `/orders/admin/stats/dashboard?dateFilter=${filter || 'all'}`),

    // Upload
    uploadImage: async (file) => {
      const fd = new FormData();
      fd.append('image', file);
      const res = await fetch(`${BASE}/upload/image`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
        body: fd
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      return data;
    },
    uploadImages: async (files) => {
      const fd = new FormData();
      files.forEach(f => fd.append('images', f));
      const res = await fetch(`${BASE}/upload/images`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
        body: fd
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      return data;
    },

    // Payment
    getPaymentConfig:()           => req('GET',  '/orders/payment/config'),
    createRazorpayOrder: (amount) => req('POST', '/payment/create-order', { amount }),
    verifyPayment: (body)         => req('POST', '/payment/verify', body),
    
    // Bulk Enquiries
    submitBulkEnquiry: (body) => req('POST', '/bulk-enquiry', body),
    adminGetBulkEnquiries: () => req('GET', '/bulk-enquiry'),
    adminUpdateBulkEnquiryStatus: (id, status) => req('PATCH', `/bulk-enquiry/${id}/status`, { status }),
    
    // Promotions (Festive Season)
    getPromotion: () => req('GET', '/promotions'),
    updatePromotion: (body) => req('PUT', '/promotions', body),

    // Notifications
    getNotifications: () => req('GET', '/notifications'),
    markNotificationRead: (id) => req('PATCH', `/notifications/${id}/read`),
    deleteNotification: (id) => req('DELETE', `/notifications/${id}`),
    clearAllNotifications: () => req('DELETE', '/notifications'),

    // Auth — Registration & Login Requests
    registerRequest:   (body)  => req('POST', '/auth/register-request', body),
    loginRequest:      (body)  => req('POST', '/auth/login-request', body),
    login:             (body)  => req('POST', '/auth/login', body),
    getSessionStatus:  ()      => req('GET',  '/auth/session-status'),

    // Admin — Registration Requests
    adminGetRegistrationRequests: ()   => req('GET',  '/auth/admin/registration-requests'),
    adminGetRegistrationRequest: (id)  => req('GET',  `/auth/admin/registration-requests/${id}`),
    adminApproveRegistration:    (id)  => req('PATCH',`/auth/admin/registration-requests/${id}/approve`),
    adminRejectRegistration:     (id)  => req('PATCH',`/auth/admin/registration-requests/${id}/reject`),

    // Admin — Login Requests
    adminGetLoginRequests:       ()    => req('GET',  '/auth/admin/login-requests'),
    adminGetLoginRequest:        (id)  => req('GET',  `/auth/admin/login-requests/${id}`),
    adminApproveLogin:           (id)  => req('PATCH',`/auth/admin/login-requests/${id}/approve`),
    adminRejectLogin:            (id)  => req('PATCH',`/auth/admin/login-requests/${id}/reject`),

    // Admin — Users
    adminGetUsers:               ()    => req('GET',  '/auth/admin/users'),
    adminDeleteUser:             (id)  => req('DELETE',`/auth/admin/users/${id}`),
  };

})();

// Save auth data helper
function saveAuth(token, user) {
  localStorage.setItem('aa_token', token);
  localStorage.setItem('aa_user', JSON.stringify(user));
}
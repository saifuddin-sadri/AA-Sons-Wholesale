// frontend/js/admin.js
let currentAdminPage = 'dashboard';
let ordersPage = 1;
let uploadedImages = []; // { url, public_id }
let productVariations = []; // { color, size, price, mrp, stock }
let baseBulkPrices = []; // { quantity, price, mrp }
let festiveProducts = []; // Array of selected product objects
let moSelectedItems = []; // Array of items for manual order
let moSearchResults = []; // Current search results for manual orders

document.addEventListener('DOMContentLoaded', () => {
  checkAdminAuth();
  if (window.innerWidth <= 768) {
    document.getElementById('sidebarToggle').style.display = 'flex';
  }

  // Global listeners for Product Form
  const imageFileInput = document.getElementById('imageFileInput');
  if (imageFileInput) imageFileInput.onchange = handleImageUpload;

  const saveProductBtn = document.getElementById('saveProductBtn');
  if (saveProductBtn) saveProductBtn.onclick = saveProduct;

  // Search & Filter Listeners
  let searchTimer;
  document.getElementById('orderSearch')?.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { ordersPage = 1; loadOrders(); }, 500);
  });
  document.getElementById('orderStatusFilter')?.addEventListener('change', () => { ordersPage = 1; loadOrders(); });
  document.getElementById('completeDashboardFilter')?.addEventListener('change', loadCompleteDashboard);
  document.getElementById('productSearch')?.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(loadAdminProducts, 400);
  });
  document.getElementById('categorySearch')?.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(loadAdminCategories, 400);
  });
  document.getElementById('inventorySearch')?.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(filterInventory, 400);
  });
  document.getElementById('bulkEnquirySearch')?.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(loadBulkEnquiries, 400);
  });
  document.getElementById('bulkStatusFilter')?.addEventListener('change', loadBulkEnquiries);

  // Notification Polling
  setTimeout(() => {
    if (API.isLoggedIn() && API.isAdmin()) {
      loadNotifications();
      // Poll every 2 minutes
      setInterval(loadNotifications, 120000);
    }
  }, 1000);
});

/* ── Auth ────────────────────────────────────────────── */
function checkAdminAuth() {
  if (API.isLoggedIn() && API.isAdmin()) {
    showAdminApp();
  } else {
    showLoginGate();
  }
}

function showLoginGate() {
  const gate = document.getElementById('loginGate');
  gate.style.display = 'flex';
  document.getElementById('adminApp').style.display  = 'none';
  initLoginForm();
}

function showAdminApp() {
  document.getElementById('loginGate').style.display = 'none';
  document.getElementById('adminApp').style.display  = 'block';
  const user = API.getUser();
  document.getElementById('adminUserName').textContent = user?.name || 'Admin';
  initAdminNav();
  showPage('dashboard');
}

function initLoginForm() {
  document.getElementById('loginBtn').addEventListener('click', async () => {
    const email    = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const errEl    = document.getElementById('loginError');
    const btn      = document.getElementById('loginBtn');

    errEl.style.display = 'none';
    btn.disabled = true;
    btn.textContent = 'Signing in…';

    try {
      const res = await API.login({ email, password });
      if (res.user.role !== 'admin') throw new Error('Not an admin account');
      saveAuth(res.token, res.user);
      showAdminApp();
    } catch (err) {
      errEl.textContent = err.message || 'Login failed';
      errEl.style.display = 'block';
      btn.disabled = false;
      btn.textContent = 'Sign In to Admin';
    }
  });

  // Enter key
  ['loginEmail','loginPassword'].forEach(id => {
    document.getElementById(id).addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('loginBtn').click();
    });
  });
}

function adminLogout() {
  API.logout();
  showLoginGate();
}

/* ── Navigation ─────────────────────────────────────── */
function initAdminNav() {
  document.querySelectorAll('.admin-nav-item').forEach(item => {
    item.addEventListener('click', () => {
      const page = item.dataset.page;
      showPage(page);
      if (page === 'add-product') initProductForm(null);
      // Close sidebar on mobile
      document.getElementById('adminSidebar').classList.remove('open');
    });
  });
}

function showPage(page) {
  currentAdminPage = page;

  document.querySelectorAll('.admin-page').forEach(p => p.style.display = 'none');
  document.querySelectorAll('.admin-nav-item').forEach(n => n.classList.remove('active'));

  const pageEl = document.getElementById(`page-${page}`);
  if (pageEl) pageEl.style.display = 'block';

  const navEl = document.querySelector(`.admin-nav-item[data-page="${page}"]`);
  if (navEl) navEl.classList.add('active');

  const titles = {
    'dashboard':   'Dashboard',
    'complete-dashboard': 'Complete Dashboard',
    'orders':      'Orders Management',
    'products':    'Products',
    'categories':  'Manage Categories',
    'faq':         'FAQs & Queries',
    'add-product': 'Add New Product',
    'inventory':   'Stock Alerts',
    'bulk-enquiries': 'Bulk Enquiries Management',
    'festive':     'Manage Festive Season',
    'manual-order': 'Create Manual Order',
    'login-requests': 'Login Requests',
    'users': 'Authorised Users'
  };
  document.getElementById('adminPageTitle').textContent = titles[page] || page;

  if (page === 'dashboard') loadDashboard();
  if (page === 'complete-dashboard') loadCompleteDashboard();
  if (page === 'orders')    loadOrders();
  if (page === 'products')  loadAdminProducts();
  if (page === 'categories') loadAdminCategories();
  if (page === 'faq') loadAdminFaqs();
  if (page === 'inventory') loadInventory();
  if (page === 'bulk-enquiries') loadBulkEnquiries();
  if (page === 'festive') loadFestiveSettings();
  if (page === 'manual-order') initManualOrderPage();
  if (page === 'login-requests') loadLoginRequests();
  if (page === 'users') loadUsers();
}

/* ── Dashboard ──────────────────────────────────────── */
async function loadDashboard() {
  try {
    const data = await API.dashboardStats('today');
    const s = data.stats;

    document.getElementById('ds-orders').textContent    = s.totalOrders || 0;
    document.getElementById('ds-revenue').textContent   = formatRupees(s.totalRevenue || 0);

    let pending = s.ordersByStatus?.find(x => x._id === 'payment_pending')?.count || 0;
    pending += s.ordersByStatus?.find(x => x._id === 'payment_received')?.count || 0;
    
    const delivered = s.ordersByStatus?.find(x => x._id === 'delivered')?.count || 0;
    document.getElementById('ds-pending').textContent   = pending;
    document.getElementById('ds-delivered').textContent = delivered;
    document.getElementById('ds-shipping').textContent  = formatRupees(s.totalShipping || 0);

    // Recent orders table
    const tbody = document.getElementById('recentOrdersBody');
    if (!s.recentOrders?.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--mid)">No orders yet</td></tr>';
      return;
    }
    tbody.innerHTML = s.recentOrders.map(o => `
      <tr>
        <td>
          <strong style="color:var(--teal)">${o.orderNumber}</strong>
          ${o.isManual ? '<div style="font-size:0.55rem; color:#e67e22; font-weight:800; text-transform:uppercase;">Manual</div>' : ''}
        </td>
        <td>${o.shippingAddress?.name || '—'}</td>
        <td><strong>${formatRupees(o.total)}</strong></td>
        <td style="color:var(--mid)">${formatRupees(o.shippingCost || 0)}</td>
        <td><span class="badge badge-${o.status}">${o.status}</span></td>
        <td>${new Date(o.createdAt).toLocaleDateString('en-IN')}</td>
        <td>
          <button class="btn-icon view" onclick="viewOrder('${o._id}')">👁</button>
        </td>
      </tr>`).join('');
  } catch (err) {
    console.error(err);
    showToast('Failed to load dashboard', 'error');
  }
}

async function loadCompleteDashboard() {
  try {
    const filter = document.getElementById('completeDashboardFilter')?.value || 'all';
    const data = await API.dashboardStats(filter);
    const s = data.stats;

    document.getElementById('cds-orders').textContent    = s.totalOrders || 0;
    document.getElementById('cds-revenue').textContent   = formatRupees(s.totalRevenue || 0);

    let pending = s.ordersByStatus?.find(x => x._id === 'payment_pending')?.count || 0;
    pending += s.ordersByStatus?.find(x => x._id === 'payment_received')?.count || 0;
    
    const delivered = s.ordersByStatus?.find(x => x._id === 'delivered')?.count || 0;
    document.getElementById('cds-pending').textContent   = pending;
    document.getElementById('cds-delivered').textContent = delivered;
    document.getElementById('cds-shipping').textContent  = formatRupees(s.totalShipping || 0);

    // Recent orders table
    const tbody = document.getElementById('cds-recentOrdersBody');
    if (!s.recentOrders?.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--mid)">No orders found</td></tr>';
      return;
    }
    tbody.innerHTML = s.recentOrders.map(o => `
      <tr>
        <td>
          <strong style="color:var(--teal)">${o.orderNumber}</strong>
          ${o.isManual ? '<div style="font-size:0.55rem; color:#e67e22; font-weight:800; text-transform:uppercase;">Manual</div>' : ''}
        </td>
        <td>${o.shippingAddress?.name || '—'}</td>
        <td><strong>${formatRupees(o.total)}</strong></td>
        <td style="color:var(--mid)">${formatRupees(o.shippingCost || 0)}</td>
        <td><span class="badge badge-${o.status}">${o.status}</span></td>
        <td>${new Date(o.createdAt).toLocaleDateString('en-IN')}</td>
        <td>
          <button class="btn-icon view" onclick="viewOrder('${o._id}')">👁</button>
        </td>
      </tr>`).join('');
  } catch (err) {
    console.error(err);
    showToast('Failed to load complete dashboard', 'error');
  }
}

/* ── Orders ──────────────────────────────────────────── */
function formatRupees(amount) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(amount);
}

async function loadOrders() {
  const status  = document.getElementById('orderStatusFilter')?.value || 'all';
  const search  = document.getElementById('orderSearch')?.value.trim() || '';
  const tbody   = document.getElementById('ordersTableBody');
  tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:24px;color:var(--mid)">Loading…</td></tr>';

  try {
    const data = await API.adminGetOrders({ status, search, page: ordersPage, limit: 15 });

    if (!data.orders?.length) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:32px;color:var(--mid)">No orders found</td></tr>';
      return;
    }

    tbody.innerHTML = data.orders.map(o => `
      <tr>
        <td>
          <strong style="color:var(--teal);font-size:.82rem">${o.orderNumber}</strong>
          ${o.isManual ? '<div style="font-size:0.6rem; color:#e67e22; font-weight:800; text-transform:uppercase; margin-top:2px;">Manual Order</div>' : ''}
        </td>
        <td>
          <div style="font-size:.84rem;font-weight:500">${o.shippingAddress?.name || o.guestInfo?.name || '—'}</div>
          <div style="font-size:.72rem;color:var(--mid)">${o.shippingAddress?.phone || ''}</div>
        </td>
        <td>${o.items?.length || 0} items</td>
        <td><strong>${formatRupees(o.total)}</strong></td>
        <td style="color:var(--mid)">${formatRupees(o.shippingCost || 0)}</td>
        <td><span class="badge badge-${o.paymentStatus}">${o.paymentStatus}</span></td>
        <td><span class="badge badge-${o.status}">${o.status}</span></td>
        <td style="font-size:.78rem">${new Date(o.createdAt).toLocaleDateString('en-IN')}</td>
        <td>
          <div style="display:flex; gap:6px; align-items:center; flex-wrap:nowrap; white-space:nowrap;">
            <button class="btn-icon view" onclick="viewOrder('${o._id}')" title="View Detail" style="width:auto; padding:4px 8px; white-space:nowrap;">View Detail</button>
            <button class="btn-icon view" onclick="window.open('/invoice?id=${o._id}', '_blank')" title="Invoice" style="width:auto; padding:4px 8px; background:var(--teal); color:white; white-space:nowrap;">Invoice</button>
            <button class="btn-icon view" onclick="window.open('/worker-bill?id=${o._id}', '_blank')" title="Worker Bill" style="width:auto; padding:4px 8px; background:var(--gold); color:white; white-space:nowrap;">Worker Bill</button>
          </div>
        </td>
      </tr>`).join('');

    const info = document.getElementById('ordersPaginationInfo');
    if (info) info.textContent = `Page ${ordersPage} — ${data.total} total orders`;
    const headerBadge = document.getElementById('badgeTotalOrders');
    if (headerBadge) headerBadge.textContent = data.total;
    document.getElementById('ordersPrevBtn').disabled = ordersPage <= 1;
    document.getElementById('ordersNextBtn').disabled = ordersPage >= Math.ceil(data.total / 15);

    // Separately load and render Manual Orders for the dedicated section (latest 10)
    API.adminGetOrders({ isManual: 'true', limit: 10 }).then(res => {
      if (res.success) renderManualOrdersTable(res.orders);
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:24px;color:#C62828">${err.message}</td></tr>`;
  }
}

function renderManualOrdersTable(manualOrders) {
  const manualTableBody = document.getElementById('manualOrdersTableBody');
  if (!manualTableBody) return;

  if (!manualOrders || manualOrders.length === 0) {
    manualTableBody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:32px;color:var(--mid)">No manual orders found.</td></tr>';
    return;
  }

  manualTableBody.innerHTML = manualOrders.map(o => `
    <tr>
      <td><strong style="color:var(--teal);font-size:.82rem">${o.orderNumber}</strong></td>
      <td>
        <div style="font-size:.84rem;font-weight:500">${o.shippingAddress?.name || o.guestInfo?.name || '—'}</div>
        <div style="font-size:.72rem;color:var(--mid)">${o.shippingAddress?.phone || ''}</div>
      </td>
      <td>${o.items?.length || 0} items</td>
      <td><strong>${formatRupees(o.total)}</strong></td>
      <td style="color:var(--mid)">${formatRupees(o.shippingCost || 0)}</td>
      <td><span class="badge badge-${o.paymentStatus || 'pending'}">${o.paymentStatus || 'pending'}</span></td>
      <td><span class="badge badge-${o.status}">${o.status}</span></td>
      <td style="font-size:.78rem">${new Date(o.createdAt).toLocaleDateString('en-IN')}</td>
      <td>
        <div style="display:flex; gap:6px; align-items:center;">
          <button class="btn-icon view" onclick="viewOrder('${o._id}')" title="View Detail" style="width:auto; padding:4px 8px;">View Detail</button>
          <button class="btn-icon view" onclick="window.open('/invoice?id=${o._id}', '_blank')" title="Invoice" style="width:auto; padding:4px 8px; background:var(--teal); color:white;">Invoice</button>
          <button class="btn-icon view" onclick="window.open('/worker-bill?id=${o._id}', '_blank')" title="Worker Bill" style="width:auto; padding:4px 8px; background:var(--gold); color:white;">Worker Bill</button>
        </div>
      </td>
    </tr>`).join('');
}



function viewOrder(id) {
  window.location.href = `/admin-order-details?id=${id}`;
}

/* ── Products ─────────────────────────────────────────── */
async function loadAdminProducts() {
  const search = document.getElementById('productSearch')?.value.trim() || '';
  const tbody  = document.getElementById('productsTableBody');
  tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--mid)">Loading…</td></tr>';

  try {
    const data = await API.adminGetProducts({ search, limit: 50 });
    const headerBadge = document.getElementById('badgeTotalProducts');
    if (headerBadge) headerBadge.textContent = data.total || 0;
    
    if (!data.products?.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--mid)">No products yet. <button onclick="showPage(\'add-product\')" style="color:var(--teal);font-weight:600">Add one →</button></td></tr>';
      return;
    }

    tbody.innerHTML = data.products.map(p => {
      const img = p.images?.[0]?.url;
      const discount = p.mrp && p.mrp > p.price ? Math.round((1 - p.price / p.mrp) * 100) : 0;
      
      return `
        <tr>
          <td>
            <div style="width:48px;height:54px;border-radius:6px;overflow:hidden;background:var(--light-gray)">
              ${img ? `<img src="${img}" style="width:100%;height:100%;object-fit:cover" alt="${p.name}"/>` : '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:1.4rem">🛍️</div>'}
            </div>
          </td>
          <td>
            <div style="font-weight:600;font-size:.88rem">${p.name}</div>
            ${discount > 0 ? `<span style="font-size:.7rem;color:#2e7d32;font-weight:600">${discount}% off</span>` : ''}
          </td>
          <td><span style="font-size:.78rem;background:var(--cream);padding:2px 8px;border-radius:4px;color:var(--teal-dark)">${Array.isArray(p.category) ? p.category.join(', ') : p.category}</span></td>
          <td>
            <strong>${formatRupees(p.price)}</strong>
            ${p.mrp > p.price ? `<div style="font-size:.72rem;color:#aaa;text-decoration:line-through">${formatRupees(p.mrp)}</div>` : ''}
          </td>
          <td>
            <span class="badge ${p.active ? 'badge-delivered' : 'badge-cancelled'}">${p.active ? 'Active' : 'Hidden'}</span>
            ${p.featured ? '<span class="badge badge-placed" style="margin-left:4px">⭐ Featured</span>' : ''}
          </td>
          <td>
            <div style="display:flex;gap:6px">
              <button class="btn-icon edit" onclick="editProduct('${p._id}')" title="Edit">✏️</button>
              <button class="btn-icon delete" onclick="confirmDeleteProduct('${p._id}', '${p.name.replace(/'/g,"\\'")}') " title="Delete">🗑️</button>
            </div>
          </td>
        </tr>`;
    }).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:24px;color:#C62828">${err.message}</td></tr>`;
  }
}

/* ── Categories ────────────────────────────────────────── */
async function loadAdminCategories() {
  const search = document.getElementById('categorySearch')?.value.trim().toLowerCase() || '';
  const tbody = document.getElementById('categoriesTableBody');
  tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--mid)">Loading…</td></tr>';
  try {
    const data = await API.adminGetCategories();
    let categories = data.categories || [];
    const headerBadge = document.getElementById('badgeTotalCategories');
    if (headerBadge) headerBadge.textContent = categories.length;

    if (search) {
      categories = categories.filter(c => 
        c.name.toLowerCase().includes(search) || 
        c.slug.toLowerCase().includes(search) ||
        (c.description || '').toLowerCase().includes(search)
      );
    }

    if (!categories.length) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--mid)">${search ? 'No categories matching search.' : 'No categories yet.'}</td></tr>`;
      return;
    }

    // Hierarchical Rendering
    const parents = categories.filter(c => !c.parent);
    const children = categories.filter(c => c.parent);
    let html = '';

    parents.forEach(p => {
      // Parent Row
      html += `
        <tr style="background: rgba(200, 135, 58, 0.06); border-left: 4px solid var(--gold);">
          <td>
            <span style="font-size:0.6rem; background:var(--teal); color:white; padding:2px 4px; border-radius:3px; margin-right:8px; vertical-align:middle;">PARENT</span>
            <strong>${p.name}</strong>
          </td>
          <td><code>${p.slug}</code></td>
          <td style="font-size:.8rem;color:var(--mid)">${p.description || '—'}<br><small>Mode: ${p.displayType || 'card'}</small></td>
          <td><span class="badge ${p.active ? 'badge-delivered' : 'badge-cancelled'}">${p.active ? 'Active' : 'Hidden'}</span></td>
          <td>
            <button class="btn-text" style="font-size:0.75rem; padding:4px 8px;" onclick="addSubCategory('${p._id}')">+ Add Sub</button>
          </td>
          <td>
            <div style="display:flex;gap:6px">
              <button class="btn-icon edit" onclick="editCategory('${p._id}', '${p.name.replace(/'/g,"\\'")}', '${(p.description||"").replace(/'/g,"\\'")}', ${p.active}, '', '${p.displayType || 'card'}', '${p.image ? encodeURIComponent(JSON.stringify(p.image)) : ''}', '${p.posters ? encodeURIComponent(JSON.stringify(p.posters)) : ''}')" title="Edit">✏️</button>
              <button class="btn-icon delete" onclick="deleteCategory('${p._id}')" title="Delete">🗑️</button>
            </div>
          </td>
        </tr>`;

      // Children Rows
      const subCats = children.filter(c => c.parent?._id === p._id || c.parent === p._id);
      subCats.forEach(s => {
        html += `
          <tr class="sub-category-row" style="background: var(--white);">
            <td style="padding-left: 50px; position: relative;">
              <span style="position: absolute; left: 20px; top: 50%; transform: translateY(-50%); color: var(--gold-light); font-size: 1.2rem;">↳</span>
              <strong>${s.name}</strong>
            </td>
            <td><code>${s.slug}</code></td>
            <td style="font-size:.8rem;color:var(--mid)">${s.description || '—'}<br><small>Mode: ${s.displayType || 'card'}</small></td>
            <td><span class="badge ${s.active ? 'badge-delivered' : 'badge-cancelled'}">${s.active ? 'Active' : 'Hidden'}</span></td>
            <td>—</td>
            <td>
              <div style="display:flex;gap:6px">
                <button class="btn-icon edit" onclick="editCategory('${s._id}', '${s.name.replace(/'/g,"\\'")}', '${(s.description||"").replace(/'/g,"\\'")}', ${s.active}, '${p._id}', '${s.displayType || 'card'}', '${s.image ? encodeURIComponent(JSON.stringify(s.image)) : ''}', '${s.posters ? encodeURIComponent(JSON.stringify(s.posters)) : ''}')" title="Edit">✏️</button>
                <button class="btn-icon delete" onclick="deleteCategory('${s._id}')" title="Delete">🗑️</button>
              </div>
            </td>
          </tr>`;
      });
    });

    // Add orphaned children (if any)
    const orphaned = children.filter(c => !parents.some(p => p._id === (c.parent?._id || c.parent)));
    orphaned.forEach(s => {
      html += `<tr><td colspan="6">... (Orphaned Sub: ${s.name}) ...</td></tr>`; 
    });

    tbody.innerHTML = html;
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:24px;color:#C62828">${err.message}</td></tr>`;
  }
}

window.addSubCategory = async function(parentId) {
  openCategoryModal();
  document.getElementById('categoryModalTitle').textContent = 'Add Sub-Category';
  await populateParentCategories(parentId);
};

let currentCategoryImg = null;
let currentCategoryPosters = [];

async function handleCatImageUpload(e) {
  const files = Array.from(e.target.files);
  if (!files.length) return;

  const zone = document.getElementById('catUploadZone');
  zone.innerHTML = `<div class="upload-icon">⏳</div><p>Uploading image…</p>`;

  try {
    const data = await API.uploadImage(files[0]);
    currentCategoryImg = data.image;
    
    document.getElementById('catImgPreview').innerHTML = `
      <div class="img-preview-item">
        <img src="${currentCategoryImg.url}" alt="Category image"/>
        <button class="img-preview-remove" onclick="removeCatImage(event)">✕</button>
      </div>`;
    showToast('Image uploaded!', 'success');
  } catch (err) {
    showToast(err.message || 'Upload failed', 'error');
  }

  zone.innerHTML = `<div class="upload-icon">📷</div><p>Click to upload category image</p>`;
  e.target.value = '';
}

function removeCatImage(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  currentCategoryImg = null;
  document.getElementById('catImgPreview').innerHTML = '';
}

async function handleCatPostersUpload(e) {
  const files = Array.from(e.target.files);
  if (!files.length) return;

  const zone = document.getElementById('catPostersUploadZone');
  const originalHtml = zone.innerHTML;
  zone.innerHTML = `<div class="upload-icon">⏳</div><p>Uploading poster(s)…</p>`;

  try {
    if (files.length === 1) {
      const data = await API.uploadImage(files[0]);
      currentCategoryPosters.push(data.image);
    } else {
      const data = await API.uploadImages(files);
      if (data.images && data.images.length) {
        currentCategoryPosters.push(...data.images);
      }
    }
    renderCatPostersPreview();
    showToast('Poster(s) uploaded successfully!', 'success');
  } catch (err) {
    showToast(err.message || 'Upload failed', 'error');
  }

  zone.innerHTML = originalHtml;
  e.target.value = '';
}

function renderCatPostersPreview() {
  const container = document.getElementById('catPostersPreview');
  if (!container) return;
  
  container.innerHTML = currentCategoryPosters.map((img, index) => `
    <div class="img-preview-item" data-index="${index}">
      <img src="${img.url}" alt="Category poster ${index + 1}"/>
      <button class="img-preview-remove" onclick="removeCatPoster(event, ${index})">✕</button>
    </div>
  `).join('');
}

function removeCatPoster(e, index) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  currentCategoryPosters.splice(index, 1);
  renderCatPostersPreview();
}

function openCategoryModal() {
  document.getElementById('categoryModalTitle').textContent = 'Add Category';
  document.getElementById('editCategoryId').value = '';
  document.getElementById('catName').value = '';
  document.getElementById('catDescription').value = '';
  document.getElementById('catParent').value = '';
  document.getElementById('catDisplayType').value = 'card';
  document.getElementById('catActive').checked = true;
  document.getElementById('saveCategoryBtn').textContent = 'Save Category';
  
  currentCategoryImg = null;
  document.getElementById('catImgPreview').innerHTML = '';

  // Populate parent dropdown
  populateParentCategories();
  
  document.getElementById('categoryModal').classList.add('open');
}

async function populateParentCategories(selectedParent = null) {
  const parentSelect = document.getElementById('catParent');
  const currentId = document.getElementById('editCategoryId').value;
  try {
    const data = await API.adminGetCategories();
    const categories = data.categories || [];
    
    // Filter out the current category itself to prevent circular reference
    const options = categories
      .filter(c => c._id !== currentId)
      .map(c => `<option value="${c._id}" ${selectedParent === c._id ? 'selected' : ''}>${c.name}</option>`)
      .join('');
    
    parentSelect.innerHTML = '<option value="">None (Top Level)</option>' + options;
  } catch (err) {
    console.error('Failed to load parent categories:', err);
  }
}

function editCategory(id, name, desc, active, parent, displayType, imageStr, postersStr) {
  document.getElementById('categoryModalTitle').textContent = 'Edit Category';
  document.getElementById('editCategoryId').value = id;
  document.getElementById('catName').value = name;
  document.getElementById('catDescription').value = desc;
  document.getElementById('catActive').checked = active;
  document.getElementById('catDisplayType').value = displayType || 'card';
  document.getElementById('saveCategoryBtn').textContent = 'Update Category';
  
  if (imageStr) {
    try {
      currentCategoryImg = JSON.parse(decodeURIComponent(imageStr));
      document.getElementById('catImgPreview').innerHTML = `
        <div class="img-preview-item">
          <img src="${currentCategoryImg.url}" alt="Category image"/>
          <button class="img-preview-remove" onclick="removeCatImage(event)">✕</button>
        </div>`;
    } catch (e) {
      currentCategoryImg = null;
      document.getElementById('catImgPreview').innerHTML = '';
    }
  } else {
    currentCategoryImg = null;
    document.getElementById('catImgPreview').innerHTML = '';
  }

  if (postersStr) {
    try {
      currentCategoryPosters = JSON.parse(decodeURIComponent(postersStr));
      renderCatPostersPreview();
    } catch (e) {
      currentCategoryPosters = [];
      document.getElementById('catPostersPreview').innerHTML = '';
    }
  } else {
    currentCategoryPosters = [];
    document.getElementById('catPostersPreview').innerHTML = '';
  }

  populateParentCategories(parent);
  
  document.getElementById('categoryModal').classList.add('open');
}

async function saveCategory() {
  const id = document.getElementById('editCategoryId').value;
  const payload = {
    name: document.getElementById('catName').value.trim(),
    description: document.getElementById('catDescription').value.trim(),
    parent: document.getElementById('catParent').value || null,
    displayType: document.getElementById('catDisplayType').value || 'card',
    active: document.getElementById('catActive').checked,
    image: currentCategoryImg,
    posters: currentCategoryPosters
  };
  if (!payload.name) return showToast('Name is required', 'error');

  const btn = document.getElementById('saveCategoryBtn');
  btn.disabled = true;
  btn.textContent = id ? 'Updating…' : 'Saving…';

  try {
    if (id) {
      console.log(`📡 Updating category: ${id}`, payload);
      await API.adminUpdateCategory(id, payload);
    } else {
      console.log('📡 Creating new category', payload);
      await API.adminCreateCategory(payload);
    }
    showToast(`Category ${id?'updated':'created'}!`, 'success');
    closeModal('categoryModal');
    loadAdminCategories();
  } catch (err) {
    console.error('❌ Category save failed:', err);
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = id ? 'Update Category' : 'Save Category';
  }
}

async function deleteCategory(id) {
  if (!confirm('Are you sure you want to delete this category?')) return;
  try {
    await API.adminDeleteCategory(id);
    showToast('Category deleted', 'success');
    loadAdminCategories();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

/* ── Product Form ─────────────────────────────────────── */
async function initProductForm(product = null) {
  const catGrid = document.getElementById('imgPreviewGrid');
  const variationsContainer = document.getElementById('variationsContainer');
  const pCategoriesContainer = document.getElementById('pCategoriesContainer');
  
  // 1. Load categories as checkboxes
  try {
    const data = await API.adminGetCategories();
    if (data && data.categories && data.categories.length > 0) {
      pCategoriesContainer.innerHTML = data.categories.map(c => `
        <label class="category-checkbox-label" data-name="${c.name.toLowerCase()}" style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:0.85rem;">
          <input type="checkbox" name="productCategory" value="${c.name}" style="accent-color:var(--teal); width:16px; height:16px;">
          ${c.name}
        </label>
      `).join('');
    } else {
      pCategoriesContainer.innerHTML = '<div style="font-size: 0.8rem; color: var(--mid);">No categories found.</div>';
    }
  } catch (err) {
    console.error('❌ Failed to load categories:', err);
    pCategoriesContainer.innerHTML = '<div style="font-size: 0.8rem; color: #C62828;">Error loading categories.</div>';
  }

  // Clear search input
  const searchInput = document.getElementById('pCategorySearch');
  if (searchInput) searchInput.value = '';

  // 2. Reset or fill form constants
  uploadedImages = product?.images?.slice() || [];
  productVariations = product?.variations?.slice() || [];
  baseBulkPrices = product?.bulkPrices?.slice() || [];

  // Reset all form inputs
  const fields = {
    'editProductId': '',
    'pName': '',
    'pCategory': '',
    'pPrice': '',
    'pMrp': '',
    'pStock': '9999',
    'pMinQuantity': '1',
    'pSku': '',
    'pHsn': '',
    'pDescription': '',
    'pTags': '',
    'pColors': '',
    'pUnit': 'pcs',
  };

  Object.entries(fields).forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (el) el.value = val;
  });

  // Reset checkboxes
  document.getElementById('pFeatured').checked = false;
  document.getElementById('pBestSeller').checked = false;
  document.getElementById('pActive').checked   = true;

  // Reset UI elements
  catGrid.innerHTML = '';
  document.getElementById('productFormTitle').textContent = 'Add New Product';
  document.getElementById('saveProductText').textContent  = 'Save Product';
  document.getElementById('saveProductBtn').disabled = false;

  // 3. If editing, fill data
  if (product) {
    fillProductForm(product);
  }

  renderImgPreviews();
  renderVariations();
  updateBaseBulkBtnLabel();
}

function filterCategoriesInForm() {
  const query = document.getElementById('pCategorySearch').value.toLowerCase();
  const labels = document.querySelectorAll('.category-checkbox-label');
  
  labels.forEach(label => {
    const name = label.getAttribute('data-name');
    if (name.includes(query)) {
      label.style.display = 'flex';
    } else {
      label.style.display = 'none';
    }
  });
}

function fillProductForm(p) {
  document.getElementById('editProductId').value = p._id;
  document.getElementById('pName').value         = p.name || '';
  
  // Handle multiple categories
  const categories = Array.isArray(p.category) ? p.category : (p.category ? [p.category] : []);
  document.querySelectorAll('input[name="productCategory"]').forEach(cb => {
    cb.checked = categories.includes(cb.value);
  });

  document.getElementById('pPrice').value        = p.price !== undefined ? p.price : '';
  document.getElementById('pMrp').value          = p.mrp !== undefined ? p.mrp : '';
  document.getElementById('pStock').value        = p.stock !== undefined ? p.stock : 9999;
  document.getElementById('pMinQuantity').value  = p.minQuantity !== undefined ? p.minQuantity : 1;
  document.getElementById('pSku').value          = p.sku || '';
  document.getElementById('pHsn').value          = p.hsn || '';
  document.getElementById('pDescription').value = p.description || '';
  document.getElementById('pTags').value        = (p.tags || []).join(', ');
  document.getElementById('pColors').value      = (p.colors || []).join(', ');
  document.getElementById('pFeatured').checked   = p.featured || false;
  document.getElementById('pBestSeller').checked = p.bestSeller || false;
  document.getElementById('pActive').checked     = p.active !== false;
  document.getElementById('pUnit').value         = p.unit || 'pcs';
  document.getElementById('productFormTitle').textContent = 'Edit Product';
  document.getElementById('saveProductText').textContent  = 'Update Product';
}

async function handleImageUpload(e) {
  const files = Array.from(e.target.files);
  if (!files.length) return;

  const zone = document.getElementById('uploadZone');
  zone.innerHTML = `<div class="upload-icon">⏳</div><p>Uploading ${files.length} image(s)…</p>`;

  try {
    const data = files.length === 1
      ? await API.uploadImage(files[0])
      : await API.uploadImages(files);

    if (files.length === 1) {
      uploadedImages.push(data.image);
    } else {
      uploadedImages.push(...data.images);
    }

    renderImgPreviews();
    showToast(`${files.length} image(s) uploaded!`, 'success');
  } catch (err) {
    showToast(err.message || 'Upload failed', 'error');
  }

  zone.innerHTML = `<div class="upload-icon">📷</div><p>Click to upload product images</p><span>JPG, PNG, WebP — Max 5MB each</span>`;
  e.target.value = '';
}

function addImageByUrl() {
  const url = document.getElementById('imageUrlInput').value.trim();
  if (!url || !url.startsWith('http')) { showToast('Enter a valid image URL', 'error'); return; }
  uploadedImages.push({ url, public_id: null });
  renderImgPreviews();
  document.getElementById('imageUrlInput').value = '';
}

function renderImgPreviews() {
  const grid = document.getElementById('imgPreviewGrid');
  grid.innerHTML = uploadedImages.map((img, i) => `
    <div class="img-preview-item">
      <img src="${img.url}" alt="Product image ${i+1}"/>
      <button class="img-preview-remove" onclick="removeUploadedImage(${i})">✕</button>
    </div>`).join('');
}

function removeUploadedImage(i) {
  uploadedImages.splice(i, 1);
  renderImgPreviews();
}

function renderVariations() {
  const container = document.getElementById('variationsContainer');
  if (!productVariations.length) {
    container.innerHTML = '<div style="font-size:0.8rem;color:var(--mid);text-align:center;padding:10px" id="noVariationsMsg">No sizes added. Product will use base price.</div>';
    return;
  }
  container.innerHTML = productVariations.map((v, i) => `
    <div class="var-row">
      <input type="text" class="form-input var-size" placeholder="Size Name" value="${v.size || ''}" />
      <input type="number" class="form-input var-price" placeholder="Price" value="${v.price || ''}" min="0"/>
      <input type="number" class="form-input var-mrp" placeholder="MRP" value="${v.mrp || ''}" min="0"/>
      <input type="number" class="form-input var-stock" placeholder="Stock" value="${v.stock !== undefined ? v.stock : 9999}" min="0" style="width:70px"/>
      <button type="button" class="btn-var-bulk" onclick="openVariationBulkModal(${i})">
        Bulk (${v.bulkPrices?.length || 0})
      </button>
      <button type="button" class="btn-icon delete" onclick="removeVariation(${i})" title="Remove">✕</button>
    </div>
  `).join('');
}

function syncVariationsFromUI() {
  const rows = document.querySelectorAll('.var-row');
  productVariations = Array.from(rows).map((row, i) => ({
    size: row.querySelector('.var-size').value.trim(),
    price: parseFloat(row.querySelector('.var-price').value) || 0,
    mrp: parseFloat(row.querySelector('.var-mrp').value) || 0,
    stock: parseInt(row.querySelector('.var-stock').value) >= 0 ? parseInt(row.querySelector('.var-stock').value) : 9999,
    bulkPrices: productVariations[i]?.bulkPrices || []
  }));
}

function addVariationRow() {
  syncVariationsFromUI();
  productVariations.push({ size: '', price: '', mrp: '', stock: 999 });
  renderVariations();
}

function removeVariation(index) {
  syncVariationsFromUI();
  productVariations.splice(index, 1);
  renderVariations();
}

function updateBaseBulkBtnLabel() {
  const btn = document.getElementById('btnBaseBulkPrice');
  if (btn) {
    btn.textContent = `Bulk Pricing (${baseBulkPrices.length})`;
    btn.style.background = baseBulkPrices.length > 0 ? 'var(--teal)' : '';
    btn.style.color = baseBulkPrices.length > 0 ? 'white' : '';
  }
}

function openBaseBulkModal() {
  currentVarIndexForBulk = null;
  currentVarBulkPrices = JSON.parse(JSON.stringify(baseBulkPrices || []));
  document.getElementById('varSizeLabel').textContent = 'Base Product';
  renderVarBulkPrices();
  document.getElementById('variationBulkModal').classList.add('open');
}

/* -- Variation Specific Bulk Prices -- */
let currentVarIndexForBulk = null;
let currentVarBulkPrices = [];

function openVariationBulkModal(index) {
  syncVariationsFromUI();
  currentVarIndexForBulk = index;
  const v = productVariations[index];
  currentVarBulkPrices = JSON.parse(JSON.stringify(v.bulkPrices || []));
  
  document.getElementById('varSizeLabel').textContent = v.size || `Size #${index + 1}`;
  renderVarBulkPrices();
  document.getElementById('variationBulkModal').classList.add('open');
}

function renderVarBulkPrices() {
  const container = document.getElementById('varBulkContainer');
  if (!currentVarBulkPrices.length) {
    container.innerHTML = '<div style="font-size:0.8rem;color:var(--mid);text-align:center;padding:10px">No unit tiers added for this size.</div>';
    return;
  }
  container.innerHTML = currentVarBulkPrices.map((b, i) => `
    <div class="var-bulk-row">
      <input type="number" class="form-input v-bulk-qty" placeholder="Units" value="${b.quantity || ''}" min="1"/>
      <select class="form-input v-bulk-unit">
        <option value="Pcs" ${b.unit === 'Packets' ? '' : 'selected'}>Pcs</option>
        <option value="Packets" ${b.unit === 'Packets' ? 'selected' : ''}>Packets</option>
      </select>
      <input type="number" class="form-input v-bulk-price" placeholder="Pack Price" value="${b.price || ''}" min="0"/>
      <input type="number" class="form-input v-bulk-mrp" placeholder="Pack MRP" value="${b.mrp || ''}" min="0"/>
      <button type="button" class="btn-icon delete" onclick="removeVarBulkPrice(${i})" title="Remove">✕</button>
    </div>
  `).join('');
}

function addVarBulkRow() {
  syncVarBulkPricesFromUI();
  currentVarBulkPrices.push({ quantity: '', unit: 'Pcs', price: '', mrp: '' });
  renderVarBulkPrices();
}

function removeVarBulkPrice(index) {
  syncVarBulkPricesFromUI();
  currentVarBulkPrices.splice(index, 1);
  renderVarBulkPrices();
}

function syncVarBulkPricesFromUI() {
  const rows = document.querySelectorAll('.var-bulk-row');
  currentVarBulkPrices = Array.from(rows).map(row => ({
    quantity: parseInt(row.querySelector('.v-bulk-qty').value) || 0,
    unit: row.querySelector('.v-bulk-unit').value || 'Pcs',
    price: parseFloat(row.querySelector('.v-bulk-price').value) || 0,
    mrp: parseFloat(row.querySelector('.v-bulk-mrp').value) || 0
  })).filter(b => b.quantity > 0 && b.price > 0);
}

function saveVariationBulkPrices() {
  syncVarBulkPricesFromUI();
  if (currentVarIndexForBulk !== null) {
    productVariations[currentVarIndexForBulk].bulkPrices = currentVarBulkPrices;
    renderVariations();
    showToast('Tiers applied to size', 'success');
  } else {
    baseBulkPrices = currentVarBulkPrices;
    updateBaseBulkBtnLabel();
    showToast('Tiers applied to base product', 'success');
  }
  closeModal('variationBulkModal');
}

async function saveProduct() {
  const id   = document.getElementById('editProductId').value;
  const name = document.getElementById('pName').value.trim();
  
  // Collect multiple categories
  const category = Array.from(document.querySelectorAll('input[name="productCategory"]:checked'))
    .map(cb => cb.value);

  const price  = parseFloat(document.getElementById('pPrice').value);
  const mrp    = parseFloat(document.getElementById('pMrp').value) || undefined;
  const sku    = document.getElementById('pSku').value.trim() || undefined;
  const hsn    = document.getElementById('pHsn').value.trim() || undefined;
  const desc     = document.getElementById('pDescription').value.trim();
  const tagsRaw  = document.getElementById('pTags').value;
  const colorsRaw= document.getElementById('pColors').value;

  if (!name || category.length === 0 || !price) {
    showToast('Name, at least one Category, and Price are required.', 'error');
    return;
  }

  const payload = {
    name, category, price, mrp, sku, hsn,
    description: desc,
    tags:        tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : [],
    colors:      colorsRaw ? colorsRaw.split(',').map(c => c.trim()).filter(Boolean) : [],
    featured:    document.getElementById('pFeatured').checked,
    bestSeller:  document.getElementById('pBestSeller').checked,
    active:      document.getElementById('pActive').checked,
    unit:        document.getElementById('pUnit').value,
    images:      uploadedImages,
    stock:       parseInt(document.getElementById('pStock').value) >= 0 ? parseInt(document.getElementById('pStock').value) : 9999,
    minQuantity: parseInt(document.getElementById('pMinQuantity').value) || 1,
    variations:  (() => { syncVariationsFromUI(); return productVariations; })(),
    bulkPrices:  baseBulkPrices
  };

  const btn = document.getElementById('saveProductBtn');
  btn.disabled = true;
  document.getElementById('saveProductText').textContent = id ? 'Updating…' : 'Saving…';

  try {
    if (id) {
      console.log(`📡 Updating product: ${id}`, payload);
      await API.updateProduct(id, payload);
      showToast('Product updated!', 'success');
    } else {
      console.log('📡 Creating new product', payload);
      await API.createProduct(payload);
      showToast('Product created!', 'success');
    }
    btn.disabled = false;
    document.getElementById('saveProductText').textContent = 'Save Product';
    showPage('products');
  } catch (err) {
    console.error('❌ Product save failed:', err);
    showToast(err.message, 'error');
    btn.disabled = false;
    document.getElementById('saveProductText').textContent = id ? 'Update Product' : 'Save Product';
  }
}

async function editProduct(id) {
  try {
    const data = await API.getProduct(id);
    showPage('add-product');
    initProductForm(data.product);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function cancelProductEdit() { showPage('products'); }

let deleteTargetId = null;
function confirmDeleteProduct(id, name) {
  deleteTargetId = id;
  document.getElementById('deleteModal').classList.add('open');
  document.getElementById('confirmDeleteBtn').onclick = async () => {
    try {
      await API.deleteProduct(deleteTargetId);
      showToast('Product deleted', 'success');
      closeModal('deleteModal');
      loadAdminProducts();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };
}

/* ── Modal helpers ───────────────────────────────────── */
function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('open');
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('open');
}

document.querySelectorAll('.modal-overlay').forEach(m => {
  m.addEventListener('click', (e) => { if (e.target === m) m.classList.remove('open'); });
});

/* ── FAQs ────────────────────────────────────────────── */
async function loadAdminFaqs() {
  const tbody = document.getElementById('faqTableBody');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:24px">Loading...</td></tr>';
  
  try {
    const data = await API.adminGetFaqs();

    if (!data.faqs || !data.faqs.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--mid)">No queries found</td></tr>';
      return;
    }

    tbody.innerHTML = data.faqs.map(f => `
      <tr>
        <td style="font-size:0.8rem;color:var(--mid)">${new Date(f.createdAt).toLocaleString()}</td>
        <td style="font-weight:500">${f.name}</td>
        <td>
          <a href="mailto:${f.email}">${f.email}</a>
          ${f.phone ? `<br><a href="tel:${f.phone}" style="font-size:0.8rem;color:#666;">📞 ${f.phone}</a>` : ''}
        </td>
        <td style="max-width:300px; white-space:pre-wrap;">${f.query}</td>
        <td>
          <span class="badge ${f.isAnswered ? 'badge-delivered' : 'badge-pending'}">
            ${f.isAnswered ? 'Resolved' : 'Pending'}
          </span>
        </td>
        <td>
          <div style="display:flex;gap:8px;align-items:center;">
             <button title="Toggle Status" onclick="toggleFaqStatus('${f._id}', ${!f.isAnswered})" style="padding: 4px 8px; font-size: 0.75rem; border-radius: 4px; border: 1px solid ${f.isAnswered ? '#ccc' : '#2e7d32'}; background: ${f.isAnswered ? '#f5f5f5' : '#e8f5e9'}; color: ${f.isAnswered ? '#666' : '#2e7d32'}; cursor: pointer; font-weight: 500; font-family: 'Poppins', sans-serif;">
                ${f.isAnswered ? 'Mark Pending' : 'Mark Resolved'}
             </button>
             <button class="btn-icon delete" onclick="deleteFaq('${f._id}')" title="Delete">🗑️</button>
          </div>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:24px;color:#C62828">Error: ${err.message}</td></tr>`;
  }
}

window.toggleFaqStatus = async function(id, newState) {
  try {
    await API.adminUpdateFaq(id, { isAnswered: newState });
    showToast('FAQ status updated', 'success');
    loadAdminFaqs();
  } catch (err) {
    showToast('Failed to update FAQ status: ' + err.message, 'error');
  }
};

window.deleteFaq = async function(id) {
  if (!confirm('Are you sure you want to delete this query?')) return;
  try {
    await API.adminDeleteFaq(id);
    showToast('FAQ deleted', 'success');
    loadAdminFaqs();
  } catch (err) {
    showToast('Failed to delete FAQ: ' + err.message, 'error');
  }
};

/* ── Inventory ────────────────────────────────────────── */
let inventoryData = []; // To store all products for searching

async function loadInventory() {
  const outOfStockBody = document.getElementById('outOfStockTableBody');
  const lowStockBody = document.getElementById('lowStockTableBody');
  
  if (outOfStockBody) outOfStockBody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--mid)">Loading...</td></tr>';
  if (lowStockBody) lowStockBody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--mid)">Loading...</td></tr>';

  try {
    const data = await API.adminGetProducts({ limit: 1000 }); // Get as many as possible
    inventoryData = data.products || [];
    renderInventory(inventoryData);
  } catch (err) {
    console.error(err);
    if (outOfStockBody) outOfStockBody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:24px;color:#C62828">Error: ${err.message}</td></tr>`;
  }
}

function filterInventory() {
  const search = document.getElementById('inventorySearch')?.value.trim().toLowerCase() || '';
  if (!search) {
    renderInventory(inventoryData);
    return;
  }

  const filtered = inventoryData.filter(p => 
    p.name.toLowerCase().includes(search) || 
    p.category.toLowerCase().includes(search) ||
    (p.sku && p.sku.toLowerCase().includes(search))
  );
  renderInventory(filtered);
}

function renderInventory(products) {
  const outOfStockBody = document.getElementById('outOfStockTableBody');
  const lowStockBody = document.getElementById('lowStockTableBody');

  let outItems = [];
  let lowItems = [];

  products.forEach(p => {
    const img = p.images?.[0]?.url;
    
    // Check base product
    if (p.stock === 0) {
      outItems.push({ img, name: p.name, category: p.category, id: p._id });
    } else if (p.stock > 0 && p.stock <= 10) {
      lowItems.push({ img, name: p.name, category: p.category, stock: p.stock, id: p._id });
    }

    // Check variations
    if (p.variations && p.variations.length > 0) {
      p.variations.forEach(v => {
        if (v.stock === 0) {
          outItems.push({ img, name: `${p.name} (${v.size || v.color || 'Variant'})`, category: p.category, id: p._id });
        } else if (v.stock > 0 && v.stock <= 10) {
          lowItems.push({ img, name: `${p.name} (${v.size || v.color || 'Variant'})`, category: p.category, stock: v.stock, id: p._id });
        }
      });
    }
  });

  if (outOfStockBody) {
    if (outItems.length === 0) {
      outOfStockBody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--mid)">No products are out of stock</td></tr>';
    } else {
      outOfStockBody.innerHTML = outItems.map(item => `
        <tr>
          <td><div style="width:40px;height:45px;border-radius:4px;overflow:hidden;background:#eee">${item.img ? `<img src="${item.img}" style="width:100%;height:100%;object-fit:cover"/>` : '📦'}</div></td>
          <td style="font-weight:600;color:#C62828">${item.name}</td>
          <td><span class="badge" style="background:var(--cream);color:var(--teal-dark)">${item.category}</span></td>
          <td><button class="btn-icon edit" onclick="editProduct('${item.id}')" title="Update Stock">✏️ Update</button></td>
        </tr>
      `).join('');
    }
  }

  if (lowStockBody) {
    if (lowItems.length === 0) {
      lowStockBody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--mid)">No products are low in stock</td></tr>';
    } else {
      lowStockBody.innerHTML = lowItems.map(item => `
        <tr>
          <td><div style="width:40px;height:45px;border-radius:4px;overflow:hidden;background:#eee">${item.img ? `<img src="${item.img}" style="width:100%;height:100%;object-fit:cover"/>` : '📦'}</div></td>
          <td style="font-weight:600;color:#E65100">${item.name}</td>
          <td><span class="badge" style="background:var(--cream);color:var(--teal-dark)">${item.category}</span></td>
          <td><strong style="color:#E65100">${item.stock}</strong> left</td>
          <td><button class="btn-icon edit" onclick="editProduct('${item.id}')" title="Update Stock">✏️ Update</button></td>
        </tr>
      `).join('');
    }
  }
}

async function loadBulkEnquiries() {
  const status = document.getElementById('bulkStatusFilter')?.value || 'all';
  const tbody = document.getElementById('bulkEnquiriesTableBody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--mid)">Loading…</td></tr>';

  try {
    const data = await API.adminGetBulkEnquiries();
    let enquiries = data.data || [];

    // Filter by Status
    if (status !== 'all') {
      enquiries = enquiries.filter(e => e.status === status);
    }

    // Filter by Search (Name, Email, Contact)
    const search = document.getElementById('bulkEnquirySearch')?.value.trim().toLowerCase();
    if (search) {
      enquiries = enquiries.filter(e => 
        (e.name || '').toLowerCase().includes(search) || 
        (e.email || '').toLowerCase().includes(search) || 
        (e.contactNumber || '').toLowerCase().includes(search)
      );
    }

    if (!enquiries.length) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--mid)">No enquiries found</td></tr>';
      return;
    }

    tbody.innerHTML = enquiries.map(e => `
      <tr>
        <td style="font-size:0.75rem">${new Date(e.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
        <td><strong>${e.name}</strong></td>
        <td style="font-size:0.8rem">${e.contactNumber}</td>
        <td style="font-size:0.8rem">${e.email}</td>
        <td>
          <ul style="padding:0; margin:0; list-style:none; min-width:200px; max-width:300px;">
            ${(e.selectedProducts || []).map(p => `
              <li style="font-size:0.7rem; color:var(--teal-dark); margin-bottom:6px; line-height:1.4; padding-left:12px; position:relative;">
                <span style="position:absolute; left:0; color:var(--gold);">•</span> ${p}
              </li>
            `).join('')}
          </ul>
        </td>
        <td>
          <div style="max-width:180px; font-size:0.7rem; color:var(--mid); line-height:1.3; white-space: normal;">
            ${e.message || '—'}
          </div>
        </td>
        <td>
          <span class="status-badge status-${(e.status || 'pending').toLowerCase()}">${e.status}</span>
        </td>
        <td>
          <select onchange="updateBulkStatus('${e._id}', this.value)" class="admin-filter-select" style="padding:4px; font-size:0.75rem; width: auto; min-width: 100px;">
            <option value="Pending" ${e.status === 'Pending' ? 'selected' : ''}>Pending</option>
            <option value="Contacted" ${e.status === 'Contacted' ? 'selected' : ''}>Contacted</option>
            <option value="Closed" ${e.status === 'Closed' ? 'selected' : ''}>Closed</option>
          </select>
        </td>
      </tr>`).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:24px;color:#C62828">${err.message}</td></tr>`;
  }
}

async function updateBulkStatus(id, status) {
  try {
    await API.adminUpdateBulkEnquiryStatus(id, status);
    showToast('Status updated', 'success');
    loadBulkEnquiries();
  } catch (err) {
    showToast(err.message, 'error');
  }
}
/* ── Festive Season Management ──────────────────────── */
// ── Festive Season ─────────────────────────────────────

async function loadFestiveSettings() {
  console.log('✨ Loading festive settings...');
  try {
    const data = await API.getPromotion();
    if (!data || !data.success) throw new Error(data?.message || 'Failed to fetch promotion data');

    const p = data.promotion || {};
    
    const enabledEl = document.getElementById('festiveEnabled');
    if (enabledEl) enabledEl.checked = !!p.festiveEnabled;
    
    const messagesContainer = document.getElementById('saleMessagesContainer');
    if (messagesContainer) {
      messagesContainer.innerHTML = '';
      (p.saleMessages || []).forEach(msg => addSaleMessageRow(msg));
      if (!p.saleMessages?.length) addSaleMessageRow();
    }

    // Always ensure we have an array for the table
    festiveProducts = p.festiveProductIds || [];
    renderFestiveProductsTable();
    console.log('✅ Festive settings loaded:', festiveProducts.length, 'products');
  } catch (err) {
    console.error('❌ Festive Load Error:', err);
    showToast(err.message || 'Failed to load festive settings', 'error');
  }
}

function addSaleMessageRow(val = '') {
  const container = document.getElementById('saleMessagesContainer');
  const div = document.createElement('div');
  div.className = 'sale-message-row';
  div.style.display = 'flex';
  div.style.gap = '10px';
  div.style.marginBottom = '8px';
  div.innerHTML = `
    <input type="text" class="form-input sale-msg-input" value="${val}" placeholder="e.g. 20% OFF ON ALL MARRIAGE GOODS" style="flex:1" />
    <button class="btn-icon delete" onclick="this.parentElement.remove()" style="background:#fee; border-radius:8px">✕</button>
  `;
  container.appendChild(div);
}

async function searchProductsForFestive() {
  const query = document.getElementById('festiveProductSearch').value.trim();
  const dropdown = document.getElementById('festiveSearchDropdown');
  
  if (query.length < 2) {
    dropdown.style.display = 'none';
    return;
  }

  try {
    const data = await API.adminGetProducts({ search: query, limit: 10 });
    if (data.products?.length) {
      dropdown.innerHTML = data.products.map(p => `
        <div class="multi-select-option" onclick="addFestiveProduct('${p._id}', '${p.name.replace(/'/g, "\\'")}', ${p.price})" style="padding:12px; cursor:pointer; border-bottom:1px solid #eee; transition: background 0.2s">
          <div style="font-weight:600; color:var(--teal)">${p.name}</div>
          <div style="font-size:0.75rem; color:var(--mid)">Price: ${formatRupees(p.price)}</div>
        </div>
      `).join('');
      dropdown.style.display = 'block';
    } else {
      dropdown.innerHTML = '<div style="padding:12px; color:#999">No products found</div>';
      dropdown.style.display = 'block';
    }
  } catch (err) {
    console.error(err);
  }
}

function addFestiveProduct(id, name, price) {
  if (festiveProducts.some(p => (p._id || p) === id)) {
    showToast('Product already added', 'warning');
    return;
  }
  festiveProducts.push({ _id: id, name, price });
  renderFestiveProductsTable();
  document.getElementById('festiveProductSearch').value = '';
  document.getElementById('festiveSearchDropdown').style.display = 'none';
}

function renderFestiveProductsTable() {
  const tbody = document.getElementById('festiveProductsTableBody');
  if (!festiveProducts.length) {
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:32px; color:#999">No products selected for festive section.</td></tr>';
    return;
  }
  tbody.innerHTML = festiveProducts.map((p, i) => {
    if (!p) return '';
    const name = p.name || 'Unknown Product';
    const price = p.price !== undefined ? formatRupees(p.price) : 'N/A';
    return `
    <tr>
      <td><strong style="color:var(--teal)">${name}</strong></td>
      <td>${price}</td>
      <td>
        <button class="btn-icon delete" onclick="removeFestiveProduct(${i})" style="padding:4px 8px; font-size:0.75rem; background:#fee">Remove</button>
      </td>
    </tr>
  `}).join('');
}

function removeFestiveProduct(i) {
  festiveProducts.splice(i, 1);
  renderFestiveProductsTable();
}

async function saveFestiveSettings() {
  const btn = event?.target;
  const originalText = btn ? btn.textContent : 'Save All Changes';
  
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Saving...';
  }

  const enabled = document.getElementById('festiveEnabled').checked;
  const messages = Array.from(document.querySelectorAll('.sale-msg-input'))
    .map(input => input.value.trim())
    .filter(val => val !== '');
  
  const productIds = festiveProducts.map(p => p._id || p);

  try {
    const res = await API.updatePromotion({
      festiveEnabled: enabled,
      saleMessages: messages,
      festiveProductIds: productIds
    });
    if (res.success) {
      showToast('Festive settings saved successfully!', 'success');
      loadFestiveSettings();
    }
  } catch (err) {
    console.error(err);
    showToast(err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  }
}

/* ── Notifications ──────────────────────────────────── */
let notifications = [];

async function loadNotifications() {
  try {
    const data = await API.getNotifications();
    notifications = data.notifications || [];
    renderNotifications();
    updateNotifBadge();
  } catch (err) {
    console.error('Failed to load notifications:', err);
  }
}

function updateNotifBadge() {
  const badge = document.getElementById('notifBadge');
  const unreadCount = notifications.filter(n => !n.isRead).length;
  if (unreadCount > 0) {
    badge.textContent = unreadCount;
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }
}

function toggleNotifDropdown() {
  const dropdown = document.getElementById('notifDropdown');
  dropdown.classList.toggle('open');
  if (dropdown.classList.contains('open')) {
    loadNotifications(); // Refresh on open
    // Close on outside click
    const closer = (e) => {
      if (!e.target.closest('.admin-notif-wrapper')) {
        dropdown.classList.remove('open');
        document.removeEventListener('click', closer);
      }
    };
    setTimeout(() => document.addEventListener('click', closer), 10);
  }
}

function renderNotifications() {
  const list = document.getElementById('notifList');
  if (!notifications.length) {
    list.innerHTML = '<div class="admin-notif-empty">No new notifications</div>';
    return;
  }

  list.innerHTML = notifications.map(n => `
    <div class="admin-notif-item ${n.isRead ? '' : 'unread'}" onclick="handleNotifClick('${n._id}', '${n.link}')">
      <div class="admin-notif-icon ${n.type}">
        ${getNotifIcon(n.type)}
      </div>
      <div class="admin-notif-content">
        <div class="admin-notif-title">${n.title}</div>
        <div class="admin-notif-msg">${n.message}</div>
        <div class="admin-notif-time">${timeAgo(n.createdAt)}</div>
      </div>
      <button class="admin-notif-clear-one" onclick="event.stopPropagation(); deleteNotification('${n._id}')">✕</button>
    </div>
  `).join('');
}

function getNotifIcon(type) {
  switch (type) {
    case 'order': return '📦';
    case 'stock': return '⚠️';
    case 'status': return '🚚';
    case 'enquiry': return '📢';
    default: return '🔔';
  }
}

async function handleNotifClick(id, link) {
  try {
    await API.markNotificationRead(id);
    const notif = notifications.find(n => n._id === id);
    if (notif) notif.isRead = true;
    updateNotifBadge();
    renderNotifications();
    
    // Navigate
    if (link) {
      showPage(link);
      document.getElementById('notifDropdown').classList.remove('open');
    }
  } catch (err) {
    console.error(err);
  }
}

async function deleteNotification(id) {
  try {
    await API.deleteNotification(id);
    notifications = notifications.filter(n => n._id !== id);
    renderNotifications();
    updateNotifBadge();
  } catch (err) {
    showToast('Failed to delete notification', 'error');
  }
}

async function clearAllNotifications() {
  if (!confirm('Clear all notifications?')) return;
  try {
    await API.clearAllNotifications();
    notifications = [];
    renderNotifications();
    updateNotifBadge();
  } catch (err) {
    showToast('Failed to clear notifications', 'error');
  }
}

function timeAgo(date) {
  const seconds = Math.floor((new Date() - new Date(date)) / 1000);
  let interval = seconds / 31536000;
  if (interval > 1) return Math.floor(interval) + "y ago";
  interval = seconds / 2592000;
  if (interval > 1) return Math.floor(interval) + "mo ago";
  interval = seconds / 86400;
  if (interval > 1) return Math.floor(interval) + "d ago";
  interval = seconds / 3600;
  if (interval > 1) return Math.floor(interval) + "h ago";
  interval = seconds / 60;
  if (interval > 1) return Math.floor(interval) + "m ago";
  return "just now";
}

// Initial load for notifications (moved to main listener)

/* ── Manual Order Logic ──────────────────────────────── */
const BRANCH_CITIES = [
  'Kolkata', 'Bengaluru', 'Delhi', 'Mumbai', 'Ahmedabad', 'Amritsar', 'Bhagalpur', 'Bhopal', 'Bhubaneswar',
  'Chennai', 'Coimbatore', 'Cuttack', 'Guwahati', 'Indore', 'Jabalpur', 'Jaipur', 'Jammu',
  'Jodhpur', 'Kanpur', 'Ludhiana', 'Nashik', 'Patna', 'Pune', 'Raigarh', 'Ranchi', 'Raipur',
  'Salem', 'Siliguri', 'Surat', 'Varanasi', 'Ujjain', 'Dewas', 'Kalyan'
];

let moSearchTimer;
let isMoShippingOverridden = false;

function initManualOrderPage() {
  moSelectedItems = [];
  isMoShippingOverridden = false;
  document.getElementById('manualOrderForm').reset();
  document.getElementById('moSubtotalDisplay').textContent = '0';
  document.getElementById('moTotalDisplay').textContent = '0';
  const weightDisplay = document.getElementById('moWeightDisplay');
  if (weightDisplay) weightDisplay.textContent = '0.000';
  
  // Add listeners for auto shipping
  const cityInput = document.getElementById('moCity');
  if (cityInput) {
    cityInput.oninput = updateMoTotals;
  }
  
  const shippingInput = document.getElementById('moShippingCost');
  if (shippingInput) {
    shippingInput.onblur = () => {
      if (shippingInput.value === '') {
        isMoShippingOverridden = false;
        updateMoTotals();
      }
    };
  }
  
  renderMoSelectedItems();
}

function handleMoProductSearchInput(val) {
  clearTimeout(moSearchTimer);
  moSearchTimer = setTimeout(() => {
    if (val.trim().length >= 2) {
      searchProductsForManualOrder();
    } else {
      document.getElementById('moProductSearchResults').style.display = 'none';
    }
  }, 400);
}

async function searchProductsForManualOrder() {
  const query = document.getElementById('moProductSearchInput').value.trim();
  if (query.length < 2) return;
  
  const resultsDiv = document.getElementById('moProductSearchResults');
  resultsDiv.innerHTML = '<div style="padding:10px; color:var(--mid);">Searching...</div>';
  resultsDiv.style.display = 'block';
  
  try {
    const data = await API.adminGetProducts({ search: query, limit: 10 });
    moSearchResults = data.products || [];
    
    if (!moSearchResults.length) {
      resultsDiv.innerHTML = '<div style="padding:10px; color:#C62828;">No products found</div>';
      return;
    }
    
    resultsDiv.innerHTML = moSearchResults.map((p, pIdx) => {
      const imgUrl = (typeof p.images?.[0] === 'object' ? p.images[0]?.url : p.images?.[0]) || '/images/placeholder.svg';
      const moq = p.minQuantity || 1;
      const moqBadge = moq > 1 ? `<span style="font-size:0.68rem; background:#fff3e0; color:#e65100; padding:1px 6px; border-radius:4px; font-weight:700; margin-left:4px;">MOQ: ${moq}</span>` : '';
      // If product has variations, list them so admin can add a specific one initially
      if (p.variations && p.variations.length > 0) {
        return p.variations.map((v, vIdx) => {
          const variantLabel = [v.color, v.size].filter(Boolean).join(' - ') || 'No Variant';
          return `
            <div class="search-result-item" style="padding:10px; border-bottom:1px solid #eee; cursor:pointer; display:flex; gap:12px; align-items:center;" 
                 onclick="addProductToManualOrder(${pIdx}, ${vIdx})">
              <img src="${imgUrl}" style="width:40px; height:40px; object-fit:cover; border-radius:4px; border:1px solid rgba(0,0,0,0.05); flex-shrink:0;" />
              <div style="flex:1;">
                <div style="font-weight:600; font-size:0.88rem; color:var(--teal-dark);">${p.name} (${variantLabel})${moqBadge}</div>
                <div style="font-size:0.75rem; color:var(--mid);">SKU: ${p.sku || '—'} | Stock: ${v.stock}</div>
              </div>
              <div style="font-weight:700; color:var(--teal); font-size:0.95rem;">₹${v.price}</div>
            </div>
          `;
        }).join('');
      } else {
        return `
          <div class="search-result-item" style="padding:10px; border-bottom:1px solid #eee; cursor:pointer; display:flex; gap:12px; align-items:center;" 
               onclick="addProductToManualOrder(${pIdx}, null)">
            <img src="${imgUrl}" style="width:40px; height:40px; object-fit:cover; border-radius:4px; border:1px solid rgba(0,0,0,0.05); flex-shrink:0;" />
            <div style="flex:1;">
              <div style="font-weight:600; font-size:0.88rem; color:var(--teal-dark);">${p.name}${moqBadge}</div>
              <div style="font-size:0.75rem; color:var(--mid);">SKU: ${p.sku || '—'} | Stock: ${p.stock}</div>
            </div>
            <div style="font-weight:700; color:var(--teal); font-size:0.95rem;">₹${p.price}</div>
          </div>
        `;
      }
    }).join('');
  } catch (err) {
    resultsDiv.innerHTML = `<div style="padding:10px; color:#C62828;">Error: ${err.message}</div>`;
  }
}

function addProductToManualOrder(pIdx, vIdx) {
  const p = moSearchResults[pIdx];
  if (!p) return;
  
  let variationId = null;
  let color = "";
  let size = "";
  let price = p.price;
  
  if (vIdx !== null && p.variations?.[vIdx]) {
    const v = p.variations[vIdx];
    variationId = v._id;
    color = v.color || "";
    size = v.size || "";
    price = (v.price && v.price > 0) ? v.price : (p.price || 0); // Fallback to base product price if variation price is 0/unset
  }

  const minQty = parseInt(p.minQuantity) || 1;
  const existingIndex = moSelectedItems.findIndex(item => item.productId === p._id && item.variationId === variationId);
  
  if (existingIndex > -1) {
    moSelectedItems[existingIndex].quantity += minQty;
  } else {
    moSelectedItems.push({
      productId: p._id,
      variationId,
      name: p.name,
      color,
      size,
      price,
      image: p.images?.[0]?.url || '',
      basePrice: p.price || 0,    // Store base product price for fallback
      quantity: minQty,           // Start at MOQ, not 1
      minQuantity: minQty,        // Store MOQ for enforcement
      allVariations: p.variations || [], // Store all variations for the dropdown
      availableColors: p.colors || []   // Store top-level colors for independent selection
    });
  }
  
  document.getElementById('moProductSearchResults').style.display = 'none';
  document.getElementById('moProductSearchInput').value = '';
  renderMoSelectedItems();
}

function removeProductFromManualOrder(index) {
  moSelectedItems.splice(index, 1);
  renderMoSelectedItems();
}

function updateMoQuantity(index, qty) {
  const item = moSelectedItems[index];
  if (!item) return;
  const minQty = item.minQuantity || 1;
  let q = parseInt(qty);
  if (isNaN(q) || q < minQty) {
    showToast(`Minimum order quantity for this product is ${minQty}`, 'warning');
    q = minQty;
  }
  item.quantity = q;
  renderMoSelectedItems();
}

function renderMoSelectedItems() {
  const tbody = document.getElementById('moSelectedItemsBody');
  if (moSelectedItems.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:#999;">No products added yet</td></tr>';
    updateMoTotals();
    return;
  }
  
  tbody.innerHTML = moSelectedItems.map((item, i) => {
    let variantCell = '';
    
    // Get available Colors (Prefer those in variations, fallback to top-level product colors)
    const vColors = (item.allVariations || []).map(v => v.color).filter(Boolean);
    const uniqueVColors = [...new Set(vColors)];
    const finalColors = uniqueVColors.length > 0 ? uniqueVColors : (item.availableColors || []);

    // Get available Sizes from variations
    const vSizes = (item.allVariations || []).map(v => v.size).filter(Boolean);
    const uniqueVSizes = [...new Set(vSizes)];
    
    // If we have variations with colors, filter sizes based on the selected color
    let displaySizes = uniqueVSizes;
    if (uniqueVColors.length > 0 && item.color) {
      displaySizes = [...new Set(item.allVariations.filter(v => v.color === item.color).map(v => v.size).filter(Boolean))];
    }

    if (finalColors.length > 0 || displaySizes.length > 0) {
      variantCell = `
        <div style="display:flex; flex-direction:column; gap:8px;">
          ${finalColors.length > 0 ? `
            <div>
              <div style="margin-bottom:2px; font-size:0.65rem; color:var(--mid); text-transform:uppercase;">Colour:</div>
              <select class="form-input" style="padding:4px; font-size:0.8rem; width:100%; min-width:110px;" 
                      onchange="${uniqueVColors.length > 0 ? `changeMoVariantByParts(${i}, 'color', this.value)` : `changeMoColor(${i}, this.value)`}">
                <option value="">Select Colour</option>
                ${finalColors.map(c => `<option value="${c}" ${c === item.color ? 'selected' : ''}>${c}</option>`).join('')}
              </select>
            </div>
          ` : ''}
          ${displaySizes.length > 0 ? `
            <div>
              <div style="margin-bottom:2px; font-size:0.65rem; color:var(--mid); text-transform:uppercase;">Size:</div>
              <select class="form-input" style="padding:4px; font-size:0.8rem; width:100%; min-width:110px;" 
                      onchange="changeMoVariantByParts(${i}, 'size', this.value)">
                <option value="">Select Size</option>
                ${displaySizes.map(s => `<option value="${s}" ${s === item.size ? 'selected' : ''}>${s}</option>`).join('')}
              </select>
            </div>
          ` : ''}
        </div>
      `;
    } 
    // Fallback label
    else if (item.size || item.color) {
      variantCell = [item.color, item.size].filter(Boolean).join(' - ');
    }

    if (!variantCell) variantCell = '—';

    const minQty = item.minQuantity || 1;
    const moqBadge = minQty > 1
      ? `<div style="font-size:0.65rem; color:#e65100; font-weight:700; margin-top:3px;">MOQ: ${minQty}</div>`
      : '';

    return `
      <tr>
        <td data-label="Product">
          <div style="display:flex; align-items:center; gap:10px;">
            <img src="${item.image || (typeof item.product?.images?.[0] === 'object' ? item.product.images[0]?.url : item.product?.images?.[0]) || '/images/placeholder.svg'}" style="width:40px; height:40px; object-fit:cover; border-radius:4px; flex-shrink:0;" />
            <div style="min-width:0;">
              <div style="font-weight:600; font-size:0.85rem; word-break:break-word;">${item.name}</div>
              ${moqBadge}
            </div>
          </div>
        </td>
        <td data-label="Variant">${variantCell}</td>
        <td data-label="Price">₹${item.price}</td>
        <td data-label="Qty">
          <input type="number" class="form-input mo-qty-input" value="${item.quantity}" onchange="updateMoQuantity(${i}, this.value)" min="${minQty}" />
        </td>
        <td data-label="Total" style="font-weight:700;">₹${item.price * item.quantity}</td>
        <td data-label="">
          <button type="button" class="btn-icon delete" onclick="removeProductFromManualOrder(${i})">✕</button>
        </td>
      </tr>
    `;
  }).join('');
  
  updateMoTotals();
}

function changeMoVariantByParts(index, type, value) {
  const item = moSelectedItems[index];
  if (!item || !item.allVariations) return;

  let newColor = type === 'color' ? value : item.color;
  let newSize  = type === 'size'  ? value : item.size;

  // Find variation that matches. If color changed, try to find current size in new color, 
  // or just pick the first available size for that color.
  let v = item.allVariations.find(varnt => varnt.color === newColor && varnt.size === newSize);
  
  if (!v && type === 'color') {
    // If we changed color and the old size isn't available, pick first size of new color
    v = item.allVariations.find(varnt => varnt.color === newColor);
  }

  if (v) {
    item.variationId = v._id;
    item.color = v.color || "";
    item.size  = v.size || "";
    item.price = (v.price && v.price > 0) ? v.price : item.basePrice || 0; // Fallback to base price
  } else if (type === 'color') {
    item.color = value;
  } else if (type === 'size') {
    item.size = value;
  }

  renderMoSelectedItems();
}

function changeMoColor(itemIndex, newColor) {
  const item = moSelectedItems[itemIndex];
  if (!item) return;
  item.color = newColor;
  renderMoSelectedItems();
}

function changeMoVariant(itemIndex, newVariationId) {
  const item = moSelectedItems[itemIndex];
  if (!item || !item.allVariations) return;
  
  const v = item.allVariations.find(v => v._id === newVariationId);
  if (!v) return;
  
  item.variationId = v._id;
  item.color = v.color || "";
  item.size = v.size || "";
  item.price = (v.price && v.price > 0) ? v.price : item.basePrice || 0; // Fallback to base product price
  
  renderMoSelectedItems();
}

function updateMoTotals() {
  const subtotal = moSelectedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const shippingInput = document.getElementById('moShippingCost');
  
  // Detect if the admin manually typed in the shipping cost input
  if (document.activeElement && document.activeElement.id === 'moShippingCost') {
    isMoShippingOverridden = true;
  }

  let shipping = 0;
  if (isMoShippingOverridden) {
    shipping = parseFloat(shippingInput?.value) || 0;
  } else {
    // Calculate Auto Shipping
    const city = document.getElementById('moCity').value.trim();
    
    if (city) {
      const isBranch = BRANCH_CITIES.some(c => c.toLowerCase() === city.toLowerCase());

      // Auto-select Skyking for branch cities
      if (isBranch) {
        const partnerSelect = document.getElementById('moDeliveryPartner');
        if (partnerSelect) partnerSelect.value = 'Skyking';
      }
    }
    
    if (shippingInput) {
      shippingInput.value = shipping;
    }
  }
  
  const total = subtotal + shipping;
  
  document.getElementById('moSubtotalDisplay').textContent = subtotal.toLocaleString('en-IN');
  document.getElementById('moTotalDisplay').textContent = total.toLocaleString('en-IN');
}

async function submitManualOrder(event) {
  event.preventDefault();
  
  if (moSelectedItems.length === 0) {
    return showToast('Please add at least one product', 'error');
  }
  
  const btn = document.getElementById('moSubmitBtn');
  btn.disabled = true;
  btn.textContent = 'Creating Order...';
  
  const orderData = {
    items: moSelectedItems.map(item => ({
      productId: item.productId || null,
      variationId: item.variationId || null,
      price: item.price,
      quantity: item.quantity,
      image: item.image,
      name: item.name,
      color: item.color,
      size: item.size,
      isCustom: !!item.isCustom
    })),
    shippingAddress: {
      name: document.getElementById('moCustomerName').value.trim(),
      phone: document.getElementById('moPhone').value.trim(),
      email: document.getElementById('moEmail').value.trim(),
      street: document.getElementById('moStreet').value.trim(),
      city: document.getElementById('moCity').value.trim(),
      state: document.getElementById('moState').value.trim(),
      pincode: document.getElementById('moPincode').value.trim()
    },
    paymentMethod: document.getElementById('moPaymentMethod').value,
    status: document.getElementById('moStatus').value,
    notes: document.getElementById('moNotes').value.trim(),
    shippingCost: parseFloat(document.getElementById('moShippingCost').value) || 0,
    subtotal: moSelectedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0),
    tracking: {
      company: document.getElementById('moDeliveryPartner').value
    }
  };
  
  orderData.total = orderData.subtotal + orderData.shippingCost;

  try {
    const res = await API.adminCreateManualOrder(orderData);
    showToast('Manual order created successfully!', 'success');
    showPage('orders');
  } catch (err) {
    showToast(err.message, 'error');
    btn.disabled = false;
    btn.textContent = 'Create Manual Order';
  }
}

/* ── Custom Product Modal ────────────────────────────── */
function openCustomProductModal() {
  document.getElementById('cpName').value = '';
  document.getElementById('cpSize').value = '';
  document.getElementById('cpColor').value = '';
  document.getElementById('cpPrice').value = '';
  document.getElementById('cpQuantity').value = '1';
  document.getElementById('customProductModal').classList.add('open');
}

function addCustomProductToOrder() {
  const name = document.getElementById('cpName').value.trim();
  const size = document.getElementById('cpSize').value.trim();
  const color = document.getElementById('cpColor').value.trim();
  const price = parseFloat(document.getElementById('cpPrice').value);
  const quantity = parseInt(document.getElementById('cpQuantity').value) || 1;

  if (!name) return showToast('Product name is required', 'error');
  if (isNaN(price) || price <= 0) return showToast('Please enter a valid price', 'error');
  if (quantity < 1) return showToast('Quantity must be at least 1', 'error');

  moSelectedItems.push({
    productId: null,
    variationId: null,
    name,
    color,
    size,
    price,
    image: '',
    quantity,
    minQuantity: 1,
    isCustom: true,
    allVariations: [],
    availableColors: []
  });

  closeModal('customProductModal');
  renderMoSelectedItems();
  showToast('Custom product added to order', 'success');
}

/* ── Login Requests ─────────────────────────────── */
// Registration requests removed - accounts are now created directly

window.loadLoginRequests = async function() {
  const tbody = document.getElementById('loginRequestsTableBody');
  const badge = document.getElementById('badgeLoginRequests');
  const filter = document.getElementById('loginStatusFilter')?.value || 'pending';

  try {
    const data = await API.adminGetLoginRequests();
    if (!data.success) throw new Error(data.message);

    // Filter requests
    let requests = data.requests || [];
    if (filter !== 'all') {
      requests = requests.filter(r => r.status === filter);
    }

    if (badge) badge.textContent = requests.length;

    if (requests.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--mid)">No ${filter} login requests found.</td></tr>`;
      return;
    }

    tbody.innerHTML = requests.map(r => `
      <tr>
        <td>${new Date(r.createdAt).toLocaleDateString('en-IN')}</td>
        <td><strong>${r.name || (r.user?.name || '—')}</strong></td>
        <td>${r.email || (r.user?.email || '—')}</td>
        <td>${r.businessName || (r.user?.businessName || '—')}</td>
        <td>${r.contactNumber || (r.user?.contactNumber || '—')}</td>
        <td><span class="badge badge-${r.status}">${r.status}${r.duration && r.status === 'approved' ? ` (${r.duration === 'always' ? '∞' : '3h'})` : ''}</span></td>
        <td style="white-space:nowrap;">
          <button class="btn-icon view" onclick="viewLoginRequest('${r._id}')" title="View details">👁</button>
          ${r.status === 'pending' ? `
            <button class="btn-icon" onclick="approveLogin('${r._id}', '3h')" title="Approve 3 Hours" style="background:#E8F5E9;color:#2E7D32;font-size:0.7rem;padding:4px 6px;border-radius:4px;margin-left:4px;">⏱3h</button>
            <button class="btn-icon" onclick="approveLogin('${r._id}', 'always')" title="Approve Always" style="background:#E3F2FD;color:#1565C0;font-size:0.7rem;padding:4px 6px;border-radius:4px;margin-left:2px;">✨∞</button>
          ` : ''}
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error(err);
    showToast('Failed to load login requests', 'error');
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:32px;color:#C62828">Error loading requests: ${err.message}</td></tr>`;
  }
};

window.viewLoginRequest = async function(id) {
  try {
    const data = await API.adminGetLoginRequest(id);
    if (!data.success) throw new Error(data.message);
    const r = data.request;
    const name = r.name || r.user?.name || '—';
    const email = r.email || r.user?.email || '—';
    const businessName = r.businessName || r.user?.businessName || '—';
    const contactNumber = r.contactNumber || r.user?.contactNumber || '—';
    const businessCard = r.businessCard || r.user?.businessCard || '';

    const modalBody = document.getElementById('loginRequestModalBody');
    modalBody.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:16px;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
          <div>
            <label class="form-label" style="font-weight:600">Full Name</label>
            <p style="padding:10px;background:#f9f9f9;border-radius:6px;margin:0">${name}</p>
          </div>
          <div>
            <label class="form-label" style="font-weight:600">Email Address</label>
            <p style="padding:10px;background:#f9f9f9;border-radius:6px;margin:0">${email}</p>
          </div>
          <div>
            <label class="form-label" style="font-weight:600">Business Name</label>
            <p style="padding:10px;background:#f9f9f9;border-radius:6px;margin:0">${businessName}</p>
          </div>
          <div>
            <label class="form-label" style="font-weight:600">Contact Number</label>
            <p style="padding:10px;background:#f9f9f9;border-radius:6px;margin:0">${contactNumber}</p>
          </div>
        </div>
        <div>
          <label class="form-label" style="font-weight:600">Business Card</label>
          <div style="margin-top:8px;text-align:center;background:#fafafa;padding:16px;border-radius:8px;border:1px solid #eee">
            ${businessCard ? `<img src="${businessCard}" alt="Business Card" style="max-width:100%;max-height:250px;border-radius:6px;box-shadow:0 2px 8px rgba(0,0,0,0.1);" />` : '<p style="color:#999;margin:0">No business card uploaded</p>'}
          </div>
        </div>
        ${r.status === 'pending' ? `
          <div style="margin-top:20px;">
            <label class="form-label" style="font-weight:600;margin-bottom:12px;display:block;">Select Access Duration</label>
            <div style="display:flex;gap:12px;">
              <button onclick="approveLogin('${r._id}', '3h')" class="btn-admin-primary" style="flex:1;padding:12px;display:flex;flex-direction:column;align-items:center;gap:4px;">
                <span style="font-size:1.2rem;">⏱</span>
                <span>3 Hours Access</span>
              </button>
              <button onclick="approveLogin('${r._id}', 'always')" style="flex:1;padding:12px;background:linear-gradient(135deg,#1B5E4B,#2A7A63);color:white;border:none;border-radius:8px;font-weight:600;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:4px;font-family:inherit;font-size:.84rem;">
                <span style="font-size:1.2rem;">✨</span>
                <span>Always Access</span>
              </button>
            </div>
            <div style="display:flex;gap:12px;margin-top:12px;">
              <button onclick="rejectLogin('${r._id}')" class="btn-admin-secondary" style="width:100%;background:#C62828;color:white;border:none;">Reject Request</button>
            </div>
          </div>
        ` : `
          <div style="margin-top:20px;padding:12px;text-align:center;background:#eef7f4;border-radius:6px;color:#1B5E4B;font-weight:600;">
            Status: ${r.status.toUpperCase()}${r.duration ? ` (${r.duration === 'always' ? 'Always Access' : '3 Hours'})` : ''}
          </div>
        `}
      </div>
    `;

    document.getElementById('loginRequestModal').classList.add('open');
  } catch (err) {
    showToast(err.message, 'error');
  }
};

window.approveLogin = async function(id, duration = '3h') {
  const label = duration === 'always' ? 'Always Access' : '3 Hours';
  if (!confirm(`Approve this login request for ${label}?`)) return;
  try {
    const data = await API.adminApproveLogin(id, duration);
    showToast(data.message || `Login approved for ${label} and email sent to user.`, 'success');
    closeModal('loginRequestModal');
    loadLoginRequests();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

window.rejectLogin = async function(id) {
  if (!confirm('Are you sure you want to reject this login request?')) return;
  try {
    const data = await API.adminRejectLogin(id);
    showToast(data.message || 'Login request rejected.', 'success');
    closeModal('loginRequestModal');
    loadLoginRequests();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

/* -- Authorised Users ---------------------------------- */
let allAuthorisedUsers = [];

async function loadUsers() {
  const tbody = document.getElementById('usersTableBody');
  if (!tbody) return;
  
  const searchInput = document.getElementById('usrFilterInput');
  if (searchInput) searchInput.value = '';

  tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--mid)">Loading...</td></tr>';
  try {
    const data = await API.adminGetUsers();
    allAuthorisedUsers = data.users || [];
    renderUsersTable(allAuthorisedUsers);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:24px;color:#C62828">${err.message}</td></tr>`;
  }
}

function filterUsers() {
  const query = document.getElementById('usrFilterInput').value.toLowerCase();
  const filtered = allAuthorisedUsers.filter(u => 
    (u.name && u.name.toLowerCase().includes(query)) || 
    (u.businessName && u.businessName.toLowerCase().includes(query))
  );
  renderUsersTable(filtered);
}

function renderUsersTable(users) {
  const tbody = document.getElementById('usersTableBody');
  if (!tbody) return;
  const badge = document.getElementById('badgeUsers');
  if (badge) badge.textContent = users.length;

  if (!users.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--mid)">No authorised users found.</td></tr>';
    return;
  }

  tbody.innerHTML = users.map(u => {
    let accessBadge = '';
    if (u.alwaysAccess) {
      accessBadge = `<span style="background:#E8F5E9;color:#2E7D32;padding:4px 10px;border-radius:12px;font-size:0.75rem;font-weight:600;display:inline-block;">∞ Always</span>`;
    } else if (u.sessionExpiry && new Date(u.sessionExpiry) > new Date()) {
      const remainingMs = new Date(u.sessionExpiry) - new Date();
      const remainingMins = Math.ceil(remainingMs / 60000);
      accessBadge = `<span style="background:#E3F2FD;color:#1565C0;padding:4px 10px;border-radius:12px;font-size:0.75rem;font-weight:600;display:inline-block;" title="Expires at ${new Date(u.sessionExpiry).toLocaleTimeString('en-IN')}">⏱️ Active (${remainingMins}m left)</span>`;
    } else {
      accessBadge = `<span style="background:#ECEFF1;color:#546E7A;padding:4px 10px;border-radius:12px;font-size:0.75rem;font-weight:600;display:inline-block;">🔒 No Access</span>`;
    }

    return `
      <tr>
        <td style="white-space:nowrap;">${new Date(u.createdAt).toLocaleDateString('en-IN')}</td>
        <td><strong>${u.name}</strong></td>
        <td>${u.email}</td>
        <td>${u.businessName || '—'}</td>
        <td style="white-space:nowrap;">${u.contactNumber || '—'}</td>
        <td style="text-align:center;">${accessBadge}</td>
        <td style="white-space:nowrap; text-align:center;">
          <button onclick="openEditUserAccessModal('${u._id}')" title="Edit Access Level" style="background:#F0F4F8; color:#102A43; border:1px solid #CBD5E1; padding:5px 10px; border-radius:4px; cursor:pointer; font-weight:500; font-size:0.78rem; display:inline-flex; align-items:center; gap:4px; vertical-align:middle; line-height:1;">✏️ Access</button>
          <button class="btn-icon delete" onclick="deleteUser('${u._id}')" title="Remove User" style="vertical-align:middle; margin-left:4px; display:inline-flex; align-items:center; justify-content:center;">🗑️</button>
        </td>
      </tr>
    `;
  }).join('');
}

window.openEditUserAccessModal = function(userId) {
  const user = allAuthorisedUsers.find(u => u._id === userId);
  if (!user) return;

  const modalBody = document.getElementById('editUserAccessModalBody');
  if (!modalBody) return;

  let currentAccessText = '';
  if (user.alwaysAccess) {
    currentAccessText = '<span style="color:#2E7D32;font-weight:600;">∞ Always (Infinite) Access</span>';
  } else if (user.sessionExpiry && new Date(user.sessionExpiry) > new Date()) {
    currentAccessText = `<span style="color:#1565C0;font-weight:600;">⏱️ Active 3-Hour Access (Expires: ${new Date(user.sessionExpiry).toLocaleTimeString('en-IN')})</span>`;
  } else {
    currentAccessText = '<span style="color:#546E7A;font-weight:600;">🔒 No Active Access</span>';
  }

  modalBody.innerHTML = `
    <div style="background:#F8FAFC;padding:12px 16px;border-radius:6px;margin-bottom:20px;border:1px solid #E2E8F0;">
      <p style="margin-bottom:4px;font-size:0.9rem;"><strong>User:</strong> ${user.name} (${user.email})</p>
      <p style="margin-bottom:4px;font-size:0.9rem;"><strong>Business:</strong> ${user.businessName || 'N/A'}</p>
      <p style="margin-bottom:0;font-size:0.9rem;"><strong>Current Status:</strong> ${currentAccessText}</p>
    </div>

    <label style="display:block;font-size:0.85rem;font-weight:600;margin-bottom:8px;color:#334155;">Select Access Duration Action:</label>

    <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:20px;">
      <button class="btn" style="width:100%;text-align:left;padding:12px;background:#2E7D32;color:#fff;border:none;border-radius:6px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;" onclick="saveUserAccess('${user._id}', 'always')">
        <div>
          <div style="font-weight:600;">∞ Grant Always (Infinite) Access</div>
          <div style="font-size:0.75rem;opacity:0.9;">User can log in anytime without expiration or re-approval</div>
        </div>
        <span>➔</span>
      </button>

      <button class="btn" style="width:100%;text-align:left;padding:12px;background:#1565C0;color:#fff;border:none;border-radius:6px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;" onclick="saveUserAccess('${user._id}', '3h')">
        <div>
          <div style="font-weight:600;">⏱️ Grant 3 Hours Access</div>
          <div style="font-size:0.75rem;opacity:0.9;">Starts a new 3-hour access timer from now</div>
        </div>
        <span>➔</span>
      </button>

      <button class="btn" style="width:100%;text-align:left;padding:12px;background:#C62828;color:#fff;border:none;border-radius:6px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;" onclick="saveUserAccess('${user._id}', 'revoke')">
        <div>
          <div style="font-weight:600;">🚫 Revoke / Remove Access</div>
          <div style="font-size:0.75rem;opacity:0.9;">Removes infinite or active access (user will require admin approval next time)</div>
        </div>
        <span>➔</span>
      </button>
    </div>

    <div style="text-align:right;">
      <button class="btn btn-secondary" onclick="closeModal('editUserAccessModal')">Cancel</button>
    </div>
  `;

  openModal('editUserAccessModal');
};

window.saveUserAccess = async function(userId, accessType) {
  try {
    const res = await API.adminUpdateUserAccess(userId, accessType);
    showToast(res.message || 'User access updated successfully', 'success');
    closeModal('editUserAccessModal');
    loadUsers();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

window.loadUsers = loadUsers;
window.filterUsers = filterUsers;
window.deleteUser = deleteUser;

async function deleteUser(id) {
  if (!confirm('Are you sure you want to completely remove this user? They will lose access to the portal.')) return;
  try {
    await API.adminDeleteUser(id);
    showToast('User deleted successfully', 'success');
    loadUsers();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

/* ══════════════════════════════════════════════════════════
   EDIT ORDER MODAL — Full Logic
══════════════════════════════════════════════════════════ */
let editOrderData = null;  // Holds the working copy of the order being edited
let editOrderItems = [];   // Working copy of items

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
    <!-- Customer & Shipping Info -->
    <div class="edit-order-section">
      <h3>📋 Order & Shipping Info</h3>
      <div class="edit-order-grid">
        <div>
          <label class="edit-order-label">Customer Name</label>
          <input class="edit-order-input" id="eoCustomerName" value="${escHtml(o.customerName || o.user?.name || '')}" />
        </div>
        <div>
          <label class="edit-order-label">Phone</label>
          <input class="edit-order-input" id="eoPhone" value="${escHtml(addr.phone || o.user?.contactNumber || '')}" />
        </div>
        <div>
          <label class="edit-order-label">Email</label>
          <input class="edit-order-input" id="eoEmail" value="${escHtml(o.user?.email || '')}" />
        </div>
        <div class="wide">
          <label class="edit-order-label">Street / Address Line</label>
          <input class="edit-order-input" id="eoStreet" value="${escHtml(addr.street || addr.addressLine || '')}" />
        </div>
        <div>
          <label class="edit-order-label">City</label>
          <input class="edit-order-input" id="eoCity" value="${escHtml(addr.city || '')}" />
        </div>
        <div>
          <label class="edit-order-label">State</label>
          <input class="edit-order-input" id="eoState" value="${escHtml(addr.state || '')}" />
        </div>
        <div>
          <label class="edit-order-label">Pincode</label>
          <input class="edit-order-input" id="eoPincode" value="${escHtml(addr.pincode || addr.zip || '')}" />
        </div>
        <div>
          <label class="edit-order-label">Payment Method</label>
          <select class="edit-order-input" id="eoPaymentMethod">
            <option value="COD" ${o.paymentMethod === 'COD' ? 'selected' : ''}>COD</option>
            <option value="Online" ${o.paymentMethod === 'Online' ? 'selected' : ''}>Online</option>
            <option value="UPI" ${o.paymentMethod === 'UPI' ? 'selected' : ''}>UPI</option>
            <option value="Bank Transfer" ${o.paymentMethod === 'Bank Transfer' ? 'selected' : ''}>Bank Transfer</option>
          </select>
        </div>
        <div>
          <label class="edit-order-label">Payment Status</label>
          <select class="edit-order-input" id="eoPaymentStatus">
            <option value="Pending" ${o.paymentStatus === 'Pending' ? 'selected' : ''}>Pending</option>
            <option value="Paid" ${o.paymentStatus === 'Paid' ? 'selected' : ''}>Paid</option>
            <option value="Failed" ${o.paymentStatus === 'Failed' ? 'selected' : ''}>Failed</option>
          </select>
        </div>
        <div>
          <label class="edit-order-label">Order Status</label>
          <select class="edit-order-input" id="eoStatus">
            <option value="Pending" ${o.status === 'Pending' ? 'selected' : ''}>Pending</option>
            <option value="Confirmed" ${o.status === 'Confirmed' ? 'selected' : ''}>Confirmed</option>
            <option value="Processing" ${o.status === 'Processing' ? 'selected' : ''}>Processing</option>
            <option value="Shipped" ${o.status === 'Shipped' ? 'selected' : ''}>Shipped</option>
            <option value="Delivered" ${o.status === 'Delivered' ? 'selected' : ''}>Delivered</option>
            <option value="Cancelled" ${o.status === 'Cancelled' ? 'selected' : ''}>Cancelled</option>
          </select>
        </div>
        <div class="wide">
          <div class="edit-order-store-pickup">
            <input type="checkbox" id="eoStorePickup" ${o.storePickup ? 'checked' : ''} />
            <span>Store Pickup (no shipping required)</span>
          </div>
        </div>
        <div class="wide">
          <label class="edit-order-label">Admin Notes</label>
          <textarea class="edit-order-input" id="eoNotes" rows="2" placeholder="Internal notes…">${escHtml(o.notes || o.adminNotes || '')}</textarea>
        </div>
      </div>
    </div>

    <!-- Products -->
    <div class="edit-order-section">
      <div class="edit-order-products-header">
        <h3>📦 Products</h3>
        <div class="edit-order-products-btns">
          <button class="btn-add-catalog" onclick="openCatalogPicker()">+ From Catalog</button>
          <button class="btn-add-custom" onclick="addCustomItem()">+ Custom Item</button>
        </div>
      </div>
      <div id="eoItemsList">
        ${editOrderItems.map((it, i) => renderEditOrderItem(it, i)).join('')}
      </div>
    </div>

    <!-- Summary -->
    <div class="edit-order-summary">
      <h3>💰 Order Summary</h3>
      <div class="edit-order-summary-row">
        <span>Subtotal</span>
        <span class="edit-order-summary-val" id="eoSubtotal">₹0</span>
      </div>
      <div class="edit-order-summary-row">
        <span>Shipping Fee</span>
        <input class="edit-order-summary-input" id="eoShippingFee" type="number" min="0" value="${o.shippingFee || 0}" onchange="recalcEditTotals()" />
      </div>
      <div class="edit-order-summary-row">
        <span>Packaging Fee</span>
        <input class="edit-order-summary-input" id="eoPackagingFee" type="number" min="0" value="${o.packagingFee || 0}" onchange="recalcEditTotals()" />
      </div>
      <div class="edit-order-summary-row">
        <span>Discount</span>
        <input class="edit-order-summary-input" id="eoDiscount" type="number" min="0" value="${o.discount || 0}" onchange="recalcEditTotals()" />
      </div>
      <div class="edit-order-summary-row total">
        <span>Grand Total</span>
        <span class="edit-order-summary-val" id="eoGrandTotal">₹0</span>
      </div>
    </div>
  `;

  recalcEditTotals();
}

function renderEditOrderItem(it, idx) {
  const total = (it.price * it.quantity).toFixed(2);
  const imgSrc = it.image || '/images/placeholder.png';
  return `
    <div class="edit-order-item" data-idx="${idx}">
      <img class="edit-order-item-img" src="${imgSrc}" alt="" onerror="this.src='/images/placeholder.png'" />
      <div class="edit-order-item-details">
        <input class="edit-order-item-name-input" value="${escHtml(it.name)}" onchange="editOrderItems[${idx}].name=this.value" />
        <div class="edit-order-item-variants">
          <input class="edit-order-item-variant-input" placeholder="Variant" value="${escHtml(it.variant)}" onchange="editOrderItems[${idx}].variant=this.value" />
          <input class="edit-order-item-variant-input" placeholder="Size" value="${escHtml(it.size)}" onchange="editOrderItems[${idx}].size=this.value" />
          <input class="edit-order-item-variant-input" placeholder="Color" value="${escHtml(it.color)}" onchange="editOrderItems[${idx}].color=this.value" />
        </div>
      </div>
      <div class="edit-order-item-pricing">
        <div>
          <label>Price (₹)</label>
          <input class="edit-order-item-price-input" type="number" min="0" value="${it.price}" onchange="editOrderItems[${idx}].price=+this.value; recalcEditTotals()" />
        </div>
        <div>
          <label>Qty</label>
          <input class="edit-order-item-qty-input" type="number" min="1" value="${it.quantity}" onchange="editOrderItems[${idx}].quantity=+this.value; recalcEditTotals()" />
        </div>
      </div>
      <div class="edit-order-item-total">
        <label>Total</label>
        <span class="edit-order-item-total-val">₹${total}</span>
      </div>
      <button class="edit-order-item-remove" onclick="removeEditItem(${idx})" title="Remove item">✕</button>
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
  editOrderItems.push({
    productId: null,
    name: 'Custom Product',
    image: '/images/placeholder.svg',
    variant: '',
    size: '',
    color: '',
    price: 0,
    quantity: 1,
    isCustom: true
  });
  document.getElementById('eoItemsList').innerHTML = editOrderItems.map((it, i) => renderEditOrderItem(it, i)).join('');
  recalcEditTotals();
}

/* Catalog Picker */
let catalogAllProducts = [];

async function openCatalogPicker() {
  document.getElementById('catalogPickerBackdrop').classList.add('open');
  document.getElementById('catalogPickerModal').classList.add('open');
  document.getElementById('catalogPickerSearch').value = '';
  document.getElementById('catalogPickerResults').innerHTML = '<p style="text-align:center;color:var(--mid);padding:20px">Loading products…</p>';
  try {
    const data = await API.adminGetProducts({ limit: 500 });
    catalogAllProducts = data.products || data || [];
    document.getElementById('catalogPickerResults').innerHTML = '<p style="text-align:center;color:var(--mid);padding:20px">Type to search products…</p>';
  } catch (err) {
    document.getElementById('catalogPickerResults').innerHTML = '<p style="text-align:center;color:red;padding:20px">Failed to load products</p>';
  }
}

function closeCatalogPicker() {
  document.getElementById('catalogPickerBackdrop').classList.remove('open');
  document.getElementById('catalogPickerModal').classList.remove('open');
}

function searchCatalogProducts() {
  const q = document.getElementById('catalogPickerSearch').value.trim().toLowerCase();
  if (!q) {
    document.getElementById('catalogPickerResults').innerHTML = '<p style="text-align:center;color:var(--mid);padding:20px">Type to search products…</p>';
    return;
  }
  const matches = catalogAllProducts.filter(p => p.name?.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q)).slice(0, 20);
  if (!matches.length) {
    document.getElementById('catalogPickerResults').innerHTML = '<p style="text-align:center;color:var(--mid);padding:20px">No products found</p>';
    return;
  }
  document.getElementById('catalogPickerResults').innerHTML = matches.map(p => `
    <div class="catalog-picker-item" onclick='pickCatalogProduct(${JSON.stringify({
      id: p._id,
      name: p.name,
      image: (typeof p.images?.[0] === 'object' ? p.images[0]?.url : p.images?.[0]) || '/images/placeholder.svg',
      price: p.wholesalePrice || p.price || 0,
      variant: p.variant || '',
      size: p.size || '',
      color: p.color || ''
    }).replace(/'/g, "&#39;")})'>
      <img src="${(typeof p.images?.[0] === 'object' ? p.images[0]?.url : p.images?.[0]) || '/images/placeholder.svg'}" alt="" onerror="this.src='/images/placeholder.svg'" />
      <div class="catalog-picker-item-info">
        <div class="catalog-picker-item-name">${escHtml(p.name)}</div>
        <div class="catalog-picker-item-price">₹${(p.wholesalePrice || p.price || 0).toLocaleString('en-IN')}</div>
      </div>
    </div>
  `).join('');
}

function pickCatalogProduct(prod) {
  editOrderItems.push({
    productId: prod.id,
    name: prod.name,
    image: prod.image,
    variant: prod.variant || '',
    size: prod.size || '',
    color: prod.color || '',
    price: prod.price,
    quantity: 1,
    isCustom: false
  });
  closeCatalogPicker();
  document.getElementById('eoItemsList').innerHTML = editOrderItems.map((it, i) => renderEditOrderItem(it, i)).join('');
  recalcEditTotals();
}

/* Save edited order */
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
      items: editOrderItems.map(it => ({
        product: it.productId || undefined,
        name: it.name,
        image: it.image,
        variant: it.variant,
        size: it.size,
        color: it.color,
        price: +it.price,
        quantity: +it.quantity,
        isCustom: it.isCustom
      })),
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
    // Refresh the orders list
    if (typeof loadOrders === 'function') loadOrders();
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

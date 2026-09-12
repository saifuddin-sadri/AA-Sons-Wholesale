// frontend/js/main.js

// ─── AUTH GATE: Check session before loading page ─────
(function authGate() {
  // Skip auth check on the auth page itself
  if (window.location.pathname === '/auth') return;
  // Skip auth check on admin page (has its own login)
  if (window.location.pathname === '/admin') return;

  const token = localStorage.getItem('aa_token');
  const userStr = localStorage.getItem('aa_user');

  if (!token || !userStr) {
    window.location.href = '/auth';
    return;
  }

  try {
    const user = JSON.parse(userStr);
    // Admin users bypass session timer
    if (user.role === 'admin') return;
  } catch (e) {
    // Invalid user data
    window.location.href = '/auth';
    return;
  }

  // Check session expiry
  const expiry = localStorage.getItem('aa_session_expiry');
  if (!expiry || new Date() >= new Date(expiry)) {
    localStorage.removeItem('aa_token');
    localStorage.removeItem('aa_user');
    localStorage.removeItem('aa_session_expiry');
    window.location.href = '/auth';
    return;
  }
})();

// ─── SESSION TIMER: Countdown + auto-logout ───────────
function initSessionTimer() {
  try {
    const user = JSON.parse(localStorage.getItem('aa_user'));
    if (user?.role === 'admin') return;
  } catch (e) { return; }

  // Create timer badge in navbar
  const navRight = document.querySelector('.nav-right');
  if (navRight && !document.getElementById('sessionTimer')) {
    const timerEl = document.createElement('div');
    timerEl.id = 'sessionTimer';
    timerEl.style.cssText = 'display:flex;align-items:center;gap:5px;background:rgba(27,94,75,0.1);color:var(--teal,#1B5E4B);padding:4px 10px;border-radius:20px;font-size:0.72rem;font-weight:600;font-family:var(--font-body);white-space:nowrap;';
    timerEl.innerHTML = '<span id="sessionTimerIcon" style="font-size:0.85rem;">⏱</span> <span id="sessionCountdown">--:--:--</span>';
    navRight.insertBefore(timerEl, navRight.firstChild);
  }

  const countdownEl = document.getElementById('sessionCountdown');
  const iconEl = document.getElementById('sessionTimerIcon');
  const timerEl = document.getElementById('sessionTimer');
  if (!countdownEl) return;

  function updateTimer() {
    const expiry = localStorage.getItem('aa_session_expiry');
    if (!expiry) return;

    if (expiry === 'always') {
      if (iconEl) iconEl.textContent = '∞';
      countdownEl.textContent = 'Always Access';
      if (timerEl) {
        timerEl.style.background = 'rgba(27,94,75,0.1)';
        timerEl.style.color = 'var(--teal,#1B5E4B)';
      }
      return;
    }

    if (iconEl) iconEl.textContent = '⏱';

    const now = new Date();
    const end = new Date(expiry);
    const diff = end - now;

    if (isNaN(end.getTime()) || diff <= 0) {
      localStorage.removeItem('aa_token');
      localStorage.removeItem('aa_user');
      localStorage.removeItem('aa_session_expiry');
      window.location.href = '/auth';
      return;
    }

    const hours = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    const secs = Math.floor((diff % 60000) / 1000);

    countdownEl.textContent = `${String(hours).padStart(2,'0')}:${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;

    if (timerEl) {
      if (diff < 600000) {
        timerEl.style.background = 'rgba(198,40,40,0.1)';
        timerEl.style.color = '#C62828';
      } else if (diff < 1800000) {
        timerEl.style.background = 'rgba(245,158,11,0.1)';
        timerEl.style.color = '#D97706';
      } else {
        timerEl.style.background = 'rgba(27,94,75,0.1)';
        timerEl.style.color = 'var(--teal,#1B5E4B)';
      }
    }
  }

  updateTimer();
  setInterval(updateTimer, 1000);
}

document.addEventListener('DOMContentLoaded', () => {
  initSessionTimer();
  initNav();
  initScrollLinks();
  initLandingCategories();
  loadFeaturedProducts();
  initScrollAnimations();
  initSearch();
  initHomeFaq();
  initFestiveSeason();
});

function initNav() {
  const navbar = document.getElementById('navbar');
  const hamburger = document.getElementById('hamburger');
  const navLinks = document.getElementById('navLinks');
  window.addEventListener('scroll', () => {
    navbar?.classList.toggle('scrolled', window.scrollY > 40);
  });
  hamburger?.addEventListener('click', () => {
    hamburger.classList.toggle('open');
    navLinks?.classList.toggle('open');
  });
  document.addEventListener('click', (e) => {
    if (!navbar?.contains(e.target)) {
      hamburger?.classList.remove('open');
      navLinks?.classList.remove('open');
    }
  });
  const currentPath = window.location.pathname;
  document.querySelectorAll('.nav-link').forEach(link => {
    if (link.getAttribute('href') === currentPath) link.classList.add('active');
  });
}

function initScrollLinks() {
  document.querySelectorAll('.scroll-link, a[href^="#"]').forEach(link => {
    link.addEventListener('click', (e) => {
      const href = link.getAttribute('href');
      if (href?.startsWith('#')) {
        e.preventDefault();
        const target = document.querySelector(href);
        if (target) {
          const top = target.getBoundingClientRect().top + window.scrollY - 80;
          window.scrollTo({ top, behavior: 'smooth' });
          document.getElementById('navLinks')?.classList.remove('open');
          document.getElementById('hamburger')?.classList.remove('open');
        }
      }
    });
  });
}

async function loadFeaturedProducts() {
  const container = document.getElementById('featuredRowsContainer');
  if (!container) return;
  
  try {
    const data = await API.getProducts({ featured: true, limit: 100 });
    container.innerHTML = '';
    
    if (!data.products?.length) {
      container.innerHTML = '<p style="text-align:center;color:#999;padding:40px">No featured products yet.</p>';
      return;
    }

    const items = data.products;
    const TARGET_SIZE = 15;
    const MIN_SIZE = 5;
    const rows = [];

    // Splitting logic
    for (let i = 0; i < items.length; i += TARGET_SIZE) {
      rows.push(items.slice(i, i + TARGET_SIZE));
    }

    if (rows.length > 1) {
      const lastRow = rows[rows.length - 1];
      if (lastRow.length < MIN_SIZE) {
        const popped = rows.pop();
        rows[rows.length - 1] = rows[rows.length - 1].concat(popped);
      }
    }

    // Render rows
    rows.forEach((rowItems, rowIndex) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'featured-carousel-wrapper';
      
      const prevBtn = document.createElement('button');
      prevBtn.className = 'carousel-nav-btn prev';
      prevBtn.setAttribute('aria-label', `Previous Row ${rowIndex + 1}`);
      prevBtn.innerHTML = `<svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6" /></svg>`;
      
      const nextBtn = document.createElement('button');
      nextBtn.className = 'carousel-nav-btn next';
      nextBtn.setAttribute('aria-label', `Next Row ${rowIndex + 1}`);
      nextBtn.innerHTML = `<svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6" /></svg>`;
      
      const grid = document.createElement('div');
      grid.className = 'products-grid featured-carousel';
      
      rowItems.forEach((p, i) => {
        const card = createProductCard(p);
        card.style.animationDelay = `${i * 0.05}s`;
        card.classList.add('animate-in');
        grid.appendChild(card);
      });
      
      wrapper.appendChild(prevBtn);
      wrapper.appendChild(grid);
      wrapper.appendChild(nextBtn);
      container.appendChild(wrapper);
      
      initRowCarousel(grid, prevBtn, nextBtn);
    });

  } catch (err) {
    console.error(err);
    container.innerHTML = '<p style="text-align:center;color:#999;padding:40px">Could not load products.</p>';
  }
}

function initRowCarousel(grid, prevBtn, nextBtn) {
  if (!grid || !prevBtn || !nextBtn) return;

  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('active');
      } else {
        entry.target.classList.remove('active'); 
      }
    });
  }, { root: grid, threshold: 0.1 });

  const setupCard = (card) => {
    card.classList.add('carousel-card-reveal');
    revealObserver.observe(card);
  };

  [...grid.children].forEach(setupCard);

  const scrollSide = (direction) => {
    const cardWidth = grid.querySelector('.product-card')?.offsetWidth || 300;
    const scrollAmount = cardWidth * 3;
    grid.scrollBy({ left: direction === 'next' ? scrollAmount : -scrollAmount, behavior: 'smooth' });
  };

  prevBtn.addEventListener('click', () => scrollSide('prev'));
  nextBtn.addEventListener('click', () => scrollSide('next'));

  const toggleButtons = () => {
    prevBtn.disabled = grid.scrollLeft <= 5;
    nextBtn.disabled = grid.scrollLeft + grid.clientWidth >= grid.scrollWidth - 5;
  };

  grid.addEventListener('scroll', toggleButtons);
  window.addEventListener('resize', toggleButtons);
  setTimeout(toggleButtons, 500);
}

function createProductCard(p) {
  const discount = p.mrp && p.mrp > p.price ? Math.round(((p.mrp - p.price) / p.mrp) * 100) : 0;
  const inStock = p.stock > 0;
  const detailUrl = `/product?id=${p._id}`;
  const card = document.createElement('div');
  card.className = 'product-card';
  card.innerHTML = `
    <div class="product-img-wrap" style="cursor:pointer" tabindex="0" role="button" aria-label="View ${p.name} details">
      <img src="${p.images?.[0]?.url || '/images/placeholder.svg'}" alt="${p.name}" loading="lazy" onerror="this.src='/images/placeholder.svg'" />
      ${discount > 0 ? `<span class="product-badge">${discount}% OFF</span>` : ''}
      <div class="product-img-overlay">
        <span class="product-view-hint">
          <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          View Details
        </span>
      </div>
    </div>
    <div class="product-info">
      <div class="product-cat">
        ${(() => {
          const cats = Array.isArray(p.category) ? p.category : (p.category ? [p.category] : []);
          if (cats.length === 0) return 'UNASSIGNED';
          let html = cats.slice(0, 2).map(c => `<div class="cat-line">${c}</div>`).join('');
          if (cats.length > 2) html += '<div class="cat-line">...</div>';
          return html;
        })()}
      </div>
      <a href="${detailUrl}" class="product-name product-name-link">${p.name}</a>
      <div class="product-price-row">
        <span class="product-price">${formatRupees(p.price * (p.minQuantity || 1))}</span>
        ${p.mrp ? `<span class="product-mrp">${formatRupees(p.mrp * (p.minQuantity || 1))}</span>` : ''}
        ${discount > 0 ? `<span class="product-discount">Save ${discount}%</span>` : ''}
        ${p.minQuantity > 1 ? `<div style="font-size: 0.65rem; color: #777; width: 100%; margin-top: 2px;">(${formatRupees(p.price)} / pc) • Min. ${p.minQuantity} units</div>` : ''}
      </div>
      <div class="qty-controls" style="margin:12px 0; width: 100%; justify-content: center;">
        <button class="qty-btn qty-dec">−</button>
        <input type="number" class="qty-val" value="${p.minQuantity || 1}" min="${p.minQuantity || 1}" style="width: 50px; text-align: center; border: none; background: transparent; font-weight: 600; font-size: 1.1rem;" />
        <button class="qty-btn qty-inc">+</button>
      </div>
      <div class="product-card-actions">
        <a href="${detailUrl}" class="btn-view-details">
          <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          View
        </a>
        <button class="btn-add-cart">
          <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>
          Add to Cart
        </button>
      </div>
    </div>`;

  // Image area click
  card.querySelector('.product-img-wrap')?.addEventListener('click', () => {
    window.location.href = detailUrl;
  });

  // Qty Logic
  const minQty = parseInt(p.minQuantity) || 1;
  let qty = minQty;
  const qtyVal = card.querySelector('.qty-val');
  const priceDisplay = card.querySelector('.product-price');
  
  const updatePrice = () => {
    if (priceDisplay) {
      priceDisplay.textContent = formatRupees(p.price * qty);
    }
  };

  card.querySelector('.qty-dec')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (qty > minQty) {
      qty--;
      qtyVal.value = qty;
      updatePrice();
    } else if (minQty > 1) {
      showToast(`Minimum order quantity is ${minQty}`, 'warning');
    }
  });

  card.querySelector('.qty-inc')?.addEventListener('click', (e) => {
    e.stopPropagation();
    qty++;
    qtyVal.value = qty;
    updatePrice();
  });

  qtyVal?.addEventListener('input', (e) => {
    e.stopPropagation();
    // Allow free typing — don't override field while the user is still entering digits
    const parsed = parseInt(e.target.value);
    if (!isNaN(parsed) && parsed > 0) {
      qty = parsed;
      updatePrice();
    }
  });

  qtyVal?.addEventListener('blur', (e) => {
    const maxStock = p.stock !== undefined ? p.stock : 999;
    let finalVal = parseInt(e.target.value);

    if (isNaN(finalVal) || finalVal < 1) {
      showToast(`Minimum order quantity is ${minQty}`, 'warning');
      finalVal = minQty;
    } else if (finalVal < minQty) {
      showToast(`Minimum order quantity is ${minQty}. Setting to ${minQty}.`, 'warning');
      finalVal = minQty;
    } else if (finalVal > maxStock) {
      showToast(`Only ${maxStock} units left in stock!`, 'error');
      finalVal = maxStock;
    }

    qty = finalVal;
    e.target.value = finalVal;
    updatePrice();
  });

  card.querySelector('.btn-add-cart')?.addEventListener('click', (e) => {
    e.stopPropagation();
    Cart.add(p, qty);
  });
  return card;
}

function initScrollAnimations() {
  if (!('IntersectionObserver' in window)) return;
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.getIsIntersecting?.() || e.isIntersecting) { e.target.classList.add('animate-in'); obs.unobserve(e.target); } });
  }, { threshold: 0.1 });
  document.querySelectorAll('.why-card, .cat-card').forEach(el => obs.observe(el));
}

let landingCategories = [];
async function loadLandingCategories() {
  try {
    const data = await API.getCategories();
    landingCategories = data.categories || [];
  } catch (err) {
    console.error('Error loading categories for search:', err);
  }
}

async function initLandingCategories() {
  const grid = document.getElementById('categoriesGrid');
  if (!grid) return;

  // Set grid class and render a beautiful luxury skeleton loading state
  grid.className = 'cats-grid landing-cats-grid';
  grid.innerHTML = Array(6).fill(`
    <div class="landing-cat-card" style="opacity: 0.7; pointer-events: none;">
      <div class="landing-cat-img-wrap" style="background: linear-gradient(90deg, #f3ede2 25%, #e8dec9 50%, #f3ede2 75%); background-size: 200% 100%; animation: loadingPulse 1.5s infinite;"></div>
      <div class="landing-cat-name" style="background: #eef1f0; height: 16px; margin: 12px auto; width: 60%; border-radius: 4px;"></div>
    </div>
  `).join('');

  try {
    const data = await API.getCategories();
    landingCategories = data.categories || [];
    
    // Filter root/parent categories (where parent is not set)
    const parents = landingCategories.filter(c => !c.parent);
    
    grid.innerHTML = '';
    if (parents.length === 0) {
      grid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: var(--mid); padding: 20px;">No categories found.</p>';
      return;
    }

    parents.forEach((cat, idx) => {
      const card = document.createElement('a');
      card.href = `/products?category=${encodeURIComponent(cat.name)}`;
      card.className = 'landing-cat-card';
      card.title = `Shop ${cat.name}`;
      card.style.animationDelay = `${idx * 0.05}s`;

      const imgUrl = cat.image?.url || '/images/dummy_category.png?v=' + new Date().getTime();

      card.innerHTML = `
        <div class="landing-cat-img-wrap">
          <img src="${imgUrl}" alt="${cat.name}" loading="lazy" onerror="this.src='/images/dummy_category.png?v=fallback'" />
        </div>
        <div class="landing-cat-name">${cat.name}</div>
      `;
      grid.appendChild(card);
    });

    // Add scroll animation observer
    if ('IntersectionObserver' in window) {
      const obs = new IntersectionObserver(entries => {
        entries.forEach(e => {
          if (e.isIntersecting) {
            e.target.classList.add('animate-in');
            obs.unobserve(e.target);
          }
        });
      }, { threshold: 0.1 });
      grid.querySelectorAll('.landing-cat-card').forEach(el => obs.observe(el));
    }

  } catch (err) {
    console.error('Error loading landing categories:', err);
    grid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: var(--mid); padding: 20px;">Could not load categories. Please try again later.</p>';
  }
}

window.quickPriceSearchHome = function() {
  const price = prompt('Enter maximum price (₹) to search products:', '500');
  if (price !== null && price.trim() !== '') {
    const num = parseFloat(price.replace(/[^0-9.]/g, ''));
    if (!isNaN(num) && num > 0) {
      window.location.href = `/products?q=${num}`;
    }
  }
};

function initSearch() {
  const trigger = document.getElementById('searchTrigger');
  const mobileForm = document.getElementById('mobileSearchForm');
  const mobileInput = document.getElementById('mobileSearchInput');
  const suggestionsBox = document.getElementById('mobileSearchSuggestions');

  if (trigger) {
    trigger.addEventListener('click', () => {
      window.location.href = '/products?focusSearch=true';
    });
  }

  if (mobileForm && mobileInput && suggestionsBox) {
    loadLandingCategories(); // Load once for category suggestions

    let searchTimer;
    mobileInput.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase().trim();
      clearTimeout(searchTimer);
      
      if (query.length < 1) {
        suggestionsBox.style.display = 'none';
        return;
      }

      searchTimer = setTimeout(async () => {
        const numValue = parseFloat(query.replace(/[^0-9.]/g, ''));
        const isNumeric = !isNaN(numValue) && numValue > 0;

        // 1. Find category matches (local)
        const catMatches = isNumeric ? [] : landingCategories.filter(c => c.name.toLowerCase().includes(query)).slice(0, 3);
        
        // 2. Fetch product matches (API)
        let productMatches = [];
        try {
          const data = await API.getProducts({ search: query, limit: 5 });
          productMatches = data.products || [];
        } catch (err) {
          console.error('Product search error:', err);
        }

        if (!isNumeric && catMatches.length === 0 && productMatches.length === 0) {
          suggestionsBox.style.display = 'none';
          return;
        }

        let html = '';

        if (isNumeric) {
          html += `
            <div class="suggestion-item" onclick="window.location.href='/products?q=${numValue}'" style="background:#F0FDF4; border-bottom:1px solid #DCFCE7;">
              <div class="suggestion-icon">💰</div>
              <div class="suggestion-content">
                <div class="suggestion-name" style="color:#15803D; font-weight:600;">Search Products Up To ${formatRupees(numValue)}</div>
                <div class="suggestion-type" style="color:#166534;">PRICE SEARCH</div>
              </div>
            </div>
          `;
        }
        
        // Categories Header
        if (catMatches.length > 0) {
          html += catMatches.map(c => `
            <div class="suggestion-item" onclick="window.location.href='/products?category=${encodeURIComponent(c.name)}'">
              <div class="suggestion-icon">🏷️</div>
              <div class="suggestion-content">
                <div class="suggestion-name">${c.name}</div>
                <div class="suggestion-type">${c.parent ? 'SUB-CATEGORY' : 'CATEGORY'}</div>
              </div>
            </div>
          `).join('');
        }

        // Products Header
        if (productMatches.length > 0) {
          html += productMatches.map(p => `
            <div class="suggestion-item" onclick="window.location.href='/product?id=${p._id}'">
              <div class="suggestion-icon">
                <img src="${p.images?.[0]?.url || '/images/placeholder.svg'}" class="suggestion-img" alt="${p.name}" onerror="this.src='/images/placeholder.svg'">
              </div>
              <div class="suggestion-content">
                <div class="suggestion-name">${p.name}</div>
                <div class="suggestion-type">${formatRupees(p.price)}</div>
              </div>
            </div>
          `).join('');
        }

        suggestionsBox.innerHTML = html;
        suggestionsBox.style.display = 'block';
      }, 300);
    });

    // Close suggestions on outside click
    document.addEventListener('click', (e) => {
      if (!mobileInput.contains(e.target) && !suggestionsBox.contains(e.target)) {
        suggestionsBox.style.display = 'none';
      }
    });

    mobileForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const query = mobileInput.value.trim();
      if (query) {
        window.location.href = `/products?q=${encodeURIComponent(query)}`;
      }
    });
  }
}

function initHomeFaq() {
  const form = document.getElementById('homeFaqForm');
  const btn = document.getElementById('homeFaqSubmitBtn');
  if (!form || !btn) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('homeFaqName').value.trim();
    const email = document.getElementById('homeFaqEmail').value.trim();
    const phone = document.getElementById('homeFaqPhone')?.value.trim() || '';
    const query = document.getElementById('homeFaqQuery').value.trim();

    if (!name || !email || !query) {
      showToast('Please fill all required fields', 'error');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Submitting...';

    try {
      const response = await fetch('/api/faqs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name, email, phone, query })
      });
      
      const data = await response.json();
      
      if (data.success) {
        showToast('Query submitted successfully! We will get back to you.', 'success');
        form.reset();
      } else {
        showToast(data.message || 'Failed to submit query', 'error');
      }
    } catch (err) {
      showToast('Network error, please try again', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Submit Message';
    }
  });
}
async function initFestiveSeason() {
  const announcementBar = document.getElementById('announcementBar');
  const festiveSection = document.getElementById('festiveSection');
  const announcementTrack = document.getElementById('announcementTrack');
  const festiveProductsTrack = document.getElementById('festiveProductsTrack');

  if (!announcementBar || !festiveSection) return;

  try {
    const data = await API.getPromotion();

    if (data.success && data.promotion && data.promotion.festiveEnabled) {
      // 1. Setup Announcement Bar
      const messages = data.promotion.saleMessages || [];
      if (messages.length > 0) {
        announcementBar.style.display = 'block';
        
        // Create the content with a separator
        const separator = '<span class="announcement-sep">✦</span>';
        const singleSet = messages.map(msg => `<span>${msg}</span>`).join(separator);
        
        // Repeat the set multiple times to ensure it fills the width of any screen
        // and provides a seamless loop
        const repeatedContent = new Array(10).fill(singleSet + separator).join('');
        announcementTrack.innerHTML = repeatedContent;
      }

      // 2. Setup Festive Products
      const products = data.promotion.festiveProductIds || [];
      if (products.length > 0) {
        festiveSection.style.display = 'block';
        festiveProductsTrack.innerHTML = '';
        products.forEach(p => {
          festiveProductsTrack.appendChild(createFestiveProductCard(p));
        });

        // Carousel controls
        const prevBtn = document.getElementById('festivePrev');
        const nextBtn = document.getElementById('festiveNext');
        
        const getScrollAmt = () => {
          const card = festiveProductsTrack.querySelector('.festive-boutique-card');
          const gap = parseInt(getComputedStyle(festiveProductsTrack).gap) || 0;
          return card ? card.offsetWidth + gap : 350;
        };

        prevBtn?.addEventListener('click', () => {
          festiveProductsTrack.scrollBy({ left: -getScrollAmt(), behavior: 'smooth' });
        });
        nextBtn?.addEventListener('click', () => {
          festiveProductsTrack.scrollBy({ left: getScrollAmt(), behavior: 'smooth' });
        });
      }
    }
  } catch (err) {
    console.error('Festive season init error:', err);
  }
}

function createFestiveProductCard(p) {
  const discount = p.mrp && p.mrp > p.price ? Math.round(((p.mrp - p.price) / p.mrp) * 100) : 0;
  const card = document.createElement('div');
  card.className = 'festive-boutique-card';
  card.innerHTML = `
    <a href="/product?id=${p._id}" class="festive-card-anchor">
      <div class="festive-img-holder">
        <img src="${p.images?.[0]?.url || '/images/placeholder.svg'}" alt="${p.name}" loading="lazy">
        ${discount > 0 ? `<div class="festive-offer-badge">SALE ${discount}% OFF</div>` : ''}
      </div>
      <div class="festive-card-details">
        <span class="festive-meta-cat">${Array.isArray(p.category) ? p.category[0] : (p.category || 'Specialty')}</span>
        <h3 class="festive-product-display-name">${p.name}</h3>
        <div class="festive-price-block">
          <span class="festive-price-current">${formatRupees(p.price)}</span>
          ${p.mrp ? `<span class="festive-price-old">${formatRupees(p.mrp)}</span>` : ''}
        </div>
        <div class="festive-view-action">
          <span>View Collection</span>
          <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
            <path d="M5 12h14M12 5l7 7-7 7"/>
          </svg>
        </div>
      </div>
    </a>
  `;
  return card;
}

function formatRupees(n) {
  return '₹' + Number(n).toLocaleString('en-IN');
}

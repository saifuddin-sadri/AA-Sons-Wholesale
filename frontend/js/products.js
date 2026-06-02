// frontend/js/products.js
document.addEventListener('DOMContentLoaded', () => {
  initNavbar();
  loadCategories();
  readURLParams();
  loadProducts();
  initFilters();
  initMobileFilter();
});

let currentPage = 1;
let totalPages  = 1;
let allProducts = [];
let allCategories = [];
let currentCategoryData = null;
let paginatedPages = [];

function getFilters() {
  const selectedCats = Array.from(document.querySelectorAll('input[name="category"]:checked'))
    .map(cb => cb.value)
    .filter(v => v !== 'all');
  
  const search     = document.getElementById('searchInput')?.value.trim();
  const sort       = document.getElementById('sortSelect')?.value;
  const minPrice   = document.getElementById('minPrice')?.value;
  const maxPrice   = document.getElementById('maxPrice')?.value;
  const featured   = document.getElementById('featuredOnly')?.checked;

  const params = { limit: 99999, sort: sort || '-createdAt' };
  if (selectedCats.length > 0) params.category = selectedCats.join(',');
  if (search)   params.search   = search;
  if (minPrice) params.minPrice = minPrice;
  if (maxPrice) params.maxPrice = maxPrice;
  if (featured) params.featured = true;
  return params;
}

async function loadProducts(reset = true) {
  if (reset) { 
    currentPage = 1; 
  }
  const grid = document.getElementById('productsGrid');

  // Ensure categories are loaded first
  if (allCategories.length === 0) {
    try {
      const data = await API.getCategories();
      allCategories = data.categories || [];
    } catch (e) {
      console.error("Error pre-loading categories in loadProducts:", e);
    }
  }

  if (reset) {
    grid.innerHTML = Array(6).fill('<div class="product-skeleton"></div>').join('');

    try {
      const filters = getFilters();
      
      // Fetch current category data (using the first selected category if multiple)
      const firstCat = filters.category ? filters.category.split(',')[0] : null;
      if (firstCat) {
        const catData = await API.getCategories(); 
        const searchCat = firstCat.toLowerCase().trim();
        currentCategoryData = catData.categories.find(c => 
          c.name.toLowerCase().trim() === searchCat || 
          c._id === firstCat
        );
      } else {
        currentCategoryData = null;
      }

      const data = await API.getProducts(filters);
      allProducts = data.products || [];
      
      preparePaginationPages();
    } catch (err) {
      console.error(err);
      grid.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1">
          <div class="empty-icon">⚠️</div>
          <h3>Couldn't Load Products</h3>
          <p>${err.message}</p>
          <button onclick="loadProducts()" class="btn-outline-gold" style="margin-top:16px">Retry</button>
        </div>`;
      return;
    }
  }

  renderCurrentPage();
}

function getProductGroup(p) {
  const prodCats = (p.category || []).map(cName => cName.trim()).filter(Boolean);
  if (prodCats.length === 0) return "Uncategorized";

  // Find the selected/active parent category in the DOM
  const activeParentCb = document.querySelector('.parent-cat input[name="category"]:checked');
  const activeParentName = activeParentCb ? activeParentCb.value : null;

  let foundSub = null;
  let foundParent = null;

  for (const name of prodCats) {
    const catObj = allCategories.find(c => c.name.toLowerCase().trim() === name.toLowerCase().trim());
    if (catObj) {
      if (catObj.parent) {
        // If there is an active parent category, ensure this subcategory belongs to it!
        if (activeParentName) {
          const parentObj = allCategories.find(c => c.name.toLowerCase().trim() === activeParentName.toLowerCase().trim());
          const isChild = catObj.parent?._id === parentObj?._id || catObj.parent === parentObj?._id || catObj.parent?.name === parentObj?.name;
          if (isChild) {
            foundSub = catObj.name;
          }
        } else {
          // If no active parent category, any subcategory is allowed
          foundSub = catObj.name;
        }
      } else {
        foundParent = catObj.name;
      }
    }
  }

  // If there's an active parent category and this product belongs to that parent category name itself
  if (activeParentName && prodCats.some(name => name.toLowerCase().trim() === activeParentName.toLowerCase().trim())) {
    // If no matching child subcategory was found for this product, group it directly under the parent category name!
    return foundSub || activeParentName;
  }

  return foundSub || foundParent || prodCats[0];
}

function preparePaginationPages() {
  paginatedPages = [];
  for (let i = 0; i < allProducts.length; i += 10) {
    paginatedPages.push([{ name: null, products: allProducts.slice(i, i + 10) }]);
  }
  totalPages = paginatedPages.length || 1;
}

function updateCategoryHeaderDisplay() {
  const headerDiv = document.getElementById('selectedCategoryHeader');
  const titleEl = document.getElementById('activeCategoryTitle');
  const listEl = document.getElementById('activeSubcategoriesList');
  
  if (!headerDiv || !titleEl || !listEl) return;

  const checkedCats = Array.from(document.querySelectorAll('input[name="category"]:checked'))
    .map(cb => cb.value)
    .filter(v => v !== 'all');

  if (checkedCats.length === 0) {
    headerDiv.style.display = 'none';
    return;
  }

  const selectedObjs = allCategories.filter(c => 
    checkedCats.some(val => val.toLowerCase().trim() === c.name.toLowerCase().trim())
  );

  if (selectedObjs.length === 0) {
    headerDiv.style.display = 'none';
    return;
  }

  const parentObjs = selectedObjs.filter(c => !c.parent);
  const subObjs = selectedObjs.filter(c => c.parent);

  let mainTitle = '';
  let subNames = [];

  if (parentObjs.length > 0) {
    mainTitle = parentObjs.map(p => p.name).join(' & ');
    
    // ONLY display subcategories that are ACTUALLY checked/selected by the user
    subObjs.forEach(s => {
      const belongs = parentObjs.some(p => s.parent?._id === p._id || s.parent === p._id || s.parent?.name === p.name);
      if (belongs && !subNames.includes(s.name)) {
        subNames.push(s.name);
      }
    });
  } else if (subObjs.length > 0) {
    const parentsMap = {};
    subObjs.forEach(s => {
      const pName = typeof s.parent === 'object' && s.parent ? s.parent.name : (allCategories.find(c => c._id === s.parent || c._id === s.parent?._id)?.name || 'Category');
      if (!parentsMap[pName]) {
        parentsMap[pName] = [];
      }
      parentsMap[pName].push(s.name);
    });

    const parentNames = Object.keys(parentsMap);
    mainTitle = parentNames.join(' & ');
    
    subObjs.forEach(s => {
      if (!subNames.includes(s.name)) {
        subNames.push(s.name);
      }
    });
  }

  if (!mainTitle) {
    headerDiv.style.display = 'none';
    return;
  }

  titleEl.textContent = mainTitle;
  
  if (subNames.length > 0) {
    listEl.innerHTML = subNames.map(name => `<span class="active-subcategory-tag">${name}</span>`).join('');
    listEl.style.display = 'flex';
  } else {
    listEl.innerHTML = '';
    listEl.style.display = 'none';
  }

  headerDiv.style.display = 'block';
}

function buildCategoryCard(cat) {
  const div = document.createElement('div');
  div.className = 'category-drill-card';
  const imgUrl = cat.image?.url || '/images/dummy_category.png?v=' + new Date().getTime();
  div.innerHTML = `
    <div class="category-drill-img">
      <img src="${imgUrl}" alt="${cat.name}" onerror="this.src='/images/dummy_category.png?v=fallback'"/>
    </div>
    <div class="category-drill-name">${cat.name}</div>
  `;
  div.onclick = () => selectCategorySuggestion(cat.name);
  return div;
}

function renderCurrentPage() {
  const grid = document.getElementById('productsGrid');
  if (!grid) return;

  const filters = getFilters();
  const search = filters.search;
  const isSearchActive = !!search;

  const checkedCats = Array.from(document.querySelectorAll('input[name="category"]:checked'))
    .map(cb => cb.value)
    .filter(v => v !== 'all');

  const activeSubCb = document.querySelector('.sub-cat input[name="category"]:checked');
  const activeSubName = activeSubCb ? activeSubCb.value : null;

  let activeParentName = null;
  const activeParentCb = document.querySelector('.parent-cat input[name="category"]:checked');
  
  if (activeParentCb) {
    activeParentName = activeParentCb.value;
  } else if (activeSubName) {
    const subObj = allCategories.find(c => c.name.toLowerCase().trim() === activeSubName.toLowerCase().trim());
    if (subObj && subObj.parent) {
      const parentObj = allCategories.find(c => c._id === subObj.parent || c._id === subObj.parent?._id);
      if (parentObj) {
        activeParentName = parentObj.name;
      }
    }
  }

  if (!isSearchActive && !filters.minPrice && !filters.maxPrice && !filters.featured) {
    if (checkedCats.length === 0) {
      const toolbar = document.querySelector('.products-toolbar');
      if (toolbar) {
        toolbar.style.display = 'flex';
        const actions = toolbar.querySelector('.toolbar-actions');
        if (actions) actions.style.display = 'none';
      }
      const sidebar = document.getElementById('filterSidebar');
      if (sidebar) sidebar.style.display = 'none';
      document.querySelector('.products-layout').classList.add('drilldown-active');
      grid.innerHTML = '';
      grid.className = 'drilldown-grid';
      
      const parents = allCategories.filter(c => !c.parent);
      parents.forEach(p => grid.appendChild(buildCategoryCard(p)));
      
      document.getElementById('paginationWrap').style.display = 'none';
      updateCategoryHeaderDisplay();
      return;
    }

    if (activeParentName && !activeSubName) {
      const parentObj = allCategories.find(c => c.name.toLowerCase().trim() === activeParentName.toLowerCase().trim());
      const subs = allCategories.filter(c => c.parent?._id === parentObj?._id || c.parent === parentObj?._id || c.parent?.name === parentObj?.name);
      
      if (subs.length > 0) {
        const toolbar = document.querySelector('.products-toolbar');
        if (toolbar) {
          toolbar.style.display = 'flex';
          const actions = toolbar.querySelector('.toolbar-actions');
          if (actions) actions.style.display = 'none';
        }
        const sidebar = document.getElementById('filterSidebar');
        if (sidebar) sidebar.style.display = 'none';
        document.querySelector('.products-layout').classList.add('drilldown-active');
        grid.innerHTML = '';
        grid.className = 'drilldown-grid';
        
        const backBtnContainer = document.createElement('div');
        backBtnContainer.style.gridColumn = '1 / -1';
        backBtnContainer.innerHTML = `
          <button onclick="resetFilters()" class="btn-minimal-back">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            Back to Categories
          </button>
        `;
        grid.appendChild(backBtnContainer);
        
        subs.forEach(s => grid.appendChild(buildCategoryCard(s)));
        
        document.getElementById('paginationWrap').style.display = 'none';
        updateCategoryHeaderDisplay();
        return;
      }
    }
  }

  // Restore sidebar and toolbar
  const sidebar = document.getElementById('filterSidebar');
  if (sidebar && window.innerWidth > 768) {
    sidebar.style.display = 'block';
  }
  document.querySelector('.products-layout').classList.remove('drilldown-active');
  const toolbar = document.querySelector('.products-toolbar');
  if (toolbar) {
    toolbar.style.display = 'flex';
    const actions = toolbar.querySelector('.toolbar-actions');
    if (actions) actions.style.display = 'flex';
  }
  updateCategoryHeaderDisplay();

  const countEl = document.getElementById('resultsCount');
  if (countEl) {
    countEl.textContent = `${allProducts.length} product${allProducts.length !== 1 ? 's' : ''} found`;
  }

  if (!allProducts.length) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <div class="empty-icon">🔍</div>
        <h3>No Products Found</h3>
        <p>Try adjusting your filters or search term</p>
        <button onclick="resetFilters()" class="btn-outline-gold" style="margin-top:16px">Clear Filters</button>
      </div>`;
    document.getElementById('paginationWrap').style.display = 'none';
    return;
  }

  grid.innerHTML = '';
  grid.className = 'products-container-wrapper';

  let topNavHtml = '';
  if (activeSubName && activeParentName) {
    topNavHtml = `
      <div class="drilldown-nav-bar" style="grid-column:1/-1; margin-bottom:20px; display:flex; gap:12px; align-items:center; flex-wrap:wrap;">
        <button onclick="resetFilters()" class="btn-minimal-back" style="margin-bottom:0;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
          All Categories
        </button>
        <span style="color:var(--mid); opacity:0.5;">/</span>
        <button onclick="selectCategorySuggestion('${activeParentName.replace(/'/g,"\\'")}')" class="btn-minimal-back" style="margin-bottom:0;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          Back to ${activeParentName}
        </button>
      </div>`;
  } else if (activeParentName) {
    topNavHtml = `
      <div class="drilldown-nav-bar" style="grid-column:1/-1; margin-bottom:20px; display:flex; gap:12px; align-items:center;">
        <button onclick="resetFilters()" class="btn-minimal-back" style="margin-bottom:0;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
          All Categories
        </button>
      </div>`;
  }
  if (topNavHtml) {
    grid.innerHTML += topNavHtml;
  }

  const pageGroups = paginatedPages[currentPage - 1] || [];

  pageGroups.forEach((group, groupIdx) => {
    const groupContainer = document.createElement('div');
    groupContainer.className = group.name ? 'subcategory-group' : 'all-products-group';

    const prodContainer = document.createElement('div');
    const isTabular = currentCategoryData?.displayType === 'tabular';
    prodContainer.className = isTabular ? 'products-tabular-container' : 'products-grid-main';

    if (group.name) {
      prodContainer.classList.add('subcategory-group-content');
      
      const heading = document.createElement('div');
      heading.className = 'subcategory-group-title toggle-trigger';
      heading.style.cursor = 'pointer';
      heading.innerHTML = `
        <div class="subcategory-title-left">
          <span class="subcategory-title-decorator"></span>
          <span>${group.name}</span>
        </div>
        <span class="subcategory-title-chevron">
          <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" style="transition: transform 0.3s ease; transform: rotate(0deg);"><path d="M19 9l-7 7-7-7"/></svg>
        </span>
      `;
      
      heading.addEventListener('click', () => {
        const isExpanded = prodContainer.classList.toggle('expanded');
        const svg = heading.querySelector('.subcategory-title-chevron svg');
        if (svg) {
          svg.style.transform = isExpanded ? 'rotate(180deg)' : 'rotate(0deg)';
        }
      });
      
      groupContainer.appendChild(heading);
    }

    if (isTabular) {
      const header = document.createElement('div');
      header.className = 'product-table-header';
      header.innerHTML = `
        <div class="th-img">Product</div>
        <div class="th-info">Details</div>
        <div class="th-price">Price</div>
        <div class="th-actions">Action</div>
      `;
      prodContainer.appendChild(header);
    }

    group.products.forEach((p, i) => {
      const element = isTabular ? buildProductRow(p) : buildProductCard(p);
      element.style.animationDelay = `${i * 0.05}s`;
      element.classList.add('animate-in');
      prodContainer.appendChild(element);
    });

    groupContainer.appendChild(prodContainer);
    grid.appendChild(groupContainer);
  });

  if (topNavHtml) {
    const bottomNav = document.createElement('div');
    bottomNav.innerHTML = topNavHtml;
    bottomNav.style.marginTop = '20px';
    grid.appendChild(bottomNav);
  }

  renderPagination();
  updateSEOTags();
}

function renderPagination() {
  const container = document.getElementById('paginationContainer');
  const wrap = document.getElementById('paginationWrap');
  
  if (totalPages <= 1) {
    wrap.style.display = 'none';
    return;
  }
  
  wrap.style.display = 'block';
  container.innerHTML = '';

  // Previous Button
  const prevBtn = document.createElement('button');
  prevBtn.className = `page-btn prev-btn ${currentPage === 1 ? 'disabled' : ''}`;
  prevBtn.innerHTML = '← <span>Previous</span>';
  prevBtn.disabled = currentPage === 1;
  prevBtn.onclick = () => { if (currentPage > 1) { currentPage--; loadProducts(false); window.scrollTo({top: 0, behavior: 'smooth'}); } };
  container.appendChild(prevBtn);

  // Page Numbers
  const isMobile = window.innerWidth <= 480;
  const maxVisible = isMobile ? 3 : 5;
  let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
  let end = Math.min(totalPages, start + maxVisible - 1);
  if (end - start + 1 < maxVisible) start = Math.max(1, end - maxVisible + 1);

  for (let i = start; i <= end; i++) {
    const pageBtn = document.createElement('button');
    pageBtn.className = `page-btn num-btn ${i === currentPage ? 'active' : ''}`;
    pageBtn.textContent = i;
    pageBtn.onclick = () => { if (i !== currentPage) { currentPage = i; loadProducts(false); window.scrollTo({top: 0, behavior: 'smooth'}); } };
    container.appendChild(pageBtn);
  }

  // Next Button
  const nextBtn = document.createElement('button');
  nextBtn.className = `page-btn next-btn ${currentPage === totalPages ? 'disabled' : ''}`;
  nextBtn.innerHTML = '<span>Next</span> →';
  nextBtn.disabled = currentPage === totalPages;
  nextBtn.onclick = () => { if (currentPage < totalPages) { currentPage++; loadProducts(false); window.scrollTo({top: 0, behavior: 'smooth'}); } };
  container.appendChild(nextBtn);
}

function updateSEOTags() {
  const filters = getFilters();
  const selectedCats = filters.category ? filters.category.split(',') : [];
  const search = filters.search;
  
  let title = "Shop Marriage Goods & Bhagwan Poshak | A.A & Sons Indore";
  let description = "Browse our collection of marriage goods, Bhagwan Poshak, and wedding accessories at A.A & Sons Indore. Trusted quality since 1950.";

  if (selectedCats.length > 0) {
    const catName = selectedCats[0];
    title = `Buy ${catName} Online | Marriage Goods Indore — A.A & Sons`;
    description = `Explore our premium collection of ${catName}. High-quality products from A.A & Sons, Indore's most trusted shop since 1950. Home delivery available.`;
  } else if (search) {
    title = `Search results for "${search}" | A.A & Sons Indore`;
    description = `Searching for ${search}? Find the best quality marriage goods and devotional wear at A.A & Sons.`;
  }

  document.title = title;
  const metaDesc = document.querySelector('meta[name="description"]');
  if (metaDesc) metaDesc.setAttribute('content', description);
  
  // Update OG tags
  const ogTitle = document.querySelector('meta[property="og:title"]');
  if (ogTitle) ogTitle.setAttribute('content', title);
  const ogDesc = document.querySelector('meta[property="og:description"]');
  if (ogDesc) ogDesc.setAttribute('content', description);
  
  // Update Twitter tags
  const twTitle = document.querySelector('meta[name="twitter:title"]');
  if (twTitle) twTitle.setAttribute('content', title);
  const twDesc = document.querySelector('meta[name="twitter:description"]');
  if (twDesc) twDesc.setAttribute('content', description);
}

async function loadCategories() {
  try {
    const data = await API.getCategories();
    allCategories = data.categories || [];
    const container = document.getElementById('categoryFilters');
    container.innerHTML = '';

    // Add 'All Categories'
    const allLabel = document.createElement('label');
    allLabel.className = 'filter-option';
    allLabel.innerHTML = `<input type="checkbox" name="category" value="all" id="cat-all" checked/> <span>All Categories</span>`;
    container.appendChild(allLabel);

    const parents = allCategories.filter(c => !c.parent);
    const children = allCategories.filter(c => c.parent);

    parents.forEach(p => {
      const pWrap = document.createElement('div');
      pWrap.className = 'filter-group-wrap';
      pWrap.innerHTML = `
        <div class="filter-group-header">
          <label class="filter-option parent-cat">
            <input type="checkbox" name="category" value="${p.name}"/>
            <span>${p.name}</span>
          </label>
          ${children.some(c => c.parent?._id === p._id || c.parent === p._id) ? '<span class="toggle-subs" style="transition: transform 0.3s ease;">▾</span>' : ''}
        </div>
        <div class="sub-categories-wrap" id="subs-${p._id}" style="display:none; padding-left:20px; margin: 4px 0 8px 0; border-left: 1px solid var(--gold-light);">
        </div>
      `;
      container.appendChild(pWrap);

      const subContainer = pWrap.querySelector('.sub-categories-wrap');
      const subCats = children.filter(c => c.parent?._id === p._id || c.parent === p._id);
      
      subCats.forEach(s => {
        const sLabel = document.createElement('label');
        sLabel.className = 'filter-option sub-cat';
        sLabel.innerHTML = `
          <input type="checkbox" name="category" value="${s.name}"/>
          <span>${s.name}</span>
        `;
        subContainer.appendChild(sLabel);
      });

      const toggleBtn = pWrap.querySelector('.toggle-subs');
      if (toggleBtn) {
        toggleBtn.onclick = (e) => {
          e.stopPropagation();
          const isVisible = subContainer.style.display === 'block';
          subContainer.style.display = isVisible ? 'none' : 'block';
          toggleBtn.style.transform = isVisible ? 'rotate(0deg)' : 'rotate(180deg)';
        };
      }
    });

    const allCheck = document.getElementById('cat-all');
    const parentChecks = container.querySelectorAll('.parent-cat input[name="category"]');
    const subChecks = container.querySelectorAll('.sub-cat input[name="category"]');

    // Helper to uncheck all except specified parent's subs
    function clearOtherParents(activeParentId) {
      parents.forEach(p => {
        if (p._id !== activeParentId) {
          const pCb = container.querySelector(`.parent-cat input[value="${p.name}"]`);
          if (pCb) pCb.checked = false;

          const subWrap = document.getElementById(`subs-${p._id}`);
          if (subWrap) {
            subWrap.style.display = 'none';
            subWrap.querySelectorAll('input[name="category"]').forEach(cb => cb.checked = false);
          }
          
          const toggle = pCb?.closest('.filter-group-wrap')?.querySelector('.toggle-subs');
          if (toggle) toggle.style.transform = 'rotate(0deg)';
        }
      });
    }

    allCheck.addEventListener('change', (e) => {
      if (e.target.checked) {
        parentChecks.forEach(c => c.checked = false);
        subChecks.forEach(c => c.checked = false);
        parents.forEach(p => {
          const subWrap = document.getElementById(`subs-${p._id}`);
          if (subWrap) subWrap.style.display = 'none';
          const toggle = container.querySelector(`.parent-cat input[value="${p.name}"]`)?.closest('.filter-group-wrap')?.querySelector('.toggle-subs');
          if (toggle) toggle.style.transform = 'rotate(0deg)';
        });
        loadProducts();
      }
    });

    parents.forEach(p => {
      const pCb = container.querySelector(`.parent-cat input[value="${p.name}"]`);
      if (!pCb) return;

      pCb.addEventListener('change', (e) => {
        if (e.target.checked) {
          allCheck.checked = false;
          clearOtherParents(p._id);
          const subWrap = document.getElementById(`subs-${p._id}`);
          if (subWrap) subWrap.style.display = 'block';
          const toggle = pCb.closest('.filter-group-wrap')?.querySelector('.toggle-subs');
          if (toggle) toggle.style.transform = 'rotate(180deg)';
        } else {
          const subWrap = document.getElementById(`subs-${p._id}`);
          if (subWrap) {
            subWrap.style.display = 'none';
            subWrap.querySelectorAll('input[name="category"]').forEach(cb => cb.checked = false);
          }
          const toggle = pCb.closest('.filter-group-wrap')?.querySelector('.toggle-subs');
          if (toggle) toggle.style.transform = 'rotate(0deg)';

          const anyChecked = Array.from(container.querySelectorAll('input[name="category"]:not(#cat-all)')).some(cb => cb.checked);
          if (!anyChecked) {
            allCheck.checked = true;
          }
        }
        loadProducts();
      });
    });

    parents.forEach(p => {
      const subWrap = document.getElementById(`subs-${p._id}`);
      if (!subWrap) return;

      const sCbs = subWrap.querySelectorAll('input[name="category"]');
      sCbs.forEach(sCb => {
        sCb.addEventListener('change', (e) => {
          if (e.target.checked) {
            allCheck.checked = false;
            clearOtherParents(p._id);
            const pCb = container.querySelector(`.parent-cat input[value="${p.name}"]`);
            if (pCb) pCb.checked = true;
            
            subWrap.style.display = 'block';
            const toggle = pCb?.closest('.filter-group-wrap')?.querySelector('.toggle-subs');
            if (toggle) toggle.style.transform = 'rotate(180deg)';
          } else {
            const anySubChecked = Array.from(sCbs).some(cb => cb.checked);
            if (!anySubChecked) {
              const pCb = container.querySelector(`.parent-cat input[value="${p.name}"]`);
              if (pCb) pCb.checked = false;
              subWrap.style.display = 'none';
              const toggle = pCb?.closest('.filter-group-wrap')?.querySelector('.toggle-subs');
              if (toggle) toggle.style.transform = 'rotate(0deg)';
            }
            
            const anyChecked = Array.from(container.querySelectorAll('input[name="category"]:not(#cat-all)')).some(cb => cb.checked);
            if (!anyChecked) {
              allCheck.checked = true;
            }
          }
          loadProducts();
        });
      });
    });

    document.dispatchEvent(new Event('categoriesLoaded'));
  } catch (err) {
    console.error('Error loading categories:', err);
  }
}

function readURLParams() {
  const params = new URLSearchParams(window.location.search);
  const cat = params.get('category');
  const q   = params.get('q');

  let needsReload = false;

  if (cat) {
    // Map landing page category names to actual shop category names if different
    const CATEGORY_MAP = {
      'Poojan Items': 'POOJAN ITEMS',
      'Toran and decoration': 'TORAN AND DECORATION',
      'Bhagwan shringar': 'BHAGWAN SHRINGAAR'
    };

    const targetCat = (CATEGORY_MAP[cat] || cat).toLowerCase().trim();

    // Will be set after categories load
    document.addEventListener('categoriesLoaded', () => {
      const checkboxes = document.querySelectorAll('input[name="category"]');
      let foundCheckbox = null;

      for (const cb of checkboxes) {
        if (cb.value.toLowerCase().trim() === targetCat) {
          foundCheckbox = cb;
          break;
        }
      }

      if (foundCheckbox) {
        foundCheckbox.checked = true;
        // Uncheck "All" if it was checked
        const allCat = document.getElementById('cat-all');
        if (allCat) allCat.checked = false;

        // Ensure parent accordion is open if it's a sub-category
        const parentDiv = foundCheckbox.closest('.filter-group-wrap');
        if (parentDiv) {
          const subWrap = parentDiv.querySelector('.sub-categories-wrap');
          if (subWrap) subWrap.style.display = 'block';
        }

        loadProducts(); // Reload now that the filter is set
      }
    });
  }
  if (q) {
    const si = document.getElementById('searchInput');
    if (si) {
      si.value = q;
      needsReload = true;
    }
  }
  
  if (needsReload) {
    loadProducts();
  }

  if (params.get('focusSearch') === 'true') {
    setTimeout(() => {
      const si = document.getElementById('searchInput');
      if (si) {
        si.focus();
        if (window.innerWidth <= 768) {
          si.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    }, 600);
  }
}

function initFilters() {
  let searchTimer;
  const searchInput = document.getElementById('searchInput');
  const suggestionsBox = document.getElementById('searchSuggestions');

  searchInput?.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();
    clearTimeout(searchTimer);
    
    // Suggestion logic
    if (query.length >= 2) {
      searchTimer = setTimeout(async () => {
        // 1. Category matches
        const catMatches = allCategories.filter(c => c.name.toLowerCase().includes(query)).slice(0, 3);
        
        // 2. Product matches
        let productMatches = [];
        try {
          const data = await API.getProducts({ search: query, limit: 5 });
          productMatches = data.products || [];
        } catch (err) {
          console.error('Product search error:', err);
        }

        if (catMatches.length === 0 && productMatches.length === 0) {
          suggestionsBox.style.display = 'none';
          loadProducts(); // Still filter the grid
          return;
        }

        let html = '';
        
        // Render Categories
        if (catMatches.length > 0) {
          html += catMatches.map(c => `
            <div class="suggestion-item" onclick="selectCategorySuggestion('${c.name}')">
              <div class="suggestion-icon">🏷️</div>
              <div class="suggestion-content">
                <span class="suggestion-name">${c.name}</span>
                <span class="suggestion-type">${c.parent ? 'SUB-CATEGORY' : 'CATEGORY'}</span>
              </div>
            </div>
          `).join('');
        }

        // Render Products
        if (productMatches.length > 0) {
          html += productMatches.map(p => `
            <div class="suggestion-item" onclick="window.location.href='/product?id=${p._id}'">
              <div class="suggestion-icon">
                <img src="${p.images?.[0]?.url || '/images/placeholder.svg'}" class="suggestion-img" alt="${p.name}" onerror="this.src='/images/placeholder.svg'">
              </div>
              <div class="suggestion-content">
                <span class="suggestion-name">${p.name}</span>
                <span class="suggestion-type">${formatRupees(p.price)}</span>
              </div>
            </div>
          `).join('');
        }

        suggestionsBox.innerHTML = html;
        suggestionsBox.style.display = 'block';
        loadProducts(); // Filter the grid too
      }, 300);
    } else {
      suggestionsBox.style.display = 'none';
      searchTimer = setTimeout(() => loadProducts(), 400);
    }
  });

  // Close suggestions on outside click
  document.addEventListener('click', (e) => {
    if (!searchInput?.contains(e.target) && !suggestionsBox?.contains(e.target)) {
      suggestionsBox.style.display = 'none';
    }
  });

  document.getElementById('sortSelect')?.addEventListener('change', () => loadProducts());
  document.getElementById('featuredOnly')?.addEventListener('change', () => loadProducts());
  document.getElementById('applyPrice')?.addEventListener('click', () => loadProducts());
  document.getElementById('clearFilters')?.addEventListener('click', resetFilters);
}

function resetFilters() {
  document.querySelectorAll('input[name="category"]').forEach(c => c.checked = false);
  const allCat = document.getElementById('cat-all');
  if (allCat) allCat.checked = true;
  document.getElementById('searchInput').value = '';
  document.getElementById('minPrice').value = '';
  document.getElementById('maxPrice').value = '';
  document.getElementById('featuredOnly').checked = false;
  document.getElementById('sortSelect').value = '-createdAt';
  loadProducts();
}

function selectCategorySuggestion(categoryName) {
  // Uncheck all category checkboxes first
  document.querySelectorAll('input[name="category"]').forEach(cb => {
    cb.checked = false;
  });

  const checkbox = document.querySelector(`input[name="category"][value="${categoryName}"]`);
  if (checkbox) {
    checkbox.checked = true;
    
    // Ensure parent accordion is open
    const parentDiv = checkbox.closest('.filter-group-wrap');
    if (parentDiv) {
      const subWrap = parentDiv.querySelector('.sub-categories-wrap');
      if (subWrap) subWrap.style.display = 'block';
    }
  }
  
  // Clear search input and hide suggestions
  document.getElementById('searchInput').value = '';
  document.getElementById('searchSuggestions').style.display = 'none';
  
  // Reload products with the new category filter
  loadProducts();
}

function initMobileFilter() {
  const toggleWrap = document.getElementById('filterToggleWrap');
  const toggleBtn  = document.getElementById('filterToggleBtn');
  const sidebar    = document.getElementById('filterSidebar');
  const backdrop   = document.getElementById('filterBackdrop');

  const isMobile = () => window.innerWidth <= 768;
  const update = () => { if (toggleWrap) toggleWrap.style.display = isMobile() ? 'block' : 'none'; };
  update();
  window.addEventListener('resize', update);

  toggleBtn?.addEventListener('click', () => {
    sidebar.classList.toggle('open');
    backdrop.classList.toggle('open');
  });
  backdrop?.addEventListener('click', () => {
    sidebar.classList.remove('open');
    backdrop.classList.remove('open');
  });
}

function initNavbar() {
  const navbar    = document.getElementById('navbar');
  const hamburger = document.getElementById('hamburger');
  const navLinks  = document.getElementById('navLinks');
  window.addEventListener('scroll', () => navbar?.classList.toggle('scrolled', window.scrollY > 40));
  hamburger?.addEventListener('click', () => {
    hamburger.classList.toggle('open');
    navLinks.classList.toggle('open');
  });
}

function buildProductRow(product) {
  const div = document.createElement('div');
  div.className = 'product-row';

  const img = product.images?.[0]?.url || '';
  const detailUrl = `/product?id=${product._id}`;
  const unit = product.unit || 'pcs';

  div.innerHTML = `
    <div class="product-row-img" onclick="window.location.href='${detailUrl}'">
      ${img ? `<img src="${img}" alt="${product.name}" loading="lazy"/>` : '🛍️'}
    </div>
    <div class="product-row-info">
      <a href="${detailUrl}" class="product-row-name">${product.name}</a>
      <p class="product-row-desc">${product.description || ''}</p>
    </div>
    <div class="product-row-price-wrap">
      <span class="product-row-price">${formatRupees(product.price * (product.minQuantity || 1))}</span>
      ${product.minQuantity > 1 ? `<div style="font-size: 0.65rem; color: var(--mid); font-weight: 400; margin-top: 2px;">${formatRupees(product.price)} / ${unit}</div>` : ''}
    </div>
    <div class="product-row-actions">
      <div class="qty-controls">
        <button class="qty-btn qty-dec">−</button>
        <input type="number" class="qty-val" value="${product.minQuantity || 1}" min="${product.minQuantity || 1}" />
        <button class="qty-btn qty-inc">+</button>
      </div>
      <button class="btn-add-cart">
        <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>
        <span>Add</span>
      </button>
    </div>
  `;

  // Qty Logic & Add to Cart (Same as buildProductCard but compact)
  setupProductActions(div, product);

  return div;
}

// Helper to setup common product actions
function setupProductActions(div, product) {
  const minQty = parseInt(product.minQuantity) || 1;
  let qty = minQty;
  const qtyVal = div.querySelector('.qty-val');
  const maxQty = product.stock !== undefined ? product.stock : 999;
  
  if (qtyVal) {
    qtyVal.value = qty;
    qtyVal.min = minQty;
  }
  
  const priceDisplay = div.querySelector('.product-price') || div.querySelector('.product-row-price');
  const originalPrice = product.price;

  const updatePrice = () => {
    if (priceDisplay) {
      priceDisplay.textContent = formatRupees(originalPrice * qty);
    }
  };

  updatePrice();

  qtyVal?.addEventListener('input', (e) => {
    // Allow free typing — don't override field while the user is still entering digits
    const parsed = parseInt(e.target.value);
    if (!isNaN(parsed) && parsed > 0) {
      qty = parsed;
      updatePrice();
    }
  });

  qtyVal?.addEventListener('blur', (e) => {
    let finalVal = parseInt(e.target.value);

    if (isNaN(finalVal) || finalVal < 1) {
      showToast(`Minimum order quantity is ${minQty}`, 'warning');
      finalVal = minQty;
    } else if (finalVal < minQty) {
      showToast(`Minimum order quantity is ${minQty}. Setting to ${minQty}.`, 'warning');
      finalVal = minQty;
    } else if (finalVal > maxQty) {
      showToast(`Only ${maxQty} units left in stock!`, 'error');
      finalVal = maxQty;
    }

    qty = finalVal;
    e.target.value = finalVal;
    updatePrice();
  });

  div.querySelector('.qty-dec')?.addEventListener('click', () => { 
    if (qty > minQty) { 
      qty--; 
      qtyVal.value = qty; 
      updatePrice();
    } else if (minQty > 1) {
      showToast(`Minimum order quantity is ${minQty}`, 'warning');
    }
  });
  div.querySelector('.qty-inc')?.addEventListener('click', () => { 
    if (qty < maxQty) { 
      qty++; 
      qtyVal.value = qty; 
      updatePrice();
    } 
    else { showToast(`Only ${maxQty} units left!`, 'error'); }
  });

  div.querySelector('.btn-add-cart')?.addEventListener('click', () => {
    Cart.add(product, qty);
    showToast(`Added ${qty} item(s) to cart`, 'success');
    const btn = div.querySelector('.btn-add-cart');
    const original = btn.innerHTML;
    btn.innerHTML = '✓';
    btn.style.background = 'var(--teal)';
    btn.style.color = 'white';
    setTimeout(() => { btn.innerHTML = original; btn.style.background = ''; btn.style.color = ''; }, 1500);
  });
}

function buildProductCard(product) {
  const div = document.createElement('div');
  div.className = 'product-card';
  // ... (rest of existing card logic remains)

  const img        = product.images?.[0]?.url || '';
  const discount   = product.mrp && product.mrp > product.price
    ? Math.round((1 - product.price / product.mrp) * 100) : 0;
  const detailUrl  = `/product?id=${product._id}`;

  div.innerHTML = `
    <div class="product-img-wrap" tabindex="0" role="button" aria-label="View ${product.name} details">
      ${img
        ? `<img src="${img}" alt="${product.name} — Marriage Goods & Bhagwan Poshak Indore" loading="lazy"/>`
        : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:3rem;background:var(--cream)">🛍️</div>`}
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
          const cats = Array.isArray(product.category) ? product.category : (product.category ? [product.category] : []);
          if (cats.length === 0) return 'UNASSIGNED';
          let html = cats.slice(0, 2).map(c => `<div class="cat-line">${c}</div>`).join('');
          if (cats.length > 2) html += '<div class="cat-line">...</div>';
          return html;
        })()}
      </div>
      <a href="${detailUrl}" class="product-name product-name-link">${product.name}</a>
      ${product.recentSales > 0 ? `<div class="product-recent-sales">🔥 ${product.recentSales} sold in last 24h</div>` : ''}
      <div class="product-price-row">
        <span class="product-price">${formatRupees(product.price * (product.minQuantity || 1))}</span>
        ${product.mrp > product.price ? `<span class="product-mrp">${formatRupees(product.mrp * (product.minQuantity || 1))}</span>` : ''}
        ${discount > 0 ? `<span class="product-discount">-${discount}%</span>` : ''}
      </div>
      <div class="qty-controls" style="margin:12px 0">
        <button class="qty-btn qty-dec">−</button>
        <input type="number" class="qty-val" value="${product.minQuantity || 1}" min="${product.minQuantity || 1}" />
        <button class="qty-btn qty-inc">+</button>
      </div>
      <div class="product-card-actions">
        <a href="${detailUrl}" class="btn-view-details">
          <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          View
        </a>
        <button class="btn-add-cart">
          <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg> Add to Cart
        </button>
      </div>
    </div>`;

  // Image area click → open product detail in same tab
  const imgWrap = div.querySelector('.product-img-wrap');
  imgWrap.style.cursor = 'pointer';
  imgWrap.addEventListener('click', () => window.location.href = detailUrl);
  imgWrap.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') window.location.href = detailUrl; });

  // Qty controls
  setupProductActions(div, product);

  return div;
}
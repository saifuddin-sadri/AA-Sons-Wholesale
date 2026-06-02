// frontend/js/product-detail.js
document.addEventListener('DOMContentLoaded', () => {
  initNavbar();
  loadProduct();
});

let product = null;
let currentImageIndex = 0;
let qty = 1;
let currentVariation = null;
let currentSelectedColor = null;
let currentSelectedSize = null;
let selectedBulkTier = null;
let availableColors = [];
let availableSizes = [];

function initNavbar() {
  const navbar = document.getElementById('navbar');
  const hamburger = document.getElementById('hamburger');
  const navLinks = document.getElementById('navLinks');
  window.addEventListener('scroll', () => navbar?.classList.toggle('scrolled', window.scrollY > 40));
  hamburger?.addEventListener('click', () => {
    hamburger.classList.toggle('open');
    navLinks.classList.toggle('open');
  });
}

async function loadProduct() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');

  if (!id) {
    showError('No product ID provided.');
    return;
  }

  try {
    const data = await API.getProduct(id);
    product = data.product;

    if (!product) {
      showError('Product not found.');
      return;
    }

    renderProduct();
  } catch (err) {
    console.error(err);
    showError(err.message || 'Failed to load product.');
  }
}

function renderProduct() {
  // Hide skeleton, show content
  document.getElementById('pdSkeleton').style.display = 'none';
  document.getElementById('pdContent').style.display = '';

  // Update page title
  document.title = `${product.name} — A.A & Sons`;

  // Breadcrumb
  document.getElementById('breadcrumbName').textContent = product.name;

  // Category
  document.getElementById('pdCategory').textContent = Array.isArray(product.category) ? product.category.join(', ') : product.category;

  // Title
  document.getElementById('pdTitle').textContent = product.name;

  // Recent Sales
  const recentSalesEl = document.getElementById('pdRecentSales');
  if (product.recentSales > 0) {
    recentSalesEl.style.display = 'flex';
    recentSalesEl.innerHTML = `🔥 ${product.recentSales} sold in last 24h`;
  } else {
    recentSalesEl.style.display = 'none';
  }

  // Ratings
  if (product.ratings && product.ratings.average > 0) {
    document.getElementById('pdRatings').style.display = 'flex';
    const starsContainer = document.getElementById('pdStars');
    const avg = product.ratings.average;
    let starsHTML = '';
    for (let i = 1; i <= 5; i++) {
      if (i <= Math.floor(avg)) {
        starsHTML += '<span class="pd-star filled">★</span>';
      } else if (i - avg < 1 && i - avg > 0) {
        starsHTML += '<span class="pd-star half">★</span>';
      } else {
        starsHTML += '<span class="pd-star">★</span>';
      }
    }
    starsContainer.innerHTML = starsHTML;
    document.getElementById('pdRatingText').textContent =
      `${avg.toFixed(1)} (${product.ratings.count} review${product.ratings.count !== 1 ? 's' : ''})`;
  }

  // Wait to initialize price based on variations
  // Stock status (hidden)
  const stockEl = document.getElementById('pdStock');
  if (stockEl) stockEl.style.display = 'none';

  // Description with Markdown support
  const descEl = document.getElementById('pdDescription');
  if (descEl) {
    descEl.innerHTML = parseMarkdown(product.description || '');
  }

function parseMarkdown(text) {
  if (!text) return '';
  let html = text
    // Headings
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    // Bold
    .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
    // Italic
    .replace(/\*(.*?)\*/g, '<i>$1</i>')
    // Bullets (simple approach)
    .replace(/^\* (.*$)/gim, '<li>$1</li>')
    // Newlines
    .replace(/\n/g, '<br/>');

  // Wrap <li> in <ul> if present
  if (html.includes('<li>')) {
    // This is a very simple parser, might need improvement for complex lists
    // But for basic bullets it works.
  }
  return html;
}

  // Tags
  if (product.tags && product.tags.length > 0) {
    document.getElementById('pdTags').style.display = 'block';
    const tagsList = document.getElementById('pdTagsList');
    tagsList.innerHTML = product.tags.map(t => `<span class="pd-tag">${t}</span>`).join('');
  }

  // Meta category
  document.getElementById('pdMetaCat').textContent = Array.isArray(product.category) ? product.category.join(', ') : product.category;

  // Images
  renderGallery();

  // Quantity controls
  qty = parseInt(product.minQuantity) || 1;
  const qtyInput = document.getElementById('pdQtyVal');
  if (qtyInput) {
    qtyInput.value = qty;
    qtyInput.min = qty;
  }
  initQtyControls();

  // Add to cart
  initAddToCart();

  // Lightbox
  initLightbox();

  // Related products
  loadRelatedProducts();

  // Variations & Initial Price Call
  console.log('📦 Rendering product:', product.name, 'Bulk Prices:', product.bulkPrices);
  initVariations();
  initBulkPrices();
  initShareButtons(product);
  initBulkEnquiry();
  updateSEOTags();
}

function updateSEOTags() {
  const currentUrl = window.location.href;
  const productName = product.name;
  const allImages = product.images ? product.images.map(img => img.url) : [];
  const productImage = allImages.length > 0 ? allImages[0] : 'https://aasonsretail.in/logo.png';

  // ── Keyword-rich title & description
  const categoryText = Array.isArray(product.category) ? product.category.join(' & ') : product.category;
  const richTitle = `${productName} | ${categoryText} — A.A & Sons Indore`;
  document.title = richTitle;
  const titleEl = document.getElementById('pageTitle');
  if (titleEl) titleEl.textContent = richTitle;

  const shortDesc = product.description.length > 130
    ? product.description.substring(0, 130) + '...'
    : product.description;
  const richDesc = `Buy ${productName} at A.A & Sons, Indore. ${shortDesc} Quality assured. Trusted since 1950.`;
  const metaDescEl = document.querySelector('meta[name="description"]') || document.getElementById('pageDesc');
  if (metaDescEl) metaDescEl.setAttribute('content', richDesc.substring(0, 160));

  // ── Canonical
  const canonical = document.getElementById('canonicalTag');
  if (canonical) canonical.setAttribute('href', currentUrl);

  // ── OG Tags
  const ogUrl   = document.getElementById('ogUrl');
  const ogTitle  = document.getElementById('ogTitle');
  const ogDesc   = document.getElementById('ogDesc');
  const ogImage  = document.getElementById('ogImage');
  const ogImgAlt = document.getElementById('ogImageAlt');
  if (ogUrl)    ogUrl.setAttribute('content', currentUrl);
  if (ogTitle)  ogTitle.setAttribute('content', `${productName} — A.A & Sons`);
  if (ogDesc)   ogDesc.setAttribute('content', richDesc.substring(0, 200));
  if (ogImage)  ogImage.setAttribute('content', productImage);
  if (ogImgAlt) ogImgAlt.setAttribute('content', `${productName} — A.A & Sons Indore`);

  // ── Twitter Tags
  const twUrl   = document.getElementById('twUrl');
  const twTitle  = document.getElementById('twTitle');
  const twDesc   = document.getElementById('twDesc');
  const twImage  = document.getElementById('twImage');
  if (twUrl)   twUrl.setAttribute('content', currentUrl);
  if (twTitle) twTitle.setAttribute('content', `${productName} — A.A & Sons`);
  if (twDesc)  twDesc.setAttribute('content', richDesc.substring(0, 200));
  if (twImage) twImage.setAttribute('content', productImage);

  // ── Rich Product JSON-LD Schema
  const schemaEl = document.getElementById('productSchema');
  if (schemaEl) {
    const priceValidDate = new Date();
    priceValidDate.setFullYear(priceValidDate.getFullYear() + 1);

    const schema = {
      "@context": "https://schema.org/",
      "@type": "Product",
      "name": productName,
      "image": allImages,
      "description": product.description,
      "sku": product._id,
      "mpn": product._id,
      "category": Array.isArray(product.category) ? product.category.join(', ') : product.category,
      "brand": { "@type": "Brand", "name": "A.A & Sons" },
      "seller": {
        "@type": "Organization",
        "name": "A.A & Sons",
        "url": "https://aasonsretail.in/",
        "telephone": "+918827478757",
        "address": {
          "@type": "PostalAddress",
          "streetAddress": "Shop no: 06, Marothiya Bazar near Bajaj Khana Chowk",
          "addressLocality": "Indore",
          "addressRegion": "Madhya Pradesh",
          "postalCode": "452007",
          "addressCountry": "IN"
        }
      },
      "offers": {
        "@type": "Offer",
        "url": currentUrl,
        "priceCurrency": "INR",
        "price": product.price,
        "priceValidUntil": priceValidDate.toISOString().split('T')[0],
        "availability": (product.stock === undefined || product.stock > 0)
          ? "https://schema.org/InStock"
          : "https://schema.org/OutOfStock",
        "itemCondition": "https://schema.org/NewCondition",
        "seller": { "@type": "Organization", "name": "A.A & Sons" },
        "shippingDetails": {
          "@type": "OfferShippingDetails",
          "shippingDestination": {
            "@type": "DefinedRegion",
            "addressCountry": "IN"
          },
          "deliveryTime": {
            "@type": "ShippingDeliveryTime",
            "handlingTime": { "@type": "QuantitativeValue", "minValue": 1, "maxValue": 2, "unitCode": "DAY" },
            "transitTime":  { "@type": "QuantitativeValue", "minValue": 3, "maxValue": 7, "unitCode": "DAY" }
          }
        },
        "hasMerchantReturnPolicy": {
          "@type": "MerchantReturnPolicy",
          "applicableCountry": "IN",
          "returnPolicyCategory": "https://schema.org/MerchantReturnFiniteReturnWindow",
          "merchantReturnDays": 2,
          "returnMethod": "https://schema.org/ReturnByMail"
        }
      }
    };

    if (product.ratings && product.ratings.average > 0) {
      schema.aggregateRating = {
        "@type": "AggregateRating",
        "ratingValue": product.ratings.average,
        "reviewCount": product.ratings.count
      };
    }
    
    schemaEl.textContent = JSON.stringify(schema);
  }
}

function initBulkEnquiry() {
  const modal = document.getElementById('bulkModal');
  const btn = document.getElementById('pdBulkEnquiry');
  const closeBtn = document.getElementById('closeBulkModal');
  const form = document.getElementById('bulkEnquiryForm');
  
  if (!btn || !modal) return;

  btn.addEventListener('click', async () => {
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
    await loadBulkProducts();
  });

  closeBtn.addEventListener('click', () => {
    modal.classList.remove('open');
    document.body.style.overflow = '';
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.remove('open');
      document.body.style.overflow = '';
    }
  });

  // Multi-select logic
  const trigger = document.getElementById('productSelectTrigger');
  const dropdown = document.getElementById('productSelectDropdown');
  const searchInput = document.getElementById('productSearch');
  
  trigger?.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('open');
  });

  document.addEventListener('click', (e) => {
    if (!dropdown?.contains(e.target) && !trigger?.contains(e.target)) {
      dropdown?.classList.remove('open');
    }
  });

  searchInput?.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const options = document.querySelectorAll('.multi-select-option');
    options.forEach(opt => {
      const name = opt.textContent.toLowerCase();
      opt.style.display = name.includes(term) ? 'flex' : 'none';
    });
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById('submitBulkEnquiry');
    submitBtn.disabled = true;
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Submitting...';

    const selected = Array.from(document.querySelectorAll('.multi-select-option input:checked'))
      .map(cb => cb.value);

    if (selected.length === 0) {
      showToast('Please select at least one product', 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
      return;
    }

    const formData = {
      name: document.getElementById('bulkName').value,
      contactNumber: document.getElementById('bulkContact').value,
      email: document.getElementById('bulkEmail').value,
      selectedProducts: selected,
      message: document.getElementById('bulkMessage').value
    };

    try {
      const data = await API.submitBulkEnquiry(formData);
      showToast(data.message || 'Your enquiry has been submitted. Our team will contact you shortly.', 'success');
      form.reset();
      modal.classList.remove('open');
      document.body.style.overflow = '';
    } catch (err) {
      showToast(err.message || 'Error submitting enquiry', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
    }
  });
}

async function loadBulkProducts() {
  const container = document.getElementById('productOptionsList');
  const countSpan = document.getElementById('selectedProductsCount');
  if (!container || container.children.length > 0) return; // Only load once

  try {
    const data = await API.getProducts({ limit: 100 });
    const products = data.products || [];
    
    container.innerHTML = products.map(p => `
      <label class="multi-select-option">
        <input type="checkbox" value="${p.name}" ${p._id === product._id ? 'checked' : ''}>
        <span>${p.name}</span>
      </label>
    `).join('');

    const updateCount = () => {
      const checked = container.querySelectorAll('input:checked').length;
      countSpan.textContent = checked > 0 ? `${checked} product(s) selected` : 'Select products...';
    };

    container.querySelectorAll('input').forEach(cb => {
      cb.addEventListener('change', updateCount);
    });

    updateCount();
  } catch (err) {
    console.error('Failed to load products for multi-select', err);
  }
}


function initVariations() {
  const varsSection = document.getElementById('pdVariations');
  const hasColors = product.colors && product.colors.length > 0;
  const hasSizes = product.variations && product.variations.length > 0;

  if (!hasColors && !hasSizes) {
    if(varsSection) varsSection.style.display = 'none';
    updatePriceDisplay(product.price, product.mrp);
    return;
  }
  
  if(varsSection) varsSection.style.display = 'block';

  const colorBlock = document.getElementById('pdColorBlock');
  const sizeBlock = document.getElementById('pdSizeBlock');

  // Colors
  if (hasColors) {
    availableColors = product.colors;
    colorBlock.style.display = 'block';
    currentSelectedColor = availableColors[0];
    renderColorOptions();
  } else {
    colorBlock.style.display = 'none';
    availableColors = [];
    currentSelectedColor = null;
  }

  // Sizes based on variations
  if (hasSizes) {
    availableSizes = product.variations.map(v => v.size).filter(Boolean);
    sizeBlock.style.display = 'block';
    currentSelectedSize = availableSizes[0] || null;
    renderSizeOptions();
  } else {
    sizeBlock.style.display = 'none';
    availableSizes = [];
    currentSelectedSize = null;
  }

  updateVariationSelection();
}

function initBulkPrices() {
  const bulkSection = document.getElementById('pdBulkSection');
  const variationTiers = (currentVariation && currentVariation.bulkPrices && currentVariation.bulkPrices.length > 0) ? currentVariation.bulkPrices : [];
  const baseTiers = (product.bulkPrices && product.bulkPrices.length > 0) ? product.bulkPrices : [];
  const tiers = variationTiers.length > 0 ? variationTiers : baseTiers;

  if (tiers.length === 0) {
    if (bulkSection) bulkSection.style.display = 'none';
    return;
  }

  if (bulkSection) bulkSection.style.display = 'block';
  renderBulkOptions(tiers);
}

function renderBulkOptions(tiers) {
  const container = document.getElementById('pdBulkPrices');
  if (!container) return;
  
  container.innerHTML = tiers.map((tier, idx) => `
    <button class="var-pill ${selectedBulkTier === tier ? 'selected' : ''}" 
            onclick="selectBulkTier(${idx})">
      ${tier.quantity} ${tier.unit || 'Pcs'}
    </button>
  `).join('');
}

window.selectBulkTier = function(idx) {
  const variationTiers = (currentVariation && currentVariation.bulkPrices && currentVariation.bulkPrices.length > 0) ? currentVariation.bulkPrices : [];
  const baseTiers = (product.bulkPrices && product.bulkPrices.length > 0) ? product.bulkPrices : [];
  const tiers = variationTiers.length > 0 ? variationTiers : baseTiers;
  
  const tier = tiers[idx];
  if (selectedBulkTier === tier) {
    selectedBulkTier = null; // Toggle off
  } else {
    selectedBulkTier = tier;
  }
  
  renderBulkOptions(tiers);
  updateVariationSelection();
};

function updateBulkDisplay() {
  const section = document.getElementById('pdSinglePrice');
  const val     = document.getElementById('pdSinglePriceVal');
  
  if (selectedBulkTier) {
    const single = (selectedBulkTier.price / selectedBulkTier.quantity).toFixed(2);
    if (section) section.style.display = 'block';
    if (val) val.textContent = formatRupees(single);
    
    // Set quantity unit to 1 if pack is selected
    qty = 1;
    if (document.getElementById('pdQtyVal')) document.getElementById('pdQtyVal').value = 1;
  } else {
    if (section) section.style.display = 'none';
  }
}

function renderColorOptions() {
  const container = document.getElementById('pdColorOptions');
  container.innerHTML = availableColors.map(color => `
    <button class="var-pill ${color === currentSelectedColor ? 'selected' : ''}" onclick="selectColor('${color.replace(/'/g, "\\'")}')">${color}</button>
  `).join('');
}

function renderSizeOptions() {
  const container = document.getElementById('pdSizeOptions');
  container.innerHTML = availableSizes.map(size => `
    <button class="var-pill ${size === currentSelectedSize ? 'selected' : ''}" onclick="selectSize('${size.replace(/'/g, "\\'")}')">${size}</button>
  `).join('');
}

window.selectColor = function(c) {
  currentSelectedColor = c;
  renderColorOptions();
  updateVariationSelection();
};

window.selectSize = function(s) {
  currentSelectedSize = s;
  renderSizeOptions();
  updateVariationSelection();
};

function updateVariationSelection() {
  if (product.variations && product.variations.length > 0) {
    currentVariation = product.variations.find(v => v.size === currentSelectedSize);
  } else {
    currentVariation = null;
  }

  if (document.getElementById('pdSelectedColorLabel')) {
    document.getElementById('pdSelectedColorLabel').textContent = currentSelectedColor || '';
  }
  if (document.getElementById('pdSelectedSizeLabel')) {
    document.getElementById('pdSelectedSizeLabel').textContent  = currentSelectedSize || '';
  }

  // Refresh bulk prices when variation changes
  initBulkPrices();

  if (selectedBulkTier) {
    updatePriceDisplay(selectedBulkTier.price, selectedBulkTier.mrp || (product.mrp ? (product.mrp / product.price * selectedBulkTier.price) : 0));
    updateBulkDisplay();
    return; // Bulk tier overrides normal variations for price display
  }

  if (document.getElementById('pdSinglePrice')) document.getElementById('pdSinglePrice').style.display = 'none';

  if (currentVariation) {
    updatePriceDisplay(currentVariation.price, currentVariation.mrp);
  } else {
    updatePriceDisplay(product.price, product.mrp);
  }
}

function updatePriceDisplay(price, mrp) {
  const minQty = product.minQuantity || 1;
  const currentQty = qty || minQty;
  const priceEl = document.getElementById('pdPrice');
  
  // Display total price (price * qty)
  priceEl.textContent = formatRupees(price * currentQty);
  
  // Show per-piece price if MOQ > 1
  const perPieceEl = document.getElementById('pdPerPiecePrice');
  if (minQty > 1 || currentQty > 1) {
    if (!perPieceEl) {
      const newPerPiece = document.createElement('span');
      newPerPiece.id = 'pdPerPiecePrice';
      newPerPiece.style.cssText = 'font-size: 0.85rem; color: #777; font-weight: 400; margin-left: 8px; display: block; margin-top: 4px;';
      priceEl.parentElement.appendChild(newPerPiece);
    }
    document.getElementById('pdPerPiecePrice').textContent = `(${formatRupees(price)} / piece)`;
  } else if (perPieceEl) {
    perPieceEl.remove();
  }

  // Animate price change
  priceEl.classList.remove('pd-price-animate');
  void priceEl.offsetWidth; // force reflow
  priceEl.classList.add('pd-price-animate');
  
  const mrpEl = document.getElementById('pdMrp');
  const saveEl = document.getElementById('pdSave');
  const badge = document.getElementById('pdBadge');
  
  if (mrp && mrp > price) {
    mrpEl.style.display = 'inline';
    mrpEl.textContent = formatRupees(mrp * currentQty);
    
    const discount = Math.round((1 - price / mrp) * 100);
    saveEl.style.display = 'inline-flex';
    saveEl.textContent = `Save ${discount}%`;
    
    if (discount > 0 && badge) {
      badge.style.display = 'block';
      badge.textContent = `${discount}% OFF`;
    } else if (badge) {
      badge.style.display = 'none';
    }
  } else {
    if (mrpEl) mrpEl.style.display = 'none';
    if (saveEl) saveEl.style.display = 'none';
    if (badge) badge.style.display = 'none';
  }
}

function renderGallery() {
  const images = product.images || [];
  const mainImg = document.getElementById('pdMainImage');

  if (images.length > 0) {
    mainImg.src = images[0].url;
    mainImg.alt = `${product.name} — Marriage Goods & Bhagwan Poshak Indore`;
  } else {
    mainImg.style.display = 'none';
    mainImg.parentElement.innerHTML = `
      <div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:6rem;background:var(--cream)">🛍️</div>`;
  }

  const thumbsContainer = document.getElementById('pdThumbnails');
  if (images.length > 1) {
    thumbsContainer.innerHTML = images.map((img, i) => `
      <button class="pd-thumb ${i === 0 ? 'active' : ''}" data-index="${i}">
        <img src="${img.url}" alt="${product.name} - Image ${i + 1}" loading="lazy" />
      </button>
    `).join('');

    thumbsContainer.querySelectorAll('.pd-thumb').forEach(thumb => {
      thumb.addEventListener('click', () => {
        const index = parseInt(thumb.dataset.index);
        setActiveImage(index);
      });
    });
  } else {
    thumbsContainer.style.display = 'none';
  }
}

function setActiveImage(index) {
  const images = product.images || [];
  if (index < 0 || index >= images.length) return;

  currentImageIndex = index;
  const mainImg = document.getElementById('pdMainImage');
  
  // Add fade transition
  mainImg.style.opacity = '0';
  setTimeout(() => {
    mainImg.src = images[index].url;
    mainImg.style.opacity = '1';
  }, 150);

  // Update thumbnails
  document.querySelectorAll('.pd-thumb').forEach((th, i) => {
    th.classList.toggle('active', i === index);
  });
}

function initQtyControls() {
  const qtyVal = document.getElementById('pdQtyVal');
  const minQty = parseInt(product.minQuantity) || 1;
  const maxQty = product.stock !== undefined ? product.stock : 999;

  document.getElementById('pdQtyDec')?.addEventListener('click', () => {
    if (qty > minQty) {
      qty--;
      qtyVal.value = qty;
      updateVariationSelection(); // This triggers updatePriceDisplay
    } else if (minQty > 1) {
      showToast(`Minimum order quantity is ${minQty}`, 'warning');
    }
  });

  document.getElementById('pdQtyInc')?.addEventListener('click', () => {
    let currentStock = product?.stock || 999;
    if (currentVariation && currentVariation.stock !== undefined) currentStock = currentVariation.stock;
    
    let requestedQuantity = (qty + 1);
    if (selectedBulkTier) requestedQuantity = (qty + 1) * selectedBulkTier.quantity;

    if (requestedQuantity <= currentStock) {
      qty++;
      qtyVal.value = qty;
      updateVariationSelection();
    } else {
      showToast(`Only ${currentStock} units left in stock!`, 'error');
    }
  });

  qtyVal?.addEventListener('input', (e) => {
    // Allow free typing — don't override the field value while the user is still typing
    const raw = e.target.value;
    const parsed = parseInt(raw);
    // Only update internal qty if we have a valid positive number
    if (!isNaN(parsed) && parsed > 0) {
      qty = parsed;
      updateVariationSelection();
    }
  });

  qtyVal?.addEventListener('blur', (e) => {
    let currentStock = product?.stock || 999;
    if (currentVariation && currentVariation.stock !== undefined) currentStock = currentVariation.stock;

    let finalQty = parseInt(e.target.value);

    if (isNaN(finalQty) || finalQty < 1) {
      // Empty or non-numeric — reset to MOQ
      showToast(`Minimum order quantity is ${minQty}`, 'warning');
      finalQty = minQty;
    } else if (finalQty < minQty) {
      // Below MOQ — show error and snap to MOQ
      showToast(`Minimum order quantity is ${minQty}. Setting quantity to ${minQty}.`, 'warning');
      finalQty = minQty;
    } else {
      // Check stock limit
      let requestedQuantity = finalQty;
      if (selectedBulkTier) requestedQuantity = finalQty * selectedBulkTier.quantity;
      if (requestedQuantity > currentStock) {
        showToast(`Only ${currentStock} units left in stock!`, 'error');
        finalQty = selectedBulkTier ? Math.floor(currentStock / selectedBulkTier.quantity) : currentStock;
      }
    }

    qty = finalQty;
    e.target.value = finalQty;
    updateVariationSelection();
  });
}

function initAddToCart() {
  const btn = document.getElementById('pdAddCart');

  btn.addEventListener('click', () => {
    let cartVar = currentVariation ? { ...currentVariation } : null;
    if (selectedBulkTier) {
       cartVar = { 
         size: `${selectedBulkTier.quantity} ${selectedBulkTier.unit || 'Pcs'}`,
         price: selectedBulkTier.price,
         mrp: selectedBulkTier.mrp,
         weight: product.weight || 0,
         _id: `bulk_${selectedBulkTier.quantity}`
       };
    }

    let currentStock = product?.stock || 999;
    if (currentVariation && currentVariation.stock !== undefined) currentStock = currentVariation.stock;
    
    if (currentStock === 0) {
      showToast('This item is currently out of stock', 'error');
      return;
    }
    
    let requestedQuantity = qty;
    if (selectedBulkTier) requestedQuantity = qty * selectedBulkTier.quantity;

    if (requestedQuantity > currentStock) {
      showToast(`Only ${currentStock} units left in stock!`, 'error');
      return;
    }

    if (cartVar || currentSelectedColor) {
      cartVar = cartVar || {};
      if (currentSelectedColor) cartVar.color = currentSelectedColor;
    }
    Cart.add(product, qty, cartVar);
    btn.innerHTML = `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg> ${qty > 1 ? qty + 'x ' : ''}Added!`;
    btn.classList.add('added');
    setTimeout(() => {
      btn.innerHTML = `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg> Add to Cart`;
      btn.classList.remove('added');
    }, 2000);
    qty = 1;
    document.getElementById('pdQtyVal').value = 1;
  });
}

function initLightbox() {
  const images = product.images || [];
  if (images.length === 0) return;

  const lightbox = document.getElementById('pdLightbox');
  const lightboxImg = document.getElementById('pdLightboxImg');
  const counter = document.getElementById('pdLightboxCounter');
  let lbIndex = 0;

  const updateLightbox = () => {
    lightboxImg.src = images[lbIndex].url;
    counter.textContent = `${lbIndex + 1} / ${images.length}`;
    document.getElementById('pdLightboxPrev').style.display = images.length > 1 ? '' : 'none';
    document.getElementById('pdLightboxNext').style.display = images.length > 1 ? '' : 'none';
  };

  // Open lightbox
  const openLightbox = (index) => {
    lbIndex = index;
    updateLightbox();
    lightbox.classList.add('open');
    document.body.style.overflow = 'hidden';
  };

  // Click main image or zoom button to open
  document.getElementById('pdMainImage')?.addEventListener('click', () => openLightbox(currentImageIndex));
  document.getElementById('pdZoomBtn')?.addEventListener('click', () => openLightbox(currentImageIndex));

  // Close
  document.getElementById('pdLightboxClose')?.addEventListener('click', () => {
    lightbox.classList.remove('open');
    document.body.style.overflow = '';
  });

  lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox) {
      lightbox.classList.remove('open');
      document.body.style.overflow = '';
    }
  });

  // Nav
  document.getElementById('pdLightboxPrev')?.addEventListener('click', (e) => {
    e.stopPropagation();
    lbIndex = (lbIndex - 1 + images.length) % images.length;
    updateLightbox();
  });

  document.getElementById('pdLightboxNext')?.addEventListener('click', (e) => {
    e.stopPropagation();
    lbIndex = (lbIndex + 1) % images.length;
    updateLightbox();
  });

  // Keyboard
  document.addEventListener('keydown', (e) => {
    if (!lightbox.classList.contains('open')) return;
    if (e.key === 'Escape') {
      lightbox.classList.remove('open');
      document.body.style.overflow = '';
    }
    if (e.key === 'ArrowLeft') {
      lbIndex = (lbIndex - 1 + images.length) % images.length;
      updateLightbox();
    }
    if (e.key === 'ArrowRight') {
      lbIndex = (lbIndex + 1) % images.length;
      updateLightbox();
    }
  });
}

function showError(msg) {
  document.getElementById('pdSkeleton').style.display = 'none';
  document.getElementById('pdContent').style.display = 'none';
  const errorEl = document.getElementById('pdError');
  errorEl.style.display = 'block';
  if (msg) document.getElementById('pdErrorMsg').textContent = msg;
}

async function loadRelatedProducts() {
  const section = document.getElementById('pdAlsoLike');
  const container = document.getElementById('pdAlsoRowsContainer');
  if (!section || !container) return;

  // Show the section
  section.style.display = '';

  try {
    // Fetch up to 31 products to have up to 30 after filtering current product
    const data = await API.getProducts({ category: product.category, limit: 31 });
    
    // Filter out current product
    const items = (data.products || []).filter(p => p._id !== product._id);

    if (!items.length) {
      section.style.display = 'none';
      return;
    }

    container.innerHTML = '';
    
    const TARGET_SIZE = 15;
    const MIN_SIZE = 5;
    const rows = [];

    // Splitting logic (same as main.js)
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
      wrapper.className = 'featured-carousel-wrapper'; // Reuse same styles
      
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
        const card = buildRelatedCard(p);
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
    console.warn('Related products failed to load:', err.message);
    section.style.display = 'none';
  }
}

/**
 * Reusable carousel initialization from main.js
 */
function initRowCarousel(grid, prevBtn, nextBtn) {
  if (!grid || !prevBtn || !nextBtn) return;

  const scrollSide = (direction) => {
    const card = grid.querySelector('.pd-related-card');
    const cardWidth = card ? card.offsetWidth + 20 : 300; // width + gap
    const scrollAmount = cardWidth * 3;
    grid.scrollBy({ left: direction === 'next' ? scrollAmount : -scrollAmount, behavior: 'smooth' });
  };

  prevBtn.addEventListener('click', () => scrollSide('prev'));
  nextBtn.addEventListener('click', () => scrollSide('next'));

  const toggleButtons = () => {
    prevBtn.disabled = grid.scrollLeft <= 5;
    nextBtn.disabled = grid.scrollLeft + grid.clientWidth >= grid.scrollWidth - 5;
    
    prevBtn.style.opacity = prevBtn.disabled ? '0.3' : '1';
    nextBtn.style.opacity = nextBtn.disabled ? '0.3' : '1';
  };

  grid.addEventListener('scroll', toggleButtons);
  window.addEventListener('resize', toggleButtons);
  setTimeout(toggleButtons, 500);
}

function buildRelatedCard(p) {
  const div = document.createElement('div');
  div.className = 'pd-related-card';

  const img      = p.images?.[0]?.url || '';
  const discount = p.mrp && p.mrp > p.price
    ? Math.round((1 - p.price / p.mrp) * 100) : 0;
  const outOfStock = false;
  const url = `/product?id=${p._id}`;

  div.innerHTML = `
    <a href="${url}" target="_blank" class="pd-rc-img-wrap">
      ${img
        ? `<img src="${img}" alt="${p.name}" loading="lazy" />`
        : `<div class="pd-rc-placeholder">&#x1F6CD;&#xFE0F;</div>`}
      ${discount > 0 ? `<span class="pd-rc-badge">${discount}% OFF</span>` : ''}
    </a>
    <div class="pd-rc-info">
      <div class="pd-rc-cat">${p.category}</div>
      <a href="${url}" target="_blank" class="pd-rc-name">${p.name}</a>
      ${p.recentSales > 0 ? `<div class="product-recent-sales">🔥 ${p.recentSales} sold in last 24h</div>` : ''}
      <div class="pd-rc-price-row">
        <span class="pd-rc-price">${formatRupees(p.price)}</span>
        ${p.mrp > p.price ? `<span class="pd-rc-mrp">${formatRupees(p.mrp)}</span>` : ''}
      </div>
      <div class="pd-rc-actions">
        <a href="${url}" target="_blank" class="pd-rc-view-btn">View Details</a>
        <button class="pd-rc-cart-btn">
          <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>
          Add
        </button>
      </div>
    </div>`;

  div.querySelector('.pd-rc-cart-btn')?.addEventListener('click', () => {
    Cart.add(p, 1);
    const btn = div.querySelector('.pd-rc-cart-btn');
    btn.textContent = '✓ Added!';
    btn.style.background = 'var(--teal)';
    setTimeout(() => {
      btn.innerHTML = `<svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg> Add`;
      btn.style.background = '';
    }, 1800);
  });

  return div;
}

function initShareButtons(product) {
  const shareText = `Check out ${product.name} on A.A & Sons!`;
  const shareUrl = window.location.href;

  document.getElementById('shareWhatsApp')?.addEventListener('click', () => {
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(shareText + ' ' + shareUrl)}`, '_blank');
  });

  document.getElementById('shareFacebook')?.addEventListener('click', () => {
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`, '_blank');
  });

  document.getElementById('shareCopy')?.addEventListener('click', async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: product.name, text: shareText, url: shareUrl });
        return;
      }
      await navigator.clipboard.writeText(shareUrl);
      showToast('Link copied to clipboard!', 'success');
    } catch (err) {
      // Ignore abort errors from share API
    }
  });
}

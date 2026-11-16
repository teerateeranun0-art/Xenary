/* XENARY Store — INFICOZ Design Engine
 * Product cards with price range & pill detail button, top showcase strip,
 * full-page 2-column product detail view, and instant key delivery.
 */
(function () {
  "use strict";

  if (window.__xenary_shop_loaded) {
    if (typeof window.__xenary_init_shop === "function") {
      window.__xenary_init_shop();
    }
    return;
  }
  window.__xenary_shop_loaded = true;

  var API = "/api/products";

  var state = {
    products: [],
    filtered: [],
    activeCategory: "",
    searchQuery: "",
    showcaseIdx: 0,
    activeProductSlug: null,
    selectedPlanIdx: null,
    orderQty: 1,
    descExpanded: false,
    discountCode: "",
    discountResult: null,
    discountMsg: "",
    discountOk: false,
    summary: null,
    currentUser: null,
    loadFailed: false,
  };

  function fmtPrice(n) {
    var num = Number(n) || 0;
    var isInt = Math.floor(num) === num;
    return "฿" + num.toLocaleString("en-US", {
      minimumFractionDigits: isInt ? 0 : 2,
      maximumFractionDigits: 2,
    });
  }

  function moneyFull(n) {
    return "฿" + Number(n || 0).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function safeImgUrl(url, fallback) {
    var u = String(url || "").trim();
    if (/^(https?:\/\/|\/(?!\/))/i.test(u)) return u;
    return fallback || "/assets/img/hero.jpg";
  }

  function getPriceRangeText(p) {
    var plans = Array.isArray(p.plans) && p.plans.length ? p.plans : [];
    if (!plans.length) {
      return fmtPrice(p.from || 0);
    }
    var prices = plans.map(function (pl) { return Number(pl.price) || 0; }).filter(function (v) { return v > 0; });
    if (!prices.length) return fmtPrice(p.from || 0);
    var minP = Math.min.apply(null, prices);
    var maxP = Math.max.apply(null, prices);
    if (minP === maxP) return fmtPrice(minP);
    return fmtPrice(minP) + " - " + fmtPrice(maxP);
  }

  function formatThaiDateTime(iso) {
    var d = iso ? new Date(iso) : new Date();
    if (isNaN(d.getTime())) d = new Date();
    return d.toLocaleString("th-TH", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function fetchCurrentUser() {
    try {
      var cached = localStorage.getItem("xn_cached_user");
      if (cached) state.currentUser = JSON.parse(cached);
    } catch (e) {}

    return fetch("/api/auth/me", { cache: "no-store", credentials: "same-origin" })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        state.currentUser = d.user || null;
        return state.currentUser;
      })
      .catch(function () {
        return state.currentUser;
      });
  }

  function load() {
    var ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = ctl && setTimeout(function () { ctl.abort(); }, 4500);
    return fetch(API, { cache: "no-store", signal: ctl && ctl.signal })
      .then(function (r) {
        if (!r.ok) throw new Error("http " + r.status);
        return r.json();
      })
      .then(function (data) {
        if (!data || !Array.isArray(data.products)) throw new Error("Invalid product catalog response");
        state.loadFailed = false;
        state.products = data.products
          .filter(function (p) {
            return p && typeof p === "object" && typeof (p.slug || p.id) === "string";
          })
          .map(function (p) {
            p.slug = p.slug || p.id;
            p.name = typeof p.name === "string" && p.name.trim() ? p.name : (p.slug || p.id);
            p.tag = typeof p.tag === "string" && p.tag.trim() ? p.tag : "Valorant";
            p.desc = typeof p.desc === "string" ? p.desc : "";
            p.stock = p.stock == null || p.stock === "" ? 0 : Math.max(0, Math.floor(Number(p.stock) || 0));
            p.sold = Number.isFinite(Number(p.sold)) ? Number(p.sold) : 0;
            p.from = Number.isFinite(Number(p.from)) && Number(p.from) >= 0 ? Number(p.from) : 0;
            p.updating = Boolean(p.updating || p.status_mode === "updating");
            p.status_mode = p.updating ? "updating" : "normal";
            p.update_note = typeof p.update_note === "string" ? p.update_note : "";
            p.plans = Array.isArray(p.plans)
              ? p.plans
                  .filter(function (plan) {
                    return plan && typeof plan.label === "string" && Number.isFinite(Number(plan.price)) && Number(plan.price) >= 0;
                  })
                  .map(function (plan) {
                    var plStock = plan.stock == null ? 0 : Math.max(0, Math.floor(Number(plan.stock) || 0));
                    return { label: plan.label, price: Number(plan.price), per: plan.per || "", stock: plStock };
                  })
              : [];
            return p;
          });
        return state.products;
      })
      .catch(function (err) {
        console.warn("Could not load products from API:", err);
        state.loadFailed = true;
        return [];
      })
      .finally(function () {
        if (timer) clearTimeout(timer);
      });
  }

  function loadSummary() {
    return fetch("/api/summary", { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data || typeof data !== "object") return null;
        state.summary = data;

        var uEl = document.getElementById("kpi-users");
        var pEl = document.getElementById("kpi-products");
        var sEl = document.getElementById("kpi-stock");
        var dEl = document.getElementById("kpi-sold");
        if (uEl) uEl.textContent = Number(data.totalUsers || 0).toLocaleString("en-US");
        if (pEl) pEl.textContent = Number(data.totalProducts || 0).toLocaleString("en-US");
        if (sEl) sEl.textContent = Number(data.readyStock || 0).toLocaleString("en-US");
        if (dEl) dEl.textContent = Number(data.totalSold || 0).toLocaleString("en-US");

        var wtEl = document.getElementById("sx-welcome-title");
        var wsEl = document.getElementById("sx-welcome-sub");
        if (wtEl && data.hero_title) wtEl.textContent = data.hero_title;
        if (wsEl && data.hero_subtitle) wsEl.textContent = data.hero_subtitle;

        var bannerEl = document.getElementById("sx-hero-banner-img");
        if (bannerEl && data.banner_url) {
          bannerEl.src = safeImgUrl(data.banner_url, "/assets/img/banner.jpg");
        }

        var restockHead = document.getElementById("sx-restocks-head");
        var restockBox = document.getElementById("sx-restocks-container");
        if (restockBox) {
          var restocks = Array.isArray(data.recentRestocks) ? data.recentRestocks : [];
          if (restocks.length) {
            if (restockHead) restockHead.hidden = false;
            restockBox.innerHTML = "";
            restocks.forEach(function (item) {
              var card = document.createElement("div");
              card.className = "inf-restock-card";
              card.innerHTML =
                '<img src="' + escapeHtml(safeImgUrl(item.img)) + '" alt="' + escapeHtml(item.name) + '" loading="lazy">' +
                '<div class="inf-restock-meta">' +
                  '<strong>' + escapeHtml(item.name) + '</strong>' +
                  '<span>พร้อมส่ง ' + Number(item.stock || 0) + ' ชิ้น &middot; เริ่ม ' + escapeHtml(fmtPrice(item.from || 0)) + '</span>' +
                '</div>';
              card.addEventListener("click", function () {
                if (item.slug) openProductDetail(item.slug, true);
              });
              restockBox.appendChild(card);
            });
          } else {
            if (restockHead) restockHead.hidden = true;
            restockBox.innerHTML = "";
          }
        }
        return data;
      })
      .catch(function () { return null; });
  }

  /* ================================================================
     1. TOP SHOWCASE STRIP (IMAGE 2 TOP)
     ================================================================ */
  function renderCategories() {
    var container = document.getElementById("sx-categories-container");
    if (!container) return;

    var tags = [];
    state.products.forEach(function (p) {
      if (p.tag && tags.indexOf(p.tag) === -1) tags.push(p.tag);
    });
    if (!tags.length) tags = ["Valorant"];

    if (state.showcaseIdx >= tags.length) state.showcaseIdx = 0;
    var activeTag = tags[state.showcaseIdx] || tags[0];
    var tagProds = state.products.filter(function (p) { return p.tag === activeTag; });
    var featProd = tagProds[0] || state.products[0];

    container.className = "inf-showcase-grid";
    container.innerHTML = "";

    // Left Box: Category Showcase with indicator dots
    var leftCard = document.createElement("div");
    leftCard.className = "inf-cat-showcase-card";
    var bgImg = safeImgUrl(featProd && featProd.img, "https://img2.pic.in.th/serifvalopro9a13213f74c94f81.png");
    var dotsHtml = tags
      .map(function (t, idx) {
        return '<button type="button" class="inf-dot' + (idx === state.showcaseIdx ? " active" : "") + '" data-idx="' + idx + '" aria-label="' + escapeHtml(t) + '"></button>';
      })
      .join("");

    leftCard.innerHTML =
      '<img src="' + escapeHtml(bgImg) + '" alt="" class="inf-cat-showcase-bg">' +
      '<div class="inf-cat-showcase-content">' +
        '<h3 class="inf-cat-showcase-title">' + escapeHtml(activeTag.toUpperCase()) + '</h3>' +
        '<p class="inf-cat-showcase-sub">สินค้าภายในหมวดหมู่ทั้งหมด (' + tagProds.length + ' รายการ)</p>' +
        '<div class="inf-dots">' + dotsHtml + '</div>' +
      '</div>';

    leftCard.querySelectorAll(".inf-dot").forEach(function (dot) {
      dot.addEventListener("click", function (ev) {
        ev.stopPropagation();
        state.showcaseIdx = Number(dot.dataset.idx) || 0;
        renderCategories();
      });
    });

    leftCard.addEventListener("click", function () {
      selectCategoryTab(activeTag);
      var prodSection = document.getElementById("sx-products-anchor");
      if (prodSection) prodSection.scrollIntoView({ behavior: "smooth" });
    });

    container.appendChild(leftCard);

    // Right Box: Featured Product Horizontal Card
    if (featProd) {
      var rightCard = document.createElement("div");
      rightCard.className = "inf-feat-prod-card";
      rightCard.innerHTML =
        '<div class="inf-feat-left">' +
          '<img src="' + escapeHtml(safeImgUrl(featProd.img, bgImg)) + '" alt="' + escapeHtml(featProd.name) + '" class="inf-feat-thumb">' +
          '<div class="inf-feat-info">' +
            '<h3>' + escapeHtml(featProd.name) + '</h3>' +
            '<div class="inf-feat-price">' + escapeHtml(getPriceRangeText(featProd)) + '</div>' +
            '<div class="inf-card-stat-row">' +
              '<span class="inf-stat-item">' +
                '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>' +
                'ขายแล้ว ' + (featProd.sold || 0) +
              '</span>' +
              '<span>&middot;</span>' +
              '<span class="inf-stat-item">' +
                '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>' +
                'คงเหลือ ' + (featProd.stock ?? 0) +
              '</span>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<button type="button" class="inf-btn-detail">' +
          '<span>ดูรายละเอียด</span>' +
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>' +
        '</button>';

      rightCard.addEventListener("click", function () {
        openProductDetail(featProd.slug, true);
      });
      container.appendChild(rightCard);
    }
  }

  /* ================================================================
     2. CATEGORY FILTER TABS & LATEST ORDERS
     ================================================================ */
  function renderCategoryTabs() {
    var container = document.querySelector(".sx-filter-tabs");
    if (!container) return;
    var tags = state.products
      .map(function (p) { return p.tag; })
      .filter(function (tag, index, all) {
        return typeof tag === "string" && tag.trim() && all.indexOf(tag) === index;
      });
    if (state.activeCategory && tags.indexOf(state.activeCategory) === -1) state.activeCategory = "";
    container.innerHTML = "";
    [{ tag: "", label: "สินค้าทั้งหมด" }]
      .concat(tags.map(function (tag) { return { tag: tag, label: tag }; }))
      .forEach(function (item) {
        var button = document.createElement("button");
        button.type = "button";
        button.className = "sx-tab-btn" + (item.tag === state.activeCategory ? " active" : "");
        button.dataset.tag = item.tag;
        button.textContent = item.label;
        container.appendChild(button);
      });
  }

  function bindCategoryTabs() {
    document.querySelectorAll(".sx-tab-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        selectCategoryTab(btn.dataset.tag);
      });
    });
  }

  function selectCategoryTab(tag) {
    state.activeCategory = tag;
    document.querySelectorAll(".sx-tab-btn").forEach(function (tab) {
      tab.classList.toggle("active", tab.dataset.tag === tag);
    });
    filterAndRenderProducts();
  }

  function timeAgo(iso) {
    var ts = new Date(iso).getTime();
    if (!Number.isFinite(ts)) return "เมื่อสักครู่";
    var s = Math.max(0, (Date.now() - ts) / 1000);
    if (s < 3600) return Math.max(1, Math.floor(s / 60)) + " นาทีที่แล้ว";
    if (s < 86400) return Math.floor(s / 3600) + " ชั่วโมงที่แล้ว";
    return Math.floor(s / 86400) + " วันที่แล้ว";
  }

  function renderLatestOrders() {
    var box = document.getElementById("sx-orders-container");
    if (!box) return;
    fetch("/api/orders/recent", { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : { orders: [] }; })
      .catch(function () { return { orders: [] }; })
      .then(function (data) {
        var slugs = state.products.map(function (p) { return p.slug; });
        var list = (data.orders || []).filter(function (o) { return slugs.indexOf(o.slug) !== -1; });
        if (!list.length) {
          box.innerHTML = '<div class="sx-order-empty">ยังไม่มีรายการสั่งซื้อ</div>';
          return;
        }
        box.innerHTML = "";
        list.forEach(function (o) {
          var p = state.products.filter(function (x) { return x.slug === o.slug; })[0] || {};
          var el = document.createElement("div");
          el.className = "sx-order-card";
          el.style.cursor = "pointer";
          el.innerHTML =
            '<div class="sx-order-thumb">' + (p.img ? '<img src="' + escapeHtml(safeImgUrl(p.img)) + '" alt="" loading="lazy">' : "") + '</div>' +
            '<div class="sx-order-info">' +
              '<strong>' + escapeHtml(o.name) + '</strong>' +
              '<span>ราคา ' + Number(o.total).toFixed(2) + ' บาท</span>' +
              '<small>' + escapeHtml(timeAgo(o.createdAt)) + ' | ' + escapeHtml(o.buyer) + '</small>' +
            '</div>';
          el.addEventListener("click", function () {
            if (p.slug) openProductDetail(p.slug, true);
          });
          box.appendChild(el);
        });
      });
  }

  /* ================================================================
     3. INFICOZ PRODUCT CARD & CATALOG GRID (IMAGE 1 & 2)
     ================================================================ */
  function createInficozProductCard(p) {
    var pid = p.slug || p.id;
    var priceRange = getPriceRangeText(p);
    var totalStock = p.stock != null ? p.stock : 0;
    var totalSold = Number(p.sold) || 0;

    var isUpdating = Boolean(p.updating || p.status_mode === "updating");

    var card = document.createElement("article");
    card.className = "product-card" + (isUpdating ? " is-updating" : "");
    card.dataset.id = pid;

    card.innerHTML =
      '<div class="product-img">' +
        '<img src="' + escapeHtml(safeImgUrl(p.img, "https://img2.pic.in.th/serifvalopro9a13213f74c94f81.png")) + '" alt="' + escapeHtml(p.name) + '" loading="lazy">' +
        (isUpdating
          ? '<span class="inf-updating-tag">' +
              '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>' +
              '<span>กำลังปิดอัปเดต</span>' +
            '</span>'
          : '') +
      '</div>' +
      '<div class="product-content">' +
        '<div class="inf-card-main-row">' +
          '<h3 class="product-title" title="' + escapeHtml(p.name) + '">' + escapeHtml(p.name) + '</h3>' +
          '<button type="button" class="inf-btn-detail">' +
            '<span>ดูรายละเอียด</span>' +
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>' +
          '</button>' +
        '</div>' +
        '<div class="product-price-val">' + escapeHtml(priceRange) + '</div>' +
        '<div class="inf-card-stat-row">' +
          '<span class="inf-stat-item">' +
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>' +
            'ขายแล้ว ' + totalSold +
          '</span>' +
          '<span>&middot;</span>' +
          '<span class="inf-stat-item">' +
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>' +
            'คงเหลือ ' + totalStock +
          '</span>' +
        '</div>' +
      '</div>';

    card.addEventListener("click", function (e) {
      e.preventDefault();
      openProductDetail(pid, true);
    });

    return card;
  }

  function filterAndRenderProducts() {
    var q = (state.searchQuery || "").toLowerCase().trim();
    var cat = state.activeCategory;

    state.filtered = state.products.filter(function (p) {
      if (cat && p.tag !== cat) {
        if (!(cat === "Serials" && (p.tag === "Serials" || p.tag === "Bundles"))) {
          return false;
        }
      }
      if (q) {
        var match =
          (p.name || "").toLowerCase().includes(q) ||
          (p.tag || "").toLowerCase().includes(q) ||
          (p.desc || "").toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });

    renderProductGrid(state.filtered);
  }

  function renderProductGrid(products) {
    var grid = document.getElementById("sx-product-grid");
    if (!grid) return;

    if (!products.length) {
      grid.innerHTML = state.loadFailed
        ? '<div style="grid-column:1/-1;text-align:center;color:var(--sx-muted);padding:48px 0;font-size:14px">โหลดสินค้าไม่สำเร็จ กรุณาลองใหม่อีกครั้ง<br><button type="button" class="sx-retry-products" style="margin-top:14px">ลองโหลดใหม่</button></div>'
        : '<div style="grid-column: 1 / -1; text-align: center; color: var(--sx-muted); padding: 48px 0; font-size: 14px;">ไม่พบสินค้าที่ตรงกับการค้นหา</div>';
      var retry = grid.querySelector(".sx-retry-products");
      if (retry) {
        retry.addEventListener("click", function () {
          retry.disabled = true;
          retry.textContent = "กำลังโหลด...";
          load().then(function () {
            renderCategories();
            renderCategoryTabs();
            bindCategoryTabs();
            filterAndRenderProducts();
          });
        });
      }
      return;
    }

    grid.innerHTML = "";
    products.forEach(function (p) {
      grid.appendChild(createInficozProductCard(p));
    });
  }

  /* ================================================================
     4. FULL-PAGE PRODUCT DETAIL VIEW (IMAGE 3 & 4)
     ================================================================ */
  function ensureDetailRoot() {
    var section = document.querySelector(".sx-shop-section");
    if (!section) return null;
    var root = document.getElementById("inf-product-detail-root");
    if (!root) {
      root = document.createElement("div");
      root.id = "inf-product-detail-root";
      root.hidden = true;
      section.appendChild(root);
    }
    return root;
  }

  function setStorefrontVisibility(showCatalog) {
    var section = document.querySelector(".sx-shop-section");
    if (!section) return;
    section.classList.toggle("is-detail-mode", !showCatalog);
    Array.from(section.children).forEach(function (child) {
      if (child.id === "inf-product-detail-root") {
        child.hidden = showCatalog;
        child.style.display = showCatalog ? "none" : "block";
      } else if (child.tagName !== "SCRIPT") {
        child.hidden = !showCatalog;
        child.style.display = showCatalog ? "" : "none";
      }
    });
  }

  function syncNavHighlight(pathname) {
    var cleanPath = pathname.replace(/\/+$/, "") || "/";
    document.querySelectorAll(".xn-links a").forEach(function (a) {
      if (a.classList.contains("xn-pill") || a.classList.contains("xn-adm-pill") || a.classList.contains("cta")) return;
      var aPath = (a.getAttribute("href") || "").replace(/\/+$/, "") || "/";
      a.classList.toggle("on", aPath === cleanPath);
    });
  }

  function openProductDetail(slug, pushHistory) {
    var p = state.products.find(function (x) { return x.slug === slug || x.id === slug; });
    if (!p) return;

    var plans = Array.isArray(p.plans) && p.plans.length ? p.plans : [];
    var firstAvailIdx = plans.findIndex(function (pl) { return (Number(pl.stock) || 0) > 0; });

    state.activeProductSlug = p.slug;
    state.selectedPlanIdx = plans.length ? (firstAvailIdx !== -1 ? firstAvailIdx : 0) : null;
    state.orderQty = 1;
    state.descExpanded = false;
    state.discountCode = "";
    state.discountResult = null;
    state.discountMsg = "";
    state.discountOk = false;

    if (pushHistory && window.history && window.history.pushState) {
      var targetUrl = "/products/?item=" + encodeURIComponent(p.slug);
      window.history.pushState({ infItem: p.slug }, p.name + " — XENARY", targetUrl);
      syncNavHighlight("/products");
    }

    ensureDetailRoot();
    setStorefrontVisibility(false);
    renderProductDetailView(p);
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function closeProductDetail(pushHistory) {
    state.activeProductSlug = null;
    if (pushHistory && window.history && window.history.pushState) {
      window.history.pushState({}, "สินค้า — XENARY", "/products/");
      syncNavHighlight("/products");
    }
    setStorefrontVisibility(true);
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function validateDiscountForProduct(product, plan, qty, codeRaw) {
    var code = String(codeRaw || "").trim().toUpperCase();
    state.discountCode = code;
    if (!code) {
      state.discountResult = null;
      state.discountMsg = "";
      state.discountOk = false;
      return Promise.resolve(null);
    }
    return fetch("/api/coupon/validate", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: code,
        product: product.slug || product.id,
        plan: plan ? plan.label : "",
        quantity: qty,
      }),
    })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          return { ok: r.ok && j.valid, data: j };
        });
      })
      .then(function (res) {
        if (res.ok) {
          state.discountOk = true;
          state.discountResult = res.data;
          state.discountMsg = res.data.message || "ใช้โค้ดส่วนลดสำเร็จ";
        } else {
          state.discountOk = false;
          state.discountResult = null;
          state.discountMsg = (res.data && res.data.message) || "รหัสส่วนลดไม่สามารถใช้งานได้";
        }
        return res;
      })
      .catch(function () {
        state.discountOk = false;
        state.discountResult = null;
        state.discountMsg = "ตรวจสอบโค้ดส่วนลดไม่สำเร็จ กรุณาลองใหม่";
        return null;
      });
  }

  function renderProductDetailView(p) {
    var root = ensureDetailRoot();
    if (!root) return;

    var plans = Array.isArray(p.plans) && p.plans.length
      ? p.plans
      : [{ label: "มาตรฐาน", price: p.from || 99, stock: p.stock || 0 }];

    if (state.selectedPlanIdx == null || !plans[state.selectedPlanIdx]) {
      var firstAvail = plans.findIndex(function (pl) { return (Number(pl.stock) || 0) > 0; });
      state.selectedPlanIdx = firstAvail !== -1 ? firstAvail : 0;
    }

    var chosenPlan = plans[state.selectedPlanIdx] || plans[0];
    var totalStock = p.stock != null ? p.stock : 0;
    var totalSold = Number(p.sold) || 0;
    var isUpdating = Boolean(p.updating || p.status_mode === "updating");
    var isAvailable = !isUpdating && totalStock > 0;

    var activePlanStock = chosenPlan ? (chosenPlan.stock != null ? chosenPlan.stock : totalStock) : 0;
    var maxQty = Math.max(1, Math.min(10, activePlanStock || 1));
    if (state.orderQty < 1) state.orderQty = 1;
    if (state.orderQty > maxQty) state.orderQty = maxQty;
    var qty = state.orderQty;

    var unitPrice = chosenPlan ? Number(chosenPlan.price) || 0 : 0;
    var subtotal = Math.round(unitPrice * qty * 100) / 100;
    var discountThb = state.discountOk && state.discountResult ? Number(state.discountResult.discountThb || 0) : 0;
    var finalTotal = state.discountOk && state.discountResult
      ? Number(state.discountResult.finalTotalThb)
      : subtotal;

    var checkSvg =
      '<svg class="inf-plan-check" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>' +
      '</svg>';

    var planCardsHtml = plans
      .map(function (pl, idx) {
        var plStock = pl.stock != null ? pl.stock : totalStock;
        var isSelected = state.selectedPlanIdx === idx;
        var isOut = plStock <= 0;
        return (
          '<button type="button" class="inf-plan-card' + (isSelected ? " selected" : "") + (isOut ? " out-of-stock" : "") + '" data-plan-idx="' + idx + '">' +
            '<div class="inf-plan-top">' +
              '<span class="inf-plan-name">' + escapeHtml(pl.label) + '</span>' +
              checkSvg +
            '</div>' +
            '<div class="inf-plan-bottom">' +
              '<span class="inf-plan-price">' + escapeHtml(fmtPrice(pl.price)) + '</span>' +
              '<span class="inf-plan-stock">' + (isUpdating ? "กำลังปิดอัปเดต" : (isOut ? "สินค้าหมด" : ("เหลือ " + plStock + " ชิ้น"))) + '</span>' +
            '</div>' +
          '</button>'
        );
      })
      .join("");

    var rawDesc = p.desc || "สินค้าดิจิทัลพร้อมส่งมอบคีย์อัตโนมัติทันทีหลังชำระเงิน สามารถรับคีย์และลิงก์ดาวน์โหลดได้ในหน้าบัญชีของคุณตลอด 24 ชั่วโมง";
    var isLongDesc = rawDesc.length > 130 || rawDesc.split("\n").length > 3;

    var user = state.currentUser;
    var buyBtnDisabled = isUpdating || !isAvailable || activePlanStock <= 0;
    var buyBtnText = isUpdating
      ? "สินค้ากำลังปิดอัปเดตชั่วคราว"
      : (!isAvailable || activePlanStock <= 0 ? "สินค้าหมดชั่วคราว" : "ซื้อสินค้า");

    var statusPillCls = isUpdating ? " updating" : (isAvailable ? "" : " out");
    var statusPillText = isUpdating
      ? ("กำลังอัปเดต" + (p.update_note ? " · " + p.update_note : ""))
      : (isAvailable ? "พร้อมขาย" : "สินค้าหมด");

    root.className = "inf-detail-view";
    root.innerHTML =
      '<nav class="inf-breadcrumb" aria-label="Breadcrumb">' +
        '<a href="#back-home" id="inf-bc-home">หน้าแรก</a>' +
        '<span>/</span>' +
        '<a href="/products/" id="inf-bc-all">หมวดหมู่สินค้า</a>' +
        '<span>/</span>' +
        '<a href="#back-cat" id="inf-bc-cat">' + escapeHtml(p.tag || "valorant") + '</a>' +
        '<span>/</span>' +
        '<span class="cur">' + escapeHtml(p.name) + '</span>' +
      '</nav>' +
      '<div class="inf-detail-grid">' +
        '<div class="inf-detail-left">' +
          '<div class="inf-detail-img-box">' +
            '<img src="' + escapeHtml(safeImgUrl(p.img, "https://img2.pic.in.th/serifvalopro9a13213f74c94f81.png")) + '" alt="' + escapeHtml(p.name) + '">' +
          '</div>' +
          '<div class="inf-left-info-card">' +
            '<div class="inf-left-info-head">' +
              '<span class="inf-left-info-ico">' +
                '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>' +
              '</span>' +
              '<div><strong>ข้อมูลสินค้า</strong><span>สถานะและรายละเอียดการจำหน่าย</span></div>' +
            '</div>' +
            '<div class="inf-info-rows">' +
              '<div class="inf-info-row">' +
                '<span class="inf-info-k"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>หมวดหมู่</span>' +
                '<a href="#back-cat" class="inf-info-v blue" id="inf-info-cat" style="text-decoration:none;">' + escapeHtml(p.tag || "Valorant") + ' &#8599;</a>' +
              '</div>' +
              '<div class="inf-info-row">' +
                '<span class="inf-info-k"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>สถานะ</span>' +
                '<span class="inf-status-pill-inline' + statusPillCls + '">' + escapeHtml(statusPillText) + '</span>' +
              '</div>' +
              '<div class="inf-info-row">' +
                '<span class="inf-info-k"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>คงเหลือ</span>' +
                '<span class="inf-info-v">' + totalStock + ' ชิ้น</span>' +
              '</div>' +
              '<div class="inf-info-row">' +
                '<span class="inf-info-k"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>ขายไปแล้ว</span>' +
                '<span class="inf-info-v blue">' + totalSold + ' ชิ้น</span>' +
              '</div>' +
              '<div class="inf-info-row">' +
                '<span class="inf-info-k"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>ประเภทสินค้า</span>' +
                '<span class="inf-info-v">' + (plans.length > 1 ? "มีตัวเลือกย่อย" : "คีย์จัดส่งอัตโนมัติ") + '</span>' +
              '</div>' +
              '<div class="inf-info-row">' +
                '<span class="inf-info-k"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>อัปเดตล่าสุด</span>' +
                '<span class="inf-info-v">' + escapeHtml(formatThaiDateTime(p.updatedAt)) + '</span>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="inf-detail-right">' +
          '<h1 class="inf-detail-title">' + escapeHtml(p.name) + '</h1>' +
          (isUpdating && p.update_note ? '<div class="inf-updating-banner">' + escapeHtml(p.update_note) + '</div>' : "") +
          '<div class="inf-desc-section">' +
            '<div class="inf-desc-head">' +
              '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>' +
              '<span>รายละเอียดสินค้า</span>' +
            '</div>' +
            '<div class="inf-desc-body' + (!state.descExpanded && isLongDesc ? " is-clamped" : "") + '" id="inf-desc-text">' + escapeHtml(rawDesc) + '</div>' +
            (isLongDesc
              ? '<div class="inf-desc-toggle-wrap"><button type="button" class="inf-desc-toggle-btn" id="inf-btn-readmore">' + (state.descExpanded ? "ย่อรายละเอียด &#8963;" : "แสดงเพิ่มเติม &#8964;") + '</button></div>'
              : "") +
          '</div>' +
          '<div class="inf-sec-label">' +
            '<span class="inf-sec-label-l"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>เลือกตัวเลือก</span>' +
            '<span class="inf-sec-label-r">' + plans.length + ' ตัวเลือก</span>' +
          '</div>' +
          '<div class="inf-plans-grid">' + planCardsHtml + '</div>' +
          '<div class="inf-inline-qty-row">' +
            '<span>จำนวน</span>' +
            '<div class="inf-inline-qty">' +
              '<button type="button" id="inf-qty-minus" aria-label="ลดจำนวน"' + (qty <= 1 || isUpdating ? " disabled" : "") + '>&minus;</button>' +
              '<b id="inf-qty-val">' + qty + '</b>' +
              '<button type="button" id="inf-qty-plus" aria-label="เพิ่มจำนวน"' + (qty >= maxQty || isUpdating ? " disabled" : "") + '>+</button>' +
            '</div>' +
          '</div>' +
          '<div class="inf-coupon-box">' +
            '<div class="inf-coupon-row">' +
              '<input type="text" id="inf-coupon-input" class="inf-coupon-input" placeholder="โค้ดส่วนลด (ถ้ามี)" value="' + escapeHtml(state.discountCode || "") + '" autocomplete="off">' +
              '<button type="button" id="inf-coupon-check" class="inf-coupon-btn">ตรวจสอบ</button>' +
            '</div>' +
            '<p class="inf-coupon-msg ' + (state.discountMsg ? (state.discountOk ? "ok" : "err") : "") + '" id="inf-coupon-msg">' + escapeHtml(state.discountMsg || "") + '</p>' +
          '</div>' +
          '<div class="inf-total-box">' +
            '<div class="inf-total-left">' +
              '<strong>ราคารวมทั้งสิ้น</strong>' +
              '<span>' + qty + ' ชิ้น &times; ' + escapeHtml(fmtPrice(unitPrice)) + (discountThb > 0 ? (" &middot; ส่วนลด -" + escapeHtml(fmtPrice(discountThb))) : "") + '</span>' +
            '</div>' +
            '<div class="inf-total-right">' +
              (discountThb > 0 ? '<span class="inf-total-strike">' + escapeHtml(fmtPrice(subtotal)) + '</span>' : "") +
              '<div class="inf-total-price">' + escapeHtml(fmtPrice(finalTotal)) + '</div>' +
            '</div>' +
          '</div>' +
          '<div class="inf-cta-row">' +
            '<button type="button" class="inf-cta-buy" id="inf-btn-open-modal"' + (buyBtnDisabled ? " disabled" : "") + '>' +
              '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:6px;"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>' +
              '<span>' + escapeHtml(buyBtnText) + '</span>' +
            '</button>' +
            '<a href="/account/" class="inf-btn-dark inf-cta-wallet">เติมเงิน' + (user ? (" (" + fmtPrice(user.balance || 0) + ")") : "") + '</a>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="inf-related-sec">' +
        '<div class="inf-related-head">' +
          '<div>' +
            '<h2>สินค้าอื่นในหมวด ' + escapeHtml((p.tag || "VALORANT").toUpperCase()) + '</h2>' +
            '<p>สินค้าที่เกี่ยวข้องและน่าสนใจ</p>' +
          '</div>' +
          '<a href="#all-products" class="sx-head-btn" id="inf-related-all">ดูทั้งหมด &rarr;</a>' +
        '</div>' +
        '<div class="product-grid" id="inf-related-grid"></div>' +
      '</div>';

    root.querySelector("#inf-bc-home").addEventListener("click", function (e) {
      e.preventDefault();
      closeProductDetail(true);
    });
    root.querySelector("#inf-bc-cat").addEventListener("click", function (e) {
      e.preventDefault();
      closeProductDetail(true);
      selectCategoryTab(p.tag || "");
    });
    var infoCat = root.querySelector("#inf-info-cat");
    if (infoCat) {
      infoCat.addEventListener("click", function (e) {
        e.preventDefault();
        closeProductDetail(true);
        selectCategoryTab(p.tag || "");
      });
    }
    root.querySelector("#inf-related-all").addEventListener("click", function (e) {
      e.preventDefault();
      closeProductDetail(true);
      selectCategoryTab("");
    });

    function refreshCouponThenRender() {
      var curPl = plans[state.selectedPlanIdx] || plans[0];
      if (state.discountCode) {
        validateDiscountForProduct(p, curPl, state.orderQty, state.discountCode).then(function () {
          renderProductDetailView(p);
        });
      } else {
        renderProductDetailView(p);
      }
    }

    root.querySelectorAll(".inf-plan-card").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var idx = Number(btn.dataset.planIdx);
        state.selectedPlanIdx = idx;
        state.orderQty = 1;
        refreshCouponThenRender();
      });
    });

    var qtyMinus = root.querySelector("#inf-qty-minus");
    var qtyPlus = root.querySelector("#inf-qty-plus");
    if (qtyMinus) {
      qtyMinus.addEventListener("click", function () {
        if (state.orderQty > 1) {
          state.orderQty--;
          refreshCouponThenRender();
        }
      });
    }
    if (qtyPlus) {
      qtyPlus.addEventListener("click", function () {
        if (state.orderQty < maxQty) {
          state.orderQty++;
          refreshCouponThenRender();
        }
      });
    }

    var couponInput = root.querySelector("#inf-coupon-input");
    var couponCheckBtn = root.querySelector("#inf-coupon-check");
    if (couponInput) {
      couponInput.addEventListener("input", function () {
        state.discountCode = couponInput.value.trim().toUpperCase();
        if (!state.discountCode) {
          state.discountOk = false;
          state.discountResult = null;
          state.discountMsg = "";
          var mEl = root.querySelector("#inf-coupon-msg");
          if (mEl) { mEl.textContent = ""; mEl.className = "inf-coupon-msg"; }
        }
      });
      couponInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          e.preventDefault();
          if (couponCheckBtn) couponCheckBtn.click();
        }
      });
    }
    if (couponCheckBtn) {
      couponCheckBtn.addEventListener("click", function () {
        var codeVal = couponInput ? couponInput.value.trim().toUpperCase() : "";
        if (!codeVal) {
          state.discountCode = "";
          state.discountOk = false;
          state.discountResult = null;
          state.discountMsg = "กรุณากรอกรหัสส่วนลด";
          renderProductDetailView(p);
          return;
        }
        couponCheckBtn.disabled = true;
        couponCheckBtn.textContent = "กำลังตรวจ...";
        validateDiscountForProduct(p, chosenPlan, state.orderQty, codeVal).then(function () {
          renderProductDetailView(p);
        });
      });
    }

    var readMoreBtn = root.querySelector("#inf-btn-readmore");
    if (readMoreBtn) {
      readMoreBtn.addEventListener("click", function () {
        state.descExpanded = !state.descExpanded;
        var bodyEl = root.querySelector("#inf-desc-text");
        if (bodyEl) {
          bodyEl.classList.toggle("is-clamped", !state.descExpanded && isLongDesc);
        }
        readMoreBtn.innerHTML = state.descExpanded ? "ย่อรายละเอียด &#8963;" : "แสดงเพิ่มเติม &#8964;";
      });
    }

    var openModalBtn = root.querySelector("#inf-btn-open-modal");
    if (openModalBtn) {
      openModalBtn.addEventListener("click", function () {
        openPurchasePopup(p);
      });
    }

    // Populate related products
    var relGrid = root.querySelector("#inf-related-grid");
    if (relGrid) {
      var related = state.products.filter(function (x) {
        return x.slug !== p.slug && x.tag === p.tag;
      });
      if (!related.length) {
        related = state.products.filter(function (x) { return x.slug !== p.slug; });
      }
      related.slice(0, 4).forEach(function (rp) {
        relGrid.appendChild(createInficozProductCard(rp));
      });
    }
  }

  function openPurchasePopup(product) {
    var old = document.getElementById("inf-buy-modal-root");
    if (old) old.remove();

    var user = state.currentUser;
    var plans = Array.isArray(product.plans) && product.plans.length
      ? product.plans
      : [{ label: "มาตรฐาน", price: product.price || 0, stock: product.stock || 0 }];
    var curIdx = state.selectedPlanIdx != null && plans[state.selectedPlanIdx] ? state.selectedPlanIdx : 0;
    var isUpdating = Boolean(product.updating || product.status_mode === "updating");
    var totalStock = plans.reduce(function (sum, pl) { return sum + (Number(pl.stock) || 0); }, 0);
    var curPlan = plans[curIdx];
    var planStock = curPlan ? (curPlan.stock != null ? curPlan.stock : totalStock) : 0;
    var qty = Math.max(1, Math.min(10, Math.min(state.orderQty || 1, planStock || 1)));

    var backdrop = document.createElement("div");
    backdrop.id = "inf-buy-modal-root";
    backdrop.className = "sx-modal-backdrop";

    function updateModalContent() {
      curPlan = plans[curIdx];
      planStock = curPlan ? (curPlan.stock != null ? curPlan.stock : totalStock) : 0;
      var maxQty = Math.max(1, Math.min(10, planStock || 1));
      if (qty > maxQty) qty = maxQty;
      var subtotalCost = curPlan ? curPlan.price * qty : 0;
      var modalDiscountThb = state.discountOk && state.discountResult ? Number(state.discountResult.discountThb || 0) : 0;
      var totalCost = state.discountOk && state.discountResult ? Number(state.discountResult.finalTotalThb) : subtotalCost;
      var userBalance = user ? Number(user.balance || 0) : 0;
      var hasEnoughBalance = userBalance >= totalCost;

      var plansOptionsHtml = plans.map(function (pl, i) {
        var s = pl.stock != null ? pl.stock : totalStock;
        return '<option value="' + i + '"' + (i === curIdx ? ' selected' : '') + '>' +
          escapeHtml(pl.label) + ' — ' + fmtPrice(pl.price) + ' (คงเหลือ ' + s + ' ชิ้น)' +
        '</option>';
      }).join("");

      var modalHtml =
        '<div class="sx-modal inf-modal-popup" role="dialog" aria-modal="true">' +
          '<button type="button" class="sx-modal-close" id="inf-m-close" aria-label="Close">&times;</button>' +
          '<h3 class="sx-m-title">' +
            '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>' +
            '<span>ยืนยันการสั่งซื้อ</span>' +
          '</h3>' +
          '<div class="inf-modal-item-preview">' +
            '<img src="' + escapeHtml(safeImgUrl(product.img, "https://img2.pic.in.th/serifvalopro9a13213f74c94f81.png")) + '" class="inf-modal-item-thumb" alt="' + escapeHtml(product.name) + '">' +
            '<div style="min-width:0;flex:1;">' +
              '<div style="font-size:11px;font-weight:700;color:#a1a1aa;text-transform:uppercase;">' + escapeHtml(product.tag || "VALORANT") + '</div>' +
              '<strong style="font-size:15px;color:#fff;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(product.name) + '</strong>' +
              '<span style="font-size:12px;color:#34d399;">สต็อกแพ็กเกจนี้: ' + planStock + ' ชิ้น</span>' +
            '</div>' +
          '</div>';

      if (!user) {
        var nextParam = encodeURIComponent(location.pathname + "?item=" + encodeURIComponent(product.slug));
        modalHtml +=
          '<div class="inf-modal-err" style="background:rgba(255,255,255,0.04);border-color:rgba(255,255,255,0.15);color:#d4d4d8;text-align:center;padding:16px;">' +
            '<p style="margin:0 0 12px;font-size:14px;color:#fff;">กรุณาเข้าสู่ระบบก่อนทำการสั่งซื้อสินค้า</p>' +
            '<div class="inf-guest-btns">' +
              '<a href="/login/?next=' + nextParam + '" class="inf-btn-white" style="height:40px;font-size:13px;">เข้าสู่ระบบ</a>' +
              '<a href="/register/?next=' + nextParam + '" class="inf-btn-dark" style="height:40px;font-size:13px;">สมัครสมาชิก</a>' +
            '</div>' +
          '</div>';
      } else {
        modalHtml +=
          '<label style="display:block;font-size:12.5px;color:#a1a1aa;margin-bottom:6px;">เลือกแพ็กเกจ / ระยะเวลา:' +
            '<select id="inf-m-plan-sel" class="inf-modal-plan-select">' + plansOptionsHtml + '</select>' +
          '</label>' +
          '<div class="inf-modal-qty-control">' +
            '<span style="font-size:13px;color:#d4d4d8;">จำนวนที่ต้องการสั่งซื้อ:</span>' +
            '<div style="display:flex;align-items:center;gap:10px;">' +
              '<button type="button" class="inf-modal-qty-btn" id="inf-m-qty-min" aria-label="ลดจำนวน"' + (qty <= 1 || isUpdating ? ' disabled' : '') + '>&minus;</button>' +
              '<b id="inf-m-qty-val" style="min-width:24px;text-align:center;font-size:15px;color:#fff;">' + qty + '</b>' +
              '<button type="button" class="inf-modal-qty-btn" id="inf-m-qty-pls" aria-label="เพิ่มจำนวน"' + (qty >= maxQty || isUpdating ? ' disabled' : '') + '>+</button>' +
            '</div>' +
          '</div>' +
          '<div class="inf-modal-summary-box">' +
            '<div class="inf-modal-summary-row"><span>ราคาต่อหน่วย:</span><span>' + fmtPrice(curPlan ? curPlan.price : 0) + '</span></div>' +
            (modalDiscountThb > 0
              ? '<div class="inf-modal-summary-row"><span>ส่วนลด (' + escapeHtml(state.discountCode) + '):</span><span style="color:#34d399;">-' + moneyFull(modalDiscountThb) + '</span></div>'
              : '') +
            '<div class="inf-modal-summary-row"><span>ยอดเงินในบัญชีของคุณ:</span><span style="color:' + (userBalance < totalCost ? '#f87171' : '#34d399') + ';">' + moneyFull(userBalance) + '</span></div>' +
            '<div class="inf-modal-summary-row" style="padding-top:8px;border-top:1px solid rgba(255,255,255,0.08);font-size:14px;"><strong style="color:#fff;">ยอดรวมที่ต้องชำระ:</strong><strong style="color:#34d399;font-size:16px;">' + moneyFull(totalCost) + '</strong></div>' +
          '</div>' +
          '<div id="inf-m-buy-err" class="inf-modal-err" hidden></div>' +
          '<div style="display:flex;flex-direction:column;gap:8px;">' +
            (isUpdating
              ? '<button type="button" class="inf-btn-white" style="width:100%;height:46px;" disabled>สินค้ากำลังปิดอัปเดตชั่วคราว</button>'
              : (planStock <= 0
                  ? '<button type="button" class="inf-btn-white" style="width:100%;height:46px;" disabled>แพ็กเกจนี้สินค้าหมดชั่วคราว</button>'
                  : (hasEnoughBalance
                      ? '<button type="button" class="inf-btn-white" id="inf-m-confirm-btn" style="width:100%;height:46px;font-size:15px;font-weight:700;">ชำระเงินและรับคีย์ทันที (' + moneyFull(totalCost) + ')</button>'
                      : '<a href="/account/" class="inf-btn-white" style="width:100%;height:46px;font-size:14px;background:#ef4444;color:#fff!important;">ยอดเงินไม่พอ (ขาดอีก ' + moneyFull(totalCost - userBalance) + ') — เติมเงิน</a>'
                    )
                )
            ) +
          '</div>';
      }

      modalHtml += '</div>';
      backdrop.innerHTML = modalHtml;

      var closeBtn = backdrop.querySelector("#inf-m-close");
      if (closeBtn) {
        closeBtn.addEventListener("click", closePopupModal);
      }

      if (user) {
        var planSel = backdrop.querySelector("#inf-m-plan-sel");
        if (planSel) {
          planSel.addEventListener("change", function () {
            curIdx = parseInt(this.value, 10) || 0;
            state.selectedPlanIdx = curIdx;
            if (state.discountCode) {
              validateDiscountForProduct(product, plans[curIdx], qty, state.discountCode).then(updateModalContent);
            } else {
              updateModalContent();
            }
            state.orderQty = qty;
          });
        }
        var btnMin = backdrop.querySelector("#inf-m-qty-min");
        var btnPls = backdrop.querySelector("#inf-m-qty-pls");
        if (btnMin) {
          btnMin.addEventListener("click", function () {
            if (qty > 1) {
              qty--;
              state.orderQty = qty;
              if (state.discountCode) {
                validateDiscountForProduct(product, plans[curIdx], qty, state.discountCode).then(updateModalContent);
              } else {
                updateModalContent();
              }
            }
          });
        }
        if (btnPls) {
          btnPls.addEventListener("click", function () {
            qty++;
            state.orderQty = qty;
            if (state.discountCode) {
              validateDiscountForProduct(product, plans[curIdx], qty, state.discountCode).then(updateModalContent);
            } else {
              updateModalContent();
            }
          });
        }
        var btnConfirm = backdrop.querySelector("#inf-m-confirm-btn");
        if (btnConfirm) {
          btnConfirm.addEventListener("click", function () {
            executePurchaseInsideModal(product, curPlan, qty, btnConfirm, backdrop);
          });
        }
      }
    }

    updateModalContent();
    document.body.style.overflow = "hidden";

    function closePopupModal() {
      backdrop.remove();
      document.removeEventListener("keydown", onEscKey);
      document.body.style.overflow = "";
    }

    function onEscKey(e) {
      if (e.key === "Escape") {
        closePopupModal();
      }
    }
    document.addEventListener("keydown", onEscKey);
    backdrop.addEventListener("click", function (e) {
      if (e.target === backdrop) {
        closePopupModal();
      }
    });
    backdrop._closeModal = closePopupModal;
    document.body.appendChild(backdrop);
  }

  function executePurchaseInsideModal(product, plan, qty, btn, backdrop) {
    var errBox = backdrop.querySelector("#inf-m-buy-err");
    if (errBox) errBox.hidden = true;
    btn.disabled = true;
    var origText = btn.textContent;
    btn.textContent = "กำลังดำเนินการสั่งซื้อ...";

    fetch("/api/orders", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        product: product.slug || product.id,
        plan: plan.label,
        quantity: qty,
        discountCode: state.discountOk && state.discountCode ? state.discountCode : undefined,
      }),
    })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (!r.ok) throw j;
          return j;
        });
      })
      .then(function (order) {
        if (typeof backdrop._closeModal === "function") {
          backdrop._closeModal();
        } else {
          backdrop.remove();
          document.body.style.overflow = "";
        }
        state.discountCode = "";
        state.discountResult = null;
        state.discountMsg = "";
        state.discountOk = false;
        if (window.XenaryFirebase && typeof window.XenaryFirebase.syncOrderToFirestore === "function") {
          window.XenaryFirebase.syncOrderToFirestore(order).catch(function () {});
        }
        document.dispatchEvent(new Event("xn:auth"));
        Promise.all([load(), fetchCurrentUser()]).then(function () {
          var updatedProd = state.products.find(function (x) { return x.slug === product.slug; }) || product;
          renderCategories();
          filterAndRenderProducts();
          renderProductDetailView(updatedProd);
          showReceiptModal(order, updatedProd);
        });
      })
      .catch(function (e) {
        btn.disabled = false;
        btn.textContent = origText;
        if (errBox) {
          errBox.hidden = false;
          errBox.textContent = (e && e.message) || "สั่งซื้อไม่สำเร็จ กรุณาตรวจสอบยอดเงินแล้วลองใหม่อีกครั้ง";
        }
      });
  }

  function executeDirectPurchase(product, plan, qty, btn) {
    var errBox = document.getElementById("inf-buy-error");
    if (errBox) errBox.hidden = true;
    btn.disabled = true;
    var origText = btn.textContent;
    btn.textContent = "กำลังดำเนินการสั่งซื้อ...";

    fetch("/api/orders", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        product: product.slug || product.id,
        plan: plan.label,
        quantity: qty,
        discountCode: state.discountOk && state.discountCode ? state.discountCode : undefined,
      }),
    })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (!r.ok) throw j;
          return j;
        });
      })
      .then(function (order) {
        state.discountCode = "";
        state.discountResult = null;
        state.discountMsg = "";
        state.discountOk = false;
        document.dispatchEvent(new Event("xn:auth"));
        Promise.all([load(), fetchCurrentUser()]).then(function () {
          var updatedProd = state.products.find(function (x) { return x.slug === product.slug; }) || product;
          renderCategories();
          filterAndRenderProducts();
          renderProductDetailView(updatedProd);
          showReceiptModal(order, updatedProd);
        });
      })
      .catch(function (e) {
        btn.disabled = false;
        btn.textContent = origText;
        if (errBox) {
          errBox.hidden = false;
          errBox.textContent = (e && e.message) || "สั่งซื้อไม่สำเร็จ กรุณาตรวจสอบยอดเงินแล้วลองใหม่อีกครั้ง";
        }
      });
  }

  function showReceiptModal(order, product) {
    var old = document.getElementById("sx-checkout-modal-root");
    if (old) old.remove();

    var backdrop = document.createElement("div");
    backdrop.id = "sx-checkout-modal-root";
    backdrop.className = "sx-modal-backdrop";

    var keysHtml = "";
    if (Array.isArray(order.keys) && order.keys.length) {
      keysHtml =
        '<div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--sx-border);">' +
          '<div style="font-size:12px;color:#34d399;margin-bottom:6px;font-weight:600;">คีย์สินค้าของคุณ (สามารถดูย้อนหลังได้ในหน้าบัญชี):</div>' +
          order.keys
            .map(function (kv) {
              return '<div style="background:rgba(16,185,129,0.12);border:1px solid rgba(16,185,129,0.3);color:#fff;padding:8px 10px;border-radius:8px;font-family:monospace;font-size:13px;margin-bottom:4px;word-break:break-all;">' + escapeHtml(kv) + '</div>';
            })
            .join("") +
        '</div>';
    }
    var rawDlUrl = String(order.download_url || (order.product && order.product.download_url) || product.download_url || "").trim();
    var dlUrl = /^(https?:\/\/|\/(?!\/))/i.test(rawDlUrl) ? rawDlUrl : "";
    var dlHtml = dlUrl
      ? '<a href="' + escapeHtml(dlUrl) + '" target="_blank" rel="noopener noreferrer" class="sx-m-submit" style="margin-bottom:8px;background:#10b981;color:#000!important;">ดาวน์โหลดไฟล์ / โปรแกรม (Download)</a>'
      : "";

    var discountReceiptRow = order.discount_code && Number(order.discount_amount) > 0
      ? '<div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px"><span style="color:var(--sx-muted)">ส่วนลด (' + escapeHtml(order.discount_code) + ')</span><span style="color:#34d399">-' + moneyFull(order.discount_amount) + '</span></div>'
      : "";

    backdrop.innerHTML =
      '<div class="sx-modal" role="dialog" aria-modal="true" style="text-align:center">' +
        '<button type="button" class="sx-modal-close" id="sx-m-close" aria-label="Close">&times;</button>' +
        '<h3 class="sx-m-title" style="justify-content:center">สั่งซื้อสำเร็จ</h3>' +
        '<p class="sx-m-sub">ชำระเงินและจัดส่งคีย์สินค้าเรียบร้อยแล้ว</p>' +
        '<div class="sx-m-box" style="text-align:left">' +
          '<div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px"><span style="color:var(--sx-muted)">เลขที่ออเดอร์</span><strong>' + escapeHtml(order.id) + '</strong></div>' +
          '<div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px"><span style="color:var(--sx-muted)">สินค้า</span><span>' + escapeHtml(order.product.name) + ' &middot; ' + escapeHtml(order.plan.label) + ' &times; ' + order.quantity + '</span></div>' +
          discountReceiptRow +
          '<div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px"><span style="color:var(--sx-muted)">ยอดชำระ</span><strong>' + moneyFull(order.total) + '</strong></div>' +
          '<div style="display:flex;justify-content:space-between;font-size:13px"><span style="color:var(--sx-muted)">ยอดคงเหลือ</span><span>' + moneyFull(order.balance) + '</span></div>' +
          keysHtml +
        '</div>' +
        dlHtml +
        '<a class="sx-m-submit" id="sx-m-view-orders" href="/account/?tab=orders">ดูคีย์และประวัติการสั่งซื้อในบัญชีของฉัน</a>' +
      '</div>';

    document.body.style.overflow = "hidden";
    function closeReceipt() {
      backdrop.remove();
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onEscReceipt);
    }
    function onEscReceipt(e) {
      if (e.key === "Escape") closeReceipt();
    }
    document.addEventListener("keydown", onEscReceipt);

    var closeBtn = backdrop.querySelector("#sx-m-close");
    if (closeBtn) closeBtn.onclick = closeReceipt;

    var viewOrdersBtn = backdrop.querySelector("#sx-m-view-orders");
    if (viewOrdersBtn) viewOrdersBtn.onclick = closeReceipt;

    backdrop.onclick = function (e) { if (e.target === backdrop) closeReceipt(); };
    document.body.appendChild(backdrop);
  }

  /* ================================================================
     5. BOOT SEQUENCE & POPSTATE SUPPORT
     ================================================================ */
  function boot() {
    loadSummary();
    Promise.all([load(), fetchCurrentUser()]).then(function () {
      renderCategories();
      renderCategoryTabs();
      renderLatestOrders();
      filterAndRenderProducts();
      bindCategoryTabs();

      var searchInput = document.getElementById("sx-search-input");
      if (searchInput && !searchInput.dataset.bound) {
        searchInput.dataset.bound = "1";
        searchInput.addEventListener("input", function (e) {
          state.searchQuery = e.target.value;
          filterAndRenderProducts();
        });
      }


      var itemParam = new URLSearchParams(location.search).get("item");
      if (itemParam) {
        openProductDetail(itemParam, false);
      } else {
        setStorefrontVisibility(true);
      }
    });
  }

  window.addEventListener("popstate", function () {
    if (!document.getElementById("sx-product-grid")) return;
    var itemParam = new URLSearchParams(location.search).get("item");
    if (itemParam) {
      openProductDetail(itemParam, false);
    } else {
      closeProductDetail(false);
    }
  });

  document.addEventListener("xn:auth", function () {
    fetchCurrentUser().then(function () {
      if (state.activeProductSlug) {
        var p = state.products.find(function (x) { return x.slug === state.activeProductSlug; });
        if (p) renderProductDetailView(p);
      }
    });
  });

  window.__xenary_init_shop = boot;
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();

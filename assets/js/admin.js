
(function () {
  "use strict";

  var currentTab = "dashboard";
  var cachedProducts = [];
  var cachedOrders = [];
  var cachedUsers = [];
  var balanceModalMode = "add";

  function $(id) { return document.getElementById(id); }
  function on(id, ev, fn) {
    var el = $(id);
    if (el) el.addEventListener(ev, fn);
  }
  function getKey() {
    return sessionStorage.getItem("xn_admin") || "";
  }
  function setKey(k) {
    try { localStorage.removeItem("xn_admin"); } catch (e) {}
    if (k) {
      sessionStorage.setItem("xn_admin", k);
    } else {
      sessionStorage.removeItem("xn_admin");
    }
  }
  function headers() {
    return {
      "Content-Type": "application/json",
      "x-admin-key": getKey(),
    };
  }

  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function safeUrl(rawUrl, allowMailTel) {
    var u = String(rawUrl || "").trim();
    if (!u || /^\/\//.test(u)) return "";
    if (/^(https?:\/\/|\/)/i.test(u)) return u;
    if (allowMailTel && /^(mailto:|tel:)/i.test(u)) return u;
    return "";
  }

  function money(v) {
    var n = Number(v) || 0;
    return "฿" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function when(ts) {
    if (!ts) return "-";
    var d = new Date(ts);
    if (isNaN(d.getTime())) return String(ts);
    return d.toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" });
  }

  function msg(el, text, isOk) {
    if (!el) return;
    el.textContent = text || "";
    el.className = "xn-msg" + (isOk ? " ok" : "");
  }

  async function api(path, opts) {
    opts = opts || {};
    opts.credentials = opts.credentials || "include";
    opts.headers = Object.assign(headers(), opts.headers || {});
    var res = await fetch(path, opts);
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok) {
      var err = new Error(data.message || data.error || ("HTTP " + res.status));
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  // --- Auth / Lock Screen ---
  async function checkAuth() {
    var key = getKey();
    if (key) {
      try {
        await api("/api/admin/stats");
        $("adm-login-card").hidden = true;
        $("adm-main-panel").hidden = false;
        return true;
      } catch (e) {
        if (e.status === 403 || e.status === 401) {
          setKey("");
        }
      }
    }
    try {
      var me = await fetch("/api/auth/me", { cache: "no-store", credentials: "include" }).then(function (r) { return r.json(); });
      if (me.user && me.user.role === "admin") {
        $("adm-login-card").hidden = true;
        $("adm-main-panel").hidden = false;
        return true;
      }
    } catch (e) {}

    $("adm-login-card").hidden = false;
    $("adm-main-panel").hidden = true;
    return false;
  }

  // --- TAB NAVIGATION & SCROLL CONTROLS ---
  function initTabs() {
    var btns = document.querySelectorAll(".adm-nav-btn");
    btns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var tab = btn.dataset.tab;
        switchTab(tab);
        btn.scrollIntoView({ inline: "nearest", behavior: "smooth", block: "nearest" });
      });
    });

    var navBar = $("adm-nav-bar");
    var btnLeft = $("adm-scroll-left");
    var btnRight = $("adm-scroll-right");

    function updateScrollState() {
      if (!navBar || !btnLeft || !btnRight) return;
      var max = navBar.scrollWidth - navBar.clientWidth;
      btnLeft.classList.toggle("disabled", navBar.scrollLeft <= 5);
      btnRight.classList.toggle("disabled", navBar.scrollLeft >= max - 5);
    }

    if (btnLeft && navBar) {
      btnLeft.addEventListener("click", function () {
        navBar.scrollBy({ left: -260, behavior: "smooth" });
        setTimeout(updateScrollState, 250);
      });
    }
    if (btnRight && navBar) {
      btnRight.addEventListener("click", function () {
        navBar.scrollBy({ left: 260, behavior: "smooth" });
        setTimeout(updateScrollState, 250);
      });
    }
    if (navBar) {
      navBar.addEventListener("scroll", updateScrollState, { passive: true });
      navBar.addEventListener("wheel", function (e) {
        if (e.deltaY !== 0 && Math.abs(e.deltaX) < 5) {
          e.preventDefault();
          navBar.scrollLeft += e.deltaY;
          updateScrollState();
        }
      }, { passive: false });
      window.addEventListener("resize", updateScrollState);
      setTimeout(updateScrollState, 100);
    }

    on("dash-go-keys", "click", function () { switchTab("keys"); });
    on("dash-go-orders", "click", function () { switchTab("orders"); });
  }

  function switchTab(tab) {
    currentTab = tab;
    document.querySelectorAll(".adm-nav-btn").forEach(function (b) {
      b.classList.toggle("active", b.dataset.tab === tab);
    });
    document.querySelectorAll(".adm-tab-pane").forEach(function (p) {
      p.hidden = p.id !== "pane-" + tab;
    });

    if (tab === "dashboard") loadStats();
    else if (tab === "products") loadProducts();
    else if (tab === "keys") { populateKeyProductDropdowns().then(loadKeys); }
    else if (tab === "topups") { loadPromptPay(); loadManualTopups(); }
    else if (tab === "orders") loadOrders();
    else if (tab === "users") loadUsers();
    else if (tab === "coupons") loadCoupons();
    else if (tab === "news") loadNews();
    else if (tab === "channels") loadChannels();
    else if (tab === "settings") loadSettings();
  }

  // ================================================================
  // 1. DASHBOARD STATS & QUICK OVERVIEW
  // ================================================================
  async function loadStats() {
    try {
      var st = await api("/api/admin/stats");
      $("st-rev-today").textContent = money(st.revenue_today || 0);
      $("st-rev-month").textContent = money(st.revenue_month || 0);
      $("st-rev-total").textContent = money(st.revenue_total || 0);
      $("st-orders-paid").textContent = (st.paid_orders_count || 0) + " รายการ";
      $("st-users").textContent = (st.total_users || 0) + " บัญชี";
      $("st-topups-pending").textContent = (st.pending_topups_count || 0) + " รายการ";
      $("st-keys-remain").textContent = (st.unused_keys_count || 0) + " คีย์";
    } catch (e) {
      console.warn("Stats load error:", e);
    }

    // Load product stock breakdown & recent orders on dashboard
    var stockBox = $("dash-product-stock");
    if (stockBox) {
      try {
        var pd = await api("/api/admin/products");
        cachedProducts = pd.products || [];
        if (!cachedProducts.length) {
          stockBox.innerHTML = '<div class="adm-empty">ยังไม่มีสินค้าในระบบ</div>';
        } else {
          stockBox.innerHTML = "";
          cachedProducts.forEach(function (p) {
            var row = document.createElement("div");
            row.className = "adm-item-card";
            row.style.padding = "10px 14px";
            var plansSummary = (p.plans || []).map(function (pl) {
              return esc(pl.label) + ": <b>" + (pl.stock ?? 0) + "</b>";
            }).join(" &middot; ");
            row.innerHTML =
              '<div class="adm-item-info" style="min-width:180px;">' +
                '<b>' + esc(p.name) + '</b> <span class="adm-tag">' + esc(p.tag || "General") + '</span>' +
                '<div class="adm-sub">คงเหลือรวม: <span class="adm-highlight">' + (p.stock ?? 0) + ' คีย์</span>' + (plansSummary ? " (" + plansSummary + ")" : "") + '</div>' +
              '</div>' +
              '<div class="adm-actions">' +
                '<button type="button" class="adm-btn sm ok">+ เติมคีย์</button>' +
              '</div>';
            row.querySelector("button").addEventListener("click", function () {
              jumpToProductKeys(p.slug, "", true);
            });
            stockBox.appendChild(row);
          });
        }
      } catch (e) {}
    }

    var ordBox = $("dash-recent-orders");
    if (ordBox) {
      try {
        var od = await api("/api/admin/orders");
        var list = (od.orders || []).slice(0, 5);
        if (!list.length) {
          ordBox.innerHTML = '<div class="adm-empty">ยังไม่มีคำสั่งซื้อ</div>';
        } else {
          ordBox.innerHTML = "";
          list.forEach(function (o) {
            var pName = (o.product && o.product.name) ? o.product.name : (o.product_name || "สินค้า");
            var planLbl = (o.plan && o.plan.label) ? o.plan.label : "";
            var row = document.createElement("div");
            row.className = "adm-item-card";
            row.style.padding = "10px 14px";
            row.innerHTML =
              '<div class="adm-item-info" style="min-width:180px;">' +
                '<b>' + esc(pName) + (planLbl ? " (" + esc(planLbl) + ")" : "") + '</b>' +
                '<div class="adm-sub">ลูกค้า: ' + esc(o.user || "Guest") + ' &middot; ' + when(o.createdAt || o.created_at) + '</div>' +
              '</div>' +
              '<div class="adm-item-amount">' + money(o.total) + '</div>';
            ordBox.appendChild(row);
          });
        }
      } catch (e) {}
    }
  }

  function jumpToProductKeys(slug, planLabel, focusAddForm) {
    switchTab("keys");
    setTimeout(function () {
      var selAdd = $("key-product-id");
      var selFilter = $("filter-key-product");
      if (selAdd && slug) {
        selAdd.value = slug;
        updateKeyPlanOptions();
        if (planLabel && $("key-plan-label")) {
          $("key-plan-label").value = planLabel;
        }
      }
      if (selFilter) {
        selFilter.value = slug || "";
        updateFilterPlanOptions();
        loadKeys();
      }
      if (focusAddForm && $("key-bulk-text")) {
        $("key-bulk-text").focus();
      }
    }, 150);
  }

  // ================================================================
  // 2. PRODUCTS MANAGEMENT + DYNAMIC PRICING PLANS + EDIT MODE
  // ================================================================
  function addPlanRow(labelVal, priceVal) {
    var container = $("prod-plan-rows");
    if (!container) return;
    var row = document.createElement("div");
    row.className = "adm-plan-row";
    row.style.cssText = "display:grid;grid-template-columns:1.2fr 1fr auto;gap:8px;align-items:center;";
    row.innerHTML =
      '<input type="text" class="plan-label-input" placeholder="ชื่อแพ็กเกจ (เช่น 1 วัน, 7 วัน, 30 วัน, ถาวร)" value="' + esc(labelVal || "") + '" required style="background:rgba(0,0,0,.45);border:1px solid var(--sx-border);border-radius:9px;color:#fff;padding:10px 12px;font:inherit;font-size:13px;">' +
      '<div class="adm-plan-price-wrap">' +
        '<span class="cur-prefix">฿</span>' +
        '<input type="number" class="plan-price-input" min="1" step="0.5" placeholder="ราคาขาย เช่น 150" value="' + (priceVal != null && priceVal !== "" ? esc(priceVal) : "") + '" required style="background:rgba(0,0,0,.45);border:1px solid var(--sx-border);border-radius:9px;color:#fff;padding:10px 12px;font:inherit;font-size:13px;">' +
      '</div>' +
      '<button type="button" class="adm-btn sm danger btn-remove-plan" title="ลบแพ็กเกจนี้" style="padding:10px 14px;">ลบ</button>';

    row.querySelector(".btn-remove-plan").addEventListener("click", function () {
      if (container.querySelectorAll(".adm-plan-row").length <= 1) {
        alert("ต้องมีแพ็กเกจราคาอย่างน้อย 1 รายการ");
        return;
      }
      row.remove();
    });
    container.appendChild(row);
  }

  function setPlanRows(plans) {
    var container = $("prod-plan-rows");
    if (!container) return;
    container.innerHTML = "";
    if (Array.isArray(plans) && plans.length) {
      plans.forEach(function (pl) {
        addPlanRow(pl.label, pl.price);
      });
    } else {
      addPlanRow("1 วัน", 59);
      addPlanRow("7 วัน", 159);
      addPlanRow("30 วัน", 359);
      addPlanRow("ถาวร (Lifetime)", 999);
    }
  }

  function initProductFormControls() {
    var tagSelect = $("prod-tag-select");
    var tagCustomWrap = $("prod-tag-custom-wrap");
    if (tagSelect && tagCustomWrap) {
      tagSelect.addEventListener("change", function () {
        tagCustomWrap.hidden = tagSelect.value !== "custom";
      });
    }

    on("btn-add-plan-row", "click", function () { addPlanRow("", ""); });
    on("btn-plan-single", "click", function () { setPlanRows([{ label: "มาตรฐาน", price: 150 }]); });
    on("btn-plan-preset", "click", function () {
      setPlanRows([
        { label: "1 วัน", price: 59 },
        { label: "7 วัน", price: 159 },
        { label: "30 วัน", price: 359 },
        { label: "ถาวร (Lifetime)", price: 999 },
      ]);
    });
    on("btn-cancel-edit-prod", "click", function () { resetProductForm(); });

    setPlanRows([
      { label: "1 วัน", price: 59 },
      { label: "7 วัน", price: 159 },
      { label: "30 วัน", price: 359 },
      { label: "ถาวร (Lifetime)", price: 999 },
    ]);
  }

  function resetProductForm() {
    $("prod-edit-original-slug").value = "";
    $("prod-form-title").textContent = "เพิ่มสินค้าใหม่เข้าหน้าร้าน";
    $("btn-submit-product").textContent = "บันทึกและวางขายสินค้า";
    $("btn-cancel-edit-prod").hidden = true;
    $("prod-name").value = "";
    $("prod-slug").value = "";
    $("prod-tag-select").value = "Valorant";
    $("prod-tag-custom-wrap").hidden = true;
    $("prod-tag-custom").value = "";
    $("prod-img").value = "https://img2.pic.in.th/serifaimcolor3.png";
    if ($("prod-download-url")) $("prod-download-url").value = "";
    $("prod-desc").value = "";
    $("prod-bestseller").checked = false;
    if ($("prod-updating")) $("prod-updating").checked = false;
    if ($("prod-update-note")) $("prod-update-note").value = "";
    setPlanRows([
      { label: "1 วัน", price: 59 },
      { label: "7 วัน", price: 159 },
      { label: "30 วัน", price: 359 },
      { label: "ถาวร (Lifetime)", price: 999 },
    ]);
    msg($("msg-product"), "");
  }

  function enterEditProductMode(p) {
    $("prod-edit-original-slug").value = p.slug;
    $("prod-form-title").textContent = "แก้ไขข้อมูลสินค้า: " + p.name;
    $("btn-submit-product").textContent = "บันทึกการแก้ไขสินค้า";
    $("btn-cancel-edit-prod").hidden = false;

    $("prod-name").value = p.name || "";
    $("prod-slug").value = p.slug || "";

    var knownTags = ["Valorant", "FiveM", "Account", "Spoofer"];
    if (knownTags.indexOf(p.tag) !== -1) {
      $("prod-tag-select").value = p.tag;
      $("prod-tag-custom-wrap").hidden = true;
      $("prod-tag-custom").value = "";
    } else {
      $("prod-tag-select").value = "custom";
      $("prod-tag-custom-wrap").hidden = false;
      $("prod-tag-custom").value = p.tag || "General";
    }

    $("prod-img").value = p.img || "";
    if ($("prod-download-url")) $("prod-download-url").value = p.download_url || "";
    $("prod-desc").value = p.desc || "";
    $("prod-bestseller").checked = Boolean(p.bestSeller);
    if ($("prod-updating")) $("prod-updating").checked = Boolean(p.updating || p.status_mode === "updating");
    if ($("prod-update-note")) $("prod-update-note").value = p.update_note || "";

    setPlanRows(p.plans && p.plans.length ? p.plans : [{ label: "มาตรฐาน", price: p.from || 99 }]);
    msg($("msg-product"), "กำลังแก้ไขสินค้า '" + p.name + "' — ปรับข้อมูลด้านบนแล้วกดบันทึกการแก้ไขได้ทันที", true);
    $("prod-form-card").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function loadProducts() {
    var box = $("list-products");
    if (!box) return;
    box.innerHTML = '<div class="adm-loading">กำลังโหลดรายการสินค้า...</div>';
    try {
      var d = await api("/api/admin/products");
      cachedProducts = d.products || [];
      box.innerHTML = "";
      if (!cachedProducts.length) {
        box.innerHTML = '<div class="adm-empty">ยังไม่มีสินค้าในร้านค้า กรุณาเพิ่มสินค้าด้านบน</div>';
        return;
      }
      cachedProducts.forEach(function (p) {
        var el = document.createElement("div");
        el.className = "adm-item-card";
        var plansHtml = (p.plans || [])
          .map(function (x) {
            var kCount = x.stock != null ? x.stock : 0;
            return '<span style="display:inline-block;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.14);border-radius:6px;padding:3px 9px;margin:2px 4px 2px 0;font-size:12px;color:#fff;">' +
              esc(x.label) + ': <b style="color:#34d399;">' + money(x.price) + '</b> <small style="color:#a1a1aa;">(คีย์: ' + kCount + ')</small></span>';
          })
          .join("");

        var safeImg = safeUrl(p.img);
        var safeDl = safeUrl(p.download_url);
        var isUpdating = Boolean(p.updating || p.status_mode === "updating");
        el.innerHTML =
          '<div style="display:flex;align-items:flex-start;gap:14px;flex:1;min-width:260px;">' +
            (safeImg ? '<img src="' + esc(safeImg) + '" alt="" width="64" height="64" style="border-radius:10px;object-fit:cover;border:1px solid var(--sx-border);background:#111;flex-shrink:0;">' : "") +
            '<div class="adm-item-info" style="flex:1;">' +
              '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">' +
                '<b style="font-size:15px;">' + esc(p.name) + '</b>' +
                '<span class="adm-tag">' + esc(p.tag || "General") + '</span>' +
                (isUpdating
                  ? '<span class="adm-badge warning" style="text-transform:none;">กำลังปิดอัปเดต' + (p.update_note ? " (" + esc(p.update_note) + ")" : "") + '</span>'
                  : '<span class="adm-badge ok" style="text-transform:none;">เปิดขายปกติ</span>') +
                (p.bestSeller ? '<span class="adm-tag" style="background:rgba(239,68,68,0.16);color:#f87171;border-color:rgba(239,68,68,0.3);">BEST SELLER</span>' : "") +
                (safeDl ? '<a href="' + esc(safeDl) + '" target="_blank" rel="noopener noreferrer" class="adm-tag" style="background:rgba(16,185,129,0.14);color:#34d399;border-color:rgba(16,185,129,0.3);text-decoration:none;">มีลิงก์ดาวน์โหลด</a>' : "") +
              '</div>' +
              '<div class="adm-sub" style="margin-top:4px;">' +
                'รหัสสินค้า: <code>' + esc(p.slug) + '</code> &middot; คีย์คงเหลือพร้อมขาย: <span class="adm-highlight">' + (p.stock ?? 0) + '</span> คีย์ &middot; ขายแล้ว: ' + (p.sold || 0) + ' ครั้ง' +
                '<div style="margin-top:6px;">' + plansHtml + '</div>' +
                (p.desc ? '<div style="color:#a1a1aa;margin-top:4px;font-size:12px;">' + esc(p.desc) + '</div>' : "") +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="adm-actions" style="display:flex;gap:8px;flex-wrap:wrap;">' +
            '<button type="button" class="adm-btn sm ' + (isUpdating ? "ok" : "") + '" data-act="toggle-update" style="' + (!isUpdating ? "border-color:rgba(251,191,36,0.35);color:#fbbf24;background:rgba(251,191,36,0.1);" : "") + '">' +
              (isUpdating ? "เปิดขายปกติ" : "ปิดอัปเดตสินค้า") +
            '</button>' +
            '<button type="button" class="adm-btn sm primary" data-act="edit">แก้ไขข้อมูล</button>' +
            '<button type="button" class="adm-btn sm" data-act="view-keys">ดูคลังคีย์ (' + (p.stock ?? 0) + ')</button>' +
            '<button type="button" class="adm-btn sm ok" data-act="add-key">+ เพิ่มคีย์สต็อก</button>' +
            '<button type="button" class="adm-btn sm danger" data-act="del">ลบสินค้า</button>' +
          '</div>';

        el.querySelector('[data-act="toggle-update"]').addEventListener("click", async function () {
          var btn = this;
          btn.disabled = true;
          try {
            await api("/api/admin/products/" + encodeURIComponent(p.slug) + "/toggle-update", {
              method: "POST",
              body: JSON.stringify({ updating: !isUpdating }),
            });
            loadProducts();
          } catch (err) {
            alert("เปลี่ยนสถานะไม่สำเร็จ: " + err.message);
            btn.disabled = false;
          }
        });
        el.querySelector('[data-act="edit"]').addEventListener("click", function () {
          enterEditProductMode(p);
        });
        el.querySelector('[data-act="view-keys"]').addEventListener("click", function () {
          jumpToProductKeys(p.slug, "", false);
        });
        el.querySelector('[data-act="add-key"]').addEventListener("click", function () {
          jumpToProductKeys(p.slug, "", true);
        });
        el.querySelector('[data-act="del"]').addEventListener("click", function () {
          if (confirm("ยืนยันการลบสินค้า '" + p.name + "' ออกจากร้านค้า?")) {
            deleteProductItem(p.slug);
          }
        });
        box.appendChild(el);
      });
    } catch (e) {
      box.innerHTML = '<div class="adm-error">โหลดรายการสินค้าไม่สำเร็จ: ' + esc(e.message) + '</div>';
    }
  }

  async function deleteProductItem(slug) {
    try {
      await api("/api/admin/products/" + encodeURIComponent(slug), { method: "DELETE" });
      if ($("prod-edit-original-slug").value === slug) {
        resetProductForm();
      }
      loadProducts();
      loadStats();
    } catch (e) {
      alert("ลบสินค้าไม่สำเร็จ: " + e.message);
    }
  }

  on("f-add-product", "submit", async function (e) {
    e.preventDefault();
    var origSlug = $("prod-edit-original-slug").value.trim();
    var name = $("prod-name").value.trim();
    var slug = $("prod-slug").value.trim();
    var tagSel = $("prod-tag-select").value;
    var tag = tagSel === "custom" ? ($("prod-tag-custom").value.trim() || "General") : tagSel;
    var img = $("prod-img").value.trim();
    var dlUrl = $("prod-download-url") ? $("prod-download-url").value.trim() : "";
    var desc = $("prod-desc").value.trim();
    var bestSeller = $("prod-bestseller").checked;
    var updating = $("prod-updating") ? $("prod-updating").checked : false;
    var updateNote = $("prod-update-note") ? $("prod-update-note").value.trim() : "";
    var m = $("msg-product");

    var plans = [];
    document.querySelectorAll("#prod-plan-rows .adm-plan-row").forEach(function (row) {
      var lbl = row.querySelector(".plan-label-input").value.trim();
      var prc = Number(row.querySelector(".plan-price-input").value);
      if (lbl && Number.isFinite(prc) && prc > 0) {
        plans.push({ label: lbl, price: prc, per: "/" + lbl });
      }
    });

    if (!plans.length) {
      msg(m, "กรุณาระบุชื่อแพ็กเกจและราคาที่มากกว่า 0 บาท อย่างน้อย 1 รายการ", false);
      return;
    }

    var btn = $("btn-submit-product");
    btn.disabled = true;
    msg(m, "กำลังบันทึกข้อมูลสินค้า...");

    try {
      var method = origSlug ? "PUT" : "POST";
      var url = origSlug ? ("/api/admin/products/" + encodeURIComponent(origSlug)) : "/api/admin/products";
      await api(url, {
        method: method,
        body: JSON.stringify({
          originalSlug: origSlug || undefined,
          name: name,
          slug: slug,
          tag: tag,
          img: img,
          download_url: dlUrl,
          desc: desc,
          bestSeller: bestSeller,
          updating: updating,
          status_mode: updating ? "updating" : "normal",
          update_note: updateNote,
          key_based: true,
          plans: plans,
        }),
      });
      resetProductForm();
      msg(m, (origSlug ? "อัปเดตข้อมูลสินค้า '" : "เพิ่มสินค้าใหม่ '") + name + "' เรียบร้อยแล้ว! (กด '+ เพิ่มคีย์สต็อก' เพื่อเติมคีย์พร้อมขายได้เลย)", true);
      await loadProducts();
      loadStats();
    } catch (err) {
      msg(m, "บันทึกไม่สำเร็จ: " + err.message, false);
    } finally {
      btn.disabled = false;
    }
  });

  // ================================================================
  // 3. PRODUCT KEYS (Grouped by Product & Plan + Filter + Edit Modal)
  // ================================================================
  async function populateKeyProductDropdowns() {
    try {
      var d = await api("/api/admin/products");
      cachedProducts = d.products || [];
    } catch (e) {}

    var selAdd = $("key-product-id");
    var selFilter = $("filter-key-product");
    var prevAdd = selAdd ? selAdd.value : "";
    var prevFilter = selFilter ? selFilter.value : "";

    if (selAdd) {
      selAdd.innerHTML = '<option value="">-- เลือกสินค้าที่ต้องการเพิ่มคีย์ --</option>';
      cachedProducts.forEach(function (p) {
        var opt = document.createElement("option");
        opt.value = p.slug;
        opt.textContent = p.name + " (" + p.slug + ") — คงเหลือ " + (p.stock ?? 0) + " คีย์";
        selAdd.appendChild(opt);
      });
      if (prevAdd && cachedProducts.some(function (p) { return p.slug === prevAdd; })) {
        selAdd.value = prevAdd;
      } else if (cachedProducts.length === 1) {
        selAdd.value = cachedProducts[0].slug;
      }
      updateKeyPlanOptions();
    }

    if (selFilter) {
      selFilter.innerHTML = '<option value="">แสดงแยกตามทุกสินค้า (' + cachedProducts.length + ' รายการ)</option>';
      cachedProducts.forEach(function (p) {
        var opt = document.createElement("option");
        opt.value = p.slug;
        opt.textContent = "เฉพาะสินค้า: " + p.name + " (พร้อมขาย " + (p.stock ?? 0) + ")";
        selFilter.appendChild(opt);
      });
      if (prevFilter && cachedProducts.some(function (p) { return p.slug === prevFilter; })) {
        selFilter.value = prevFilter;
      }
      updateFilterPlanOptions();
    }
  }

  function updateKeyPlanOptions() {
    var selProd = $("key-product-id");
    var selPlan = $("key-plan-label");
    if (!selProd || !selPlan) return;
    var slug = selProd.value;
    var prev = selPlan.value;
    selPlan.innerHTML = '<option value="">-- กรุณาเลือกแพ็กเกจ --</option>';
    var prod = cachedProducts.find(function (p) { return p.slug === slug; });
    if (prod && Array.isArray(prod.plans)) {
      prod.plans.forEach(function (pl) {
        var opt = document.createElement("option");
        opt.value = pl.label;
        opt.textContent = "เฉพาะแพ็กเกจ: " + pl.label + " (" + money(pl.price) + ") — คงเหลือ " + (pl.stock ?? 0) + " คีย์";
        selPlan.appendChild(opt);
      });
      if (prev && prod.plans.some(function (pl) { return pl.label === prev; })) {
        selPlan.value = prev;
      }
    }
  }

  function updateFilterPlanOptions() {
    var selFilterProd = $("filter-key-product");
    var selFilterPlan = $("filter-key-plan");
    if (!selFilterPlan) return;
    var slug = selFilterProd ? selFilterProd.value : "";
    var prev = selFilterPlan.value;
    selFilterPlan.innerHTML = '<option value="">ทุกแพ็กเกจ</option>';

    var labelsSet = [];
    var sourceProds = slug
      ? cachedProducts.filter(function (p) { return p.slug === slug; })
      : cachedProducts;

    sourceProds.forEach(function (p) {
      (p.plans || []).forEach(function (pl) {
        if (pl.label && labelsSet.indexOf(pl.label) === -1) {
          labelsSet.push(pl.label);
        }
      });
    });

    labelsSet.forEach(function (lbl) {
      var opt = document.createElement("option");
      opt.value = lbl;
      opt.textContent = "แพ็กเกจ: " + lbl;
      selFilterPlan.appendChild(opt);
    });

    var anyOpt = document.createElement("option");
    anyOpt.value = "__any__";
    anyOpt.textContent = "ไม่ระบุแพ็กเกจ (ใช้ได้ทุกแพ็กเกจ)";
    selFilterPlan.appendChild(anyOpt);

    if (prev && (labelsSet.indexOf(prev) !== -1 || prev === "__any__")) {
      selFilterPlan.value = prev;
    }
  }

  on("key-product-id", "change", updateKeyPlanOptions);
  on("filter-key-product", "change", function () {
    updateFilterPlanOptions();
    loadKeys();
  });
  on("filter-key-plan", "change", loadKeys);
  on("filter-key-status", "change", loadKeys);
  on("filter-key-search", "input", loadKeys);

  on("btn-clear-used-keys", "click", async function () {
    var filterProd = $("filter-key-product") ? $("filter-key-product").value : "";
    var prodObj = cachedProducts.find(function (p) { return p.slug === filterProd; });
    var scopeText = prodObj ? ("ของสินค้า '" + prodObj.name + "'") : "ของทุกสินค้า";
    if (!confirm("ยืนยันการลบคีย์ที่สถานะ 'ขายแล้ว' ทั้งหมด " + scopeText + " ออกจากคลัง?")) return;
    try {
      var q = filterProd ? ("?product_id=" + encodeURIComponent(filterProd)) : "";
      var res = await api("/api/admin/keys/bulk/used" + q, { method: "DELETE" });
      alert("ล้างคีย์ที่ขายแล้วออกจำนวน " + (res.removed || 0) + " คีย์เรียบร้อยแล้ว");
      await populateKeyProductDropdowns();
      loadKeys();
      loadStats();
    } catch (e) {
      alert("ดำเนินการไม่สำเร็จ: " + e.message);
    }
  });

  async function loadKeys() {
    var box = $("list-keys");
    if (!box) return;
    box.innerHTML = '<div class="adm-loading">กำลังโหลดคลังคีย์สินค้า...</div>';
    try {
      var filterProd = $("filter-key-product") ? $("filter-key-product").value : "";
      var filterPlan = $("filter-key-plan") ? $("filter-key-plan").value : "";
      var filterStatus = $("filter-key-status") ? $("filter-key-status").value : "all";
      var searchQ = $("filter-key-search") ? $("filter-key-search").value.trim() : "";

      var params = new URLSearchParams();
      if (filterProd) params.set("product_id", filterProd);
      if (filterPlan) params.set("plan_label", filterPlan);
      if (filterStatus && filterStatus !== "all") params.set("status", filterStatus);
      if (searchQ) params.set("q", searchQ);

      var qs = params.toString() ? ("?" + params.toString()) : "";
      var d = await api("/api/admin/keys" + qs);
      var keysList = d.keys || [];

      box.innerHTML = "";

      // Group keys by product
      var groupsMap = new Map();


      var prodsToShow = filterProd
        ? cachedProducts.filter(function (p) { return p.slug === filterProd; })
        : cachedProducts;

      prodsToShow.forEach(function (p) {
        groupsMap.set(p.slug, {
          slug: p.slug,
          name: p.name,
          tag: p.tag || "General",
          img: p.img || "",
          plans: p.plans || [],
          keys: [],
        });
      });

      keysList.forEach(function (k) {
        var pid = k.product_id || "unknown";
        if (!groupsMap.has(pid)) {
          groupsMap.set(pid, {
            slug: pid,
            name: k.product_name || pid,
            tag: k.product_tag || "General",
            img: k.product_img || "",
            plans: [],
            keys: [],
          });
        }
        groupsMap.get(pid).keys.push(k);
      });

      var groups = Array.from(groupsMap.values());
      // If searching or filtering by plan/status, only show groups that have matching keys (unless a specific product is selected)
      if (searchQ || filterPlan || filterStatus !== "all") {
        groups = groups.filter(function (g) { return g.keys.length > 0 || g.slug === filterProd; });
      }

      if (!groups.length || (keysList.length === 0 && (searchQ || filterPlan || filterStatus !== "all"))) {
        box.innerHTML = '<div class="adm-empty">ไม่พบคีย์สินค้าตามตัวกรองที่เลือก</div>';
        return;
      }

      groups.forEach(function (g) {
        var availCount = g.keys.filter(function (k) { return !k.is_used; }).length;
        var usedCount = g.keys.filter(function (k) { return k.is_used; }).length;

        var groupEl = document.createElement("div");
        groupEl.className = "adm-key-group";

        var headEl = document.createElement("div");
        headEl.className = "adm-key-group-head";
        var safeGroupImg = safeUrl(g.img);
        headEl.innerHTML =
          '<div class="adm-key-group-title">' +
            (safeGroupImg ? '<img src="' + esc(safeGroupImg) + '" alt="" class="adm-key-group-thumb">' : "") +
            '<div>' +
              '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">' +
                '<b style="font-size:16px;color:#fff;">' + esc(g.name) + '</b>' +
                '<span class="adm-tag">' + esc(g.tag) + '</span>' +
                '<code style="font-size:11px;color:#71717a;">' + esc(g.slug) + '</code>' +
              '</div>' +
              '<div style="font-size:12px;color:#a1a1aa;margin-top:3px;">คลิกที่แถบหัวข้อเพื่อพับ/กางรายการคีย์ของสินค้านี้</div>' +
            '</div>' +
          '</div>' +
          '<div class="adm-key-group-meta">' +
            '<span class="adm-key-stat-pill avail">พร้อมขาย ' + availCount + ' คีย์</span>' +
            '<span class="adm-key-stat-pill sold">ขายแล้ว ' + usedCount + ' คีย์</span>' +
            '<button type="button" class="adm-btn sm ok btn-group-add-key">+ เติมคีย์สินค้านี้</button>' +
            (usedCount > 0 ? '<button type="button" class="adm-btn sm danger btn-group-clear-used">ล้างที่ขายแล้ว (' + usedCount + ')</button>' : "") +
          '</div>';

        headEl.addEventListener("click", function (ev) {
          if (ev.target.closest("button")) return;
          groupEl.classList.toggle("collapsed");
        });

        headEl.querySelector(".btn-group-add-key").addEventListener("click", function (ev) {
          ev.stopPropagation();
          var selAdd = $("key-product-id");
          if (selAdd) {
            selAdd.value = g.slug;
            updateKeyPlanOptions();
          }
          if ($("key-bulk-text")) {
            $("key-bulk-text").focus();
            $("f-add-keys").scrollIntoView({ behavior: "smooth", block: "start" });
          }
        });

        var btnClearGroupUsed = headEl.querySelector(".btn-group-clear-used");
        if (btnClearGroupUsed) {
          btnClearGroupUsed.addEventListener("click", async function (ev) {
            ev.stopPropagation();
            if (!confirm("ต้องการลบคีย์ที่ขายแล้วของ '" + g.name + "' จำนวน " + usedCount + " คีย์ใช่หรือไม่?")) return;
            try {
              await api("/api/admin/keys/bulk/used?product_id=" + encodeURIComponent(g.slug), { method: "DELETE" });
              await populateKeyProductDropdowns();
              loadKeys();
              loadStats();
            } catch (err) {
              alert("ลบไม่สำเร็จ: " + err.message);
            }
          });
        }

        var bodyEl = document.createElement("div");
        bodyEl.className = "adm-key-group-body";

        if (!g.keys.length) {
          bodyEl.innerHTML =
            '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 4px;color:#a1a1aa;font-size:13px;flex-wrap:wrap;gap:8px;">' +
              '<span>ยังไม่มีคีย์ในคลังสำหรับสินค้า <b>' + esc(g.name) + '</b></span>' +
              '<button type="button" class="adm-btn sm ok btn-empty-add">+ เพิ่มคีย์เข้าสินค้านี้</button>' +
            '</div>';
          bodyEl.querySelector(".btn-empty-add").addEventListener("click", function () {
            var selAdd = $("key-product-id");
            if (selAdd) {
              selAdd.value = g.slug;
              updateKeyPlanOptions();
            }
            if ($("key-bulk-text")) {
              $("key-bulk-text").focus();
              $("f-add-keys").scrollIntoView({ behavior: "smooth", block: "start" });
            }
          });
        } else {
          // Sub-group keys by plan_label
          var planBuckets = new Map();

          (g.plans || []).forEach(function (pl) {
            if (pl.label && !planBuckets.has(pl.label)) {
              planBuckets.set(pl.label, { label: pl.label, price: pl.price, keys: [] });
            }
          });

          g.keys.forEach(function (k) {
            var pLabel = k.plan_label ? String(k.plan_label) : "__ALL_PLANS__";
            if (!planBuckets.has(pLabel)) {
              planBuckets.set(pLabel, {
                label: k.plan_label ? k.plan_label : "ใช้ได้กับทุกแพ็กเกจ (ไม่ระบุระยะเวลา)",
                price: null,
                keys: [],
              });
            }
            planBuckets.get(pLabel).keys.push(k);
          });

          Array.from(planBuckets.values()).forEach(function (bucket) {
            if (!bucket.keys.length && (filterPlan || searchQ || filterStatus !== "all")) return;

            var bAvail = bucket.keys.filter(function (k) { return !k.is_used; }).length;
            var bUsed = bucket.keys.filter(function (k) { return k.is_used; }).length;

            var planBlock = document.createElement("div");
            planBlock.className = "adm-key-plan-block";

            var rawPlanValue = bucket.label === "ใช้ได้กับทุกแพ็กเกจ (ไม่ระบุระยะเวลา)" ? "" : bucket.label;

            var planHead = document.createElement("div");
            planHead.className = "adm-key-plan-head";
            planHead.innerHTML =
              '<div class="adm-key-plan-name">' +
                '<span>แพ็กเกจ: <b style="color:#fff;">' + esc(bucket.label) + '</b></span>' +
                (bucket.price != null ? '<span class="adm-tag" style="color:#34d399;">' + money(bucket.price) + '</span>' : "") +
              '</div>' +
              '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">' +
                '<span class="adm-badge ' + (bAvail > 0 ? "ok" : "used") + '" style="text-transform:none;">พร้อมขาย ' + bAvail + ' คีย์</span>' +
                (bUsed > 0 ? '<span class="adm-badge used" style="text-transform:none;">ขายแล้ว ' + bUsed + '</span>' : "") +
                '<button type="button" class="adm-btn sm btn-plan-quick-add" style="padding:4px 10px;font-size:11.5px;">+ เติมคีย์แพ็กเกจนี้</button>' +
              '</div>';

            planHead.querySelector(".btn-plan-quick-add").addEventListener("click", function () {
              var selAdd = $("key-product-id");
              if (selAdd) {
                selAdd.value = g.slug;
                updateKeyPlanOptions();
                if ($("key-plan-label")) $("key-plan-label").value = rawPlanValue;
              }
              if ($("key-bulk-text")) {
                $("key-bulk-text").focus();
                $("f-add-keys").scrollIntoView({ behavior: "smooth", block: "start" });
              }
            });

            planBlock.appendChild(planHead);

            if (!bucket.keys.length) {
              var emptyNote = document.createElement("div");
              emptyNote.style.cssText = "font-size:12px;color:#71717a;padding:4px 2px;";
              emptyNote.textContent = "ไม่มีคีย์ในแพ็กเกจนี้ — กด '+ เติมคีย์แพ็กเกจนี้' เพื่อนำเข้าคีย์";
              planBlock.appendChild(emptyNote);
            } else {
              var listGrid = document.createElement("div");
              listGrid.className = "adm-key-list-grid";

              bucket.keys.forEach(function (k) {
                var row = document.createElement("div");
                row.className = "adm-key-row";
                row.innerHTML =
                  '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;flex:1;min-width:220px;">' +
                    '<code class="adm-key-code">' + esc(k.key_value) + '</code>' +
                    '<span class="adm-badge ' + (k.is_used ? "used" : "ok") + '">' + (k.is_used ? "ขายแล้ว" : "พร้อมขาย") + '</span>' +
                    '<span style="font-size:11.5px;color:#71717a;">เพิ่มเมื่อ: ' + when(k.created_at) + (k.order_id ? " &middot; ออเดอร์: " + esc(k.order_id) : "") + '</span>' +
                  '</div>' +
                  '<div class="adm-actions">' +
                    '<button type="button" class="adm-btn sm" data-act="copy">คัดลอก</button>' +
                    '<button type="button" class="adm-btn sm" data-act="edit">แก้ไข</button>' +
                    '<button type="button" class="adm-btn sm danger" data-act="del">ลบคีย์</button>' +
                  '</div>';

                row.querySelector('[data-act="copy"]').addEventListener("click", function () {
                  var btn = this;
                  if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
                    navigator.clipboard.writeText(k.key_value).catch(function () {});
                  }
                  btn.textContent = "คัดลอกแล้ว";
                  setTimeout(function () { btn.textContent = "คัดลอก"; }, 1200);
                });

                row.querySelector('[data-act="edit"]').addEventListener("click", function () {
                  openEditKeyModal(k);
                });

                row.querySelector('[data-act="del"]').addEventListener("click", function () {
                  deleteKey(k.id);
                });

                listGrid.appendChild(row);
              });

              planBlock.appendChild(listGrid);
            }

            bodyEl.appendChild(planBlock);
          });
        }

        groupEl.appendChild(headEl);
        groupEl.appendChild(bodyEl);
        box.appendChild(groupEl);
      });
    } catch (e) {
      box.innerHTML = '<div class="adm-error">โหลดคีย์ไม่สำเร็จ: ' + esc(e.message) + '</div>';
    }
  }

  async function deleteKey(id) {
    if (!confirm("ต้องการลบคีย์นี้ออกจากคลังใช่หรือไม่?")) return;
    try {
      await api("/api/admin/keys/" + encodeURIComponent(id), { method: "DELETE" });
      await populateKeyProductDropdowns();
      loadKeys();
      loadStats();
    } catch (e) {
      alert("ลบไม่สำเร็จ: " + e.message);
    }
  }

  // --- Edit Key Modal ---
  function populateEditKeyModalPlans(slug, selectedPlan) {
    var selPlan = $("edit-key-plan");
    if (!selPlan) return;
    selPlan.innerHTML = '<option value="">-- กรุณาเลือกแพ็กเกจ --</option>';
    var prod = cachedProducts.find(function (p) { return p.slug === slug; });
    if (prod && Array.isArray(prod.plans)) {
      prod.plans.forEach(function (pl) {
        var opt = document.createElement("option");
        opt.value = pl.label;
        opt.textContent = pl.label + " (" + money(pl.price) + ")";
        selPlan.appendChild(opt);
      });
    }
    if (selectedPlan && !Array.from(selPlan.options).some(function (o) { return o.value === selectedPlan; })) {
      var customOpt = document.createElement("option");
      customOpt.value = selectedPlan;
      customOpt.textContent = selectedPlan;
      selPlan.appendChild(customOpt);
    }
    selPlan.value = selectedPlan || "";
  }

  function openEditKeyModal(k) {
    var modal = $("modal-edit-key");
    if (!modal) return;
    $("edit-key-id").value = k.id;
    $("edit-key-val").value = k.key_value || "";
    $("edit-key-used").checked = Boolean(k.is_used);
    msg($("msg-modal-key"), "");

    var selProd = $("edit-key-prod");
    selProd.innerHTML = "";
    cachedProducts.forEach(function (p) {
      var opt = document.createElement("option");
      opt.value = p.slug;
      opt.textContent = p.name + " (" + p.slug + ")";
      selProd.appendChild(opt);
    });
    if (k.product_id && !Array.from(selProd.options).some(function (o) { return o.value === k.product_id; })) {
      var extra = document.createElement("option");
      extra.value = k.product_id;
      extra.textContent = k.product_id;
      selProd.appendChild(extra);
    }
    selProd.value = k.product_id || "";
    populateEditKeyModalPlans(selProd.value, k.plan_label || "");

    modal.hidden = false;
  }

  on("edit-key-prod", "change", function () {
    populateEditKeyModalPlans(this.value, "");
  });
  on("btn-close-key-modal", "click", function () {
    $("modal-edit-key").hidden = true;
  });
  on("f-modal-key", "submit", async function (e) {
    e.preventDefault();
    var id = $("edit-key-id").value;
    var m = $("msg-modal-key");
    var editPlan = $("edit-key-plan").value.trim();
    if (!editPlan) {
      msg(m, "กรุณาเลือกแพ็กเกจของคีย์นี้", false);
      return;
    }
    try {
      await api("/api/admin/keys/" + encodeURIComponent(id), {
        method: "PATCH",
        body: JSON.stringify({
          product_id: $("edit-key-prod").value,
          plan_label: editPlan,
          key_value: $("edit-key-val").value.trim(),
          is_used: $("edit-key-used").checked,
        }),
      });
      $("modal-edit-key").hidden = true;
      await populateKeyProductDropdowns();
      loadKeys();
      loadStats();
    } catch (err) {
      msg(m, "บันทึกไม่สำเร็จ: " + err.message, false);
    }
  });

  on("f-add-keys", "submit", async function (e) {
    e.preventDefault();
    var pId = $("key-product-id").value.trim();
    var planLbl = $("key-plan-label").value.trim();
    var raw = $("key-bulk-text").value.trim();
    var syncStock = $("key-sync-stock").checked;
    var m = $("msg-keys");

    if (!pId) {
      msg(m, "กรุณาเลือกสินค้าที่ต้องการเพิ่มคีย์ก่อน", false);
      return;
    }
    if (!planLbl) {
      msg(m, "กรุณาเลือกแพ็กเกจที่ต้องการเติมคีย์", false);
      return;
    }
    var keys = raw.split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
    if (!keys.length) {
      msg(m, "กรุณาวางคีย์อย่างน้อย 1 บรรทัด", false);
      return;
    }

    var btn = this.querySelector('button[type="submit"]');
    btn.disabled = true;
    msg(m, "กำลังนำเข้า " + keys.length + " คีย์...");

    try {
      var res = await api("/api/admin/keys", {
        method: "POST",
        body: JSON.stringify({
          product_id: pId,
          plan_label: planLbl || null,
          keys: keys,
          sync_stock: syncStock,
        }),
      });
      msg(m, "นำเข้าสำเร็จจำนวน " + res.added + " คีย์!", true);
      $("key-bulk-text").value = "";
      await populateKeyProductDropdowns();
      loadKeys();
      loadStats();
    } catch (err) {
      msg(m, "เกิดข้อผิดพลาด: " + err.message, false);
    } finally {
      btn.disabled = false;
    }
  });

  // ================================================================
  // 4. TOPUPS (PromptPay & Manual Slip with Status Filter)
  // ================================================================
  on("filter-pp-status", "change", loadPromptPay);
  on("filter-manual-status", "change", loadManualTopups);

  async function loadPromptPay() {
    var box = $("list-pp-topups");
    if (!box) return;
    box.innerHTML = '<div class="adm-loading">กำลังโหลด...</div>';
    try {
      var st = $("filter-pp-status") ? $("filter-pp-status").value : "pending";
      var d = await api("/api/admin/topups?status=" + encodeURIComponent(st));
      box.innerHTML = "";
      if (!d.topups || !d.topups.length) {
        box.innerHTML = '<div class="adm-empty">ไม่มีรายการพร้อมเพย์ในสถานะที่เลือก</div>';
        return;
      }
      d.topups.forEach(function (t) {
        var isPending = t.status === "pending" || t.status === "processing";
        var badgeCls = t.status === "approved" ? "ok" : (isPending ? "warning" : "danger");
        var el = document.createElement("div");
        el.className = "adm-item-card";
        el.innerHTML =
          '<div class="adm-item-info">' +
            '<b>' + esc(t.user || t.uid) + '</b> <span class="adm-tag">' + esc(t.method || "promptpay") + '</span> ' +
            '<span class="adm-badge ' + badgeCls + '">' + esc(t.status) + '</span>' +
            '<div class="adm-sub">รหัสรายการ: ' + esc(t.id) + ' &middot; เวลา: ' + when(t.createdAt) + '</div>' +
          '</div>' +
          '<div class="adm-item-amount">' + money(t.amount) + '</div>' +
          (isPending
            ? '<div class="adm-actions">' +
                '<button type="button" class="adm-btn sm ok" data-act="approve">อนุมัติยอด</button>' +
                '<button type="button" class="adm-btn sm danger" data-act="reject">ปฏิเสธ</button>' +
              '</div>'
            : "");

        if (isPending) {
          el.querySelector('[data-act="approve"]').addEventListener("click", function () {
            handlePromptPay(t.id, "approve", this);
          });
          el.querySelector('[data-act="reject"]').addEventListener("click", function () {
            handlePromptPay(t.id, "reject", this);
          });
        }
        box.appendChild(el);
      });
    } catch (e) {
      box.innerHTML = '<div class="adm-error">โหลดไม่สำเร็จ: ' + esc(e.message) + '</div>';
    }
  }

  async function handlePromptPay(id, action, btn) {
    if (action === "reject" && !confirm("ยืนยันการปฏิเสธรายการเติมเงินนี้?")) return;
    btn.disabled = true;
    try {
      await api("/api/admin/topups/" + encodeURIComponent(id) + "/" + action, { method: "POST" });
      loadPromptPay();
      loadStats();
    } catch (e) {
      alert("เกิดข้อผิดพลาด: " + e.message);
      btn.disabled = false;
    }
  }

  async function loadManualTopups() {
    var box = $("list-manual-topups");
    if (!box) return;
    box.innerHTML = '<div class="adm-loading">กำลังโหลด...</div>';
    try {
      var st = $("filter-manual-status") ? $("filter-manual-status").value : "pending";
      var d = await api("/api/admin/manual-topups?status=" + encodeURIComponent(st));
      box.innerHTML = "";
      if (!d.topups || !d.topups.length) {
        box.innerHTML = '<div class="adm-empty">ไม่มีรายการแจ้งโอนสลิปในสถานะที่เลือก</div>';
        return;
      }
      d.topups.forEach(function (t) {
        var isPending = t.status === "pending";
        var badgeCls = t.status === "approved" ? "ok" : (isPending ? "warning" : "danger");
        var isImgSlip = t.slip_url && (/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(t.slip_url) || /^https?:\/\//i.test(t.slip_url));
        var el = document.createElement("div");
        el.className = "adm-item-card";
        el.innerHTML =
          '<div class="adm-item-info">' +
            '<b>' + esc(t.username || t.user_id) + '</b> <span class="adm-tag">' + esc(t.channel_name || "โอนเงิน") + '</span> ' +
            '<span class="adm-badge ' + badgeCls + '">' + esc(t.status) + '</span>' +
            '<div class="adm-sub">เวลา: ' + when(t.created_at) +
              (isImgSlip ? ' &middot; <button type="button" class="adm-btn sm btn-view-slip" style="padding:3px 9px;font-size:11.5px;margin-left:4px;">ดูรูปสลิปโอนเงิน</button>' : (t.slip_url ? ' &middot; อ้างอิง/Payload: <code style="color:#60a5fa;">' + esc(t.slip_url) + '</code>' : "")) +
              (t.qr_payload && t.qr_payload !== t.slip_url ? ' &middot; Payload: <code style="color:#a78bfa;">' + esc(t.qr_payload) + '</code>' : "") +
              (t.admin_note ? ' &middot; หมายเหตุ: ' + esc(t.admin_note) : "") +
            '</div>' +
            (isImgSlip ? '<div style="margin-top:8px;"><img src="' + esc(t.slip_url) + '" alt="Slip" class="btn-view-slip-img" style="max-height:84px;border-radius:8px;border:1px solid rgba(255,255,255,0.16);cursor:pointer;" title="คลิกเพื่อดูรูปสลิปขนาดใหญ่"></div>' : "") +
          '</div>' +
          '<div class="adm-item-amount">' + money(t.amount) + '</div>' +
          (isPending
            ? '<div class="adm-actions">' +
                '<button type="button" class="adm-btn sm ok" data-act="approve">อนุมัติ &amp; เติมเครดิต</button>' +
                '<button type="button" class="adm-btn sm danger" data-act="reject">ปฏิเสธ</button>' +
              '</div>'
            : "");

        if (isImgSlip) {
          var openSlipPreview = function () {
            var existing = document.getElementById("adm-slip-lightbox");
            if (existing) existing.remove();
            var overlay = document.createElement("div");
            overlay.id = "adm-slip-lightbox";
            overlay.setAttribute("role", "dialog");
            overlay.setAttribute("aria-modal", "true");
            overlay.setAttribute("aria-label", "ดูรูปสลิปโอนเงิน");
            overlay.style.cssText = "position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.85);backdrop-filter:blur(6px);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;box-sizing:border-box";
            var closeBtn = document.createElement("button");
            closeBtn.type = "button";
            closeBtn.textContent = "ปิดหน้าต่าง ✕";
            closeBtn.style.cssText = "margin-bottom:14px;padding:8px 16px;border-radius:999px;border:1px solid rgba(255,255,255,.25);background:#18181b;color:#fff;font:inherit;font-size:13px;cursor:pointer";
            var previewEl = document.createElement("img");
            previewEl.src = t.slip_url;
            previewEl.alt = "สลิปโอนเงิน " + String(t.username || "");
            previewEl.style.cssText = "max-width:100%;max-height:82vh;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,.8);border:1px solid rgba(255,255,255,.15)";
            var closePreview = function () {
              document.removeEventListener("keydown", onEsc);
              overlay.remove();
            };
            var onEsc = function (ev) {
              if (ev.key === "Escape") closePreview();
            };
            closeBtn.addEventListener("click", closePreview);
            overlay.addEventListener("click", function (ev) {
              if (ev.target === overlay) closePreview();
            });
            document.addEventListener("keydown", onEsc);
            overlay.appendChild(closeBtn);
            overlay.appendChild(previewEl);
            document.body.appendChild(overlay);
          };
          var btnSlip = el.querySelector(".btn-view-slip");
          var imgSlip = el.querySelector(".btn-view-slip-img");
          if (btnSlip) btnSlip.addEventListener("click", openSlipPreview);
          if (imgSlip) imgSlip.addEventListener("click", openSlipPreview);
        }

        if (isPending) {
          el.querySelector('[data-act="approve"]').addEventListener("click", function () {
            handleManualTopup(t.id, "approve", this);
          });
          el.querySelector('[data-act="reject"]').addEventListener("click", function () {
            handleManualTopup(t.id, "reject", this);
          });
        }
        box.appendChild(el);
      });
    } catch (e) {
      box.innerHTML = '<div class="adm-error">โหลดไม่สำเร็จ: ' + esc(e.message) + '</div>';
    }
  }

  async function handleManualTopup(id, action, btn) {
    var note = "";
    if (action === "reject") {
      note = prompt("ระบุเหตุผลที่ปฏิเสธสลิป (เว้นว่างได้):") || "";
    }
    btn.disabled = true;
    try {
      await api("/api/admin/manual-topups/" + encodeURIComponent(id) + "/" + action, {
        method: "POST",
        body: JSON.stringify({ note: note }),
      });
      loadManualTopups();
      loadStats();
    } catch (e) {
      alert("เกิดข้อผิดพลาด: " + e.message);
      btn.disabled = false;
    }
  }

  // ================================================================
  // 5. ORDERS (Search + Filter + Delivered Keys Display)
  // ================================================================
  on("filter-order-search", "input", renderFilteredOrders);
  on("filter-order-status", "change", renderFilteredOrders);

  async function loadOrders() {
    var box = $("list-orders");
    if (!box) return;
    box.innerHTML = '<div class="adm-loading">กำลังโหลดรายการสั่งซื้อ...</div>';
    try {
      var d = await api("/api/admin/orders");
      cachedOrders = d.orders || [];
      renderFilteredOrders();
    } catch (e) {
      box.innerHTML = '<div class="adm-error">โหลดไม่สำเร็จ: ' + esc(e.message) + '</div>';
    }
  }

  function renderFilteredOrders() {
    var box = $("list-orders");
    if (!box) return;
    var q = $("filter-order-search") ? $("filter-order-search").value.trim().toLowerCase() : "";
    var st = $("filter-order-status") ? $("filter-order-status").value : "all";

    var list = cachedOrders.filter(function (o) {
      if (st !== "all") {
        if (st === "delivered" && o.status !== "delivered" && o.status !== "completed") return false;
        if (st === "paid" && o.status !== "paid") return false;
        if (st === "cancelled" && o.status !== "cancelled" && o.status !== "refunded") return false;
      }
      if (q) {
        var pName = (o.product && o.product.name) ? o.product.name : (o.product_name || "");
        var hay = [o.id, o.user, o.contact, pName, (o.keys_delivered || []).join(" ")].join(" ").toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });

    box.innerHTML = "";
    if (!list.length) {
      box.innerHTML = '<div class="adm-empty">ไม่พบรายการสั่งซื้อตามเงื่อนไขที่เลือก</div>';
      return;
    }

    list.forEach(function (o) {
      var el = document.createElement("div");
      el.className = "adm-item-card";
      var prodName = (o.product && o.product.name) ? o.product.name : (o.product_name || "สินค้า");
      var planName = (o.plan && o.plan.label) ? o.plan.label : "";
      var statusBadge = o.status === "delivered" || o.status === "completed"
        ? "ok"
        : (o.status === "cancelled" || o.status === "refunded" ? "danger" : "warning");

      var keysDelivered = Array.isArray(o.keys_delivered) ? o.keys_delivered : [];
      var keysHtml = keysDelivered.map(function (kv) {
        return '<code class="adm-key-code" style="font-size:12px;padding:2px 7px;cursor:pointer;" title="คลิกเพื่อคัดลอก">' + esc(kv) + '</code>';
      }).join(" ");

      el.innerHTML =
        '<div class="adm-item-info">' +
          '<b>' + esc(prodName) + (planName ? " (" + esc(planName) + ")" : "") + '</b> &times;' + (o.quantity || 1) + ' ' +
          '<span class="adm-badge ' + statusBadge + '">' + esc(o.status) + '</span>' +
          '<div class="adm-sub">รหัสออเดอร์: <code>' + esc(o.id) + '</code> &middot; ลูกค้า: <b>' + esc(o.user) + '</b> &middot; ' + when(o.createdAt || o.created_at) + '</div>' +
          (keysHtml ? '<div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap;align-items:center;"><span style="font-size:12px;color:#a1a1aa;">คีย์ที่ส่งมอบ:</span> ' + keysHtml + '</div>' : "") +
        '</div>' +
        '<div class="adm-item-amount">' + money(o.total) + '</div>' +
        '<div class="adm-actions">' +
          (o.status !== "delivered" && o.status !== "completed"
            ? '<button type="button" class="adm-btn sm ok" data-act="deliver">ส่งมอบแล้ว</button>'
            : '<span class="adm-tag" style="color:#a1a1aa;border-color:rgba(255,255,255,0.1);padding:5px 10px;">ส่งมอบคีย์แล้ว (ยกเลิกไม่ได้)</span>') +
        '</div>';

      el.querySelectorAll("code.adm-key-code").forEach(function (cEl) {
        cEl.addEventListener("click", function () {
          var txt = cEl.textContent;
          if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
            navigator.clipboard.writeText(txt).catch(function () {});
          }
          cEl.textContent = "คัดลอกแล้ว!";
          setTimeout(function () { cEl.textContent = txt; }, 1200);
        });
      });

      var bDel = el.querySelector('[data-act="deliver"]');
      if (bDel) {
        bDel.addEventListener("click", function () {
          updateOrderStatus(o.id, "delivered", this);
        });
      }
      box.appendChild(el);
    });
  }

  async function updateOrderStatus(id, status, btn) {
    btn.disabled = true;
    try {
      await api("/api/admin/orders/" + encodeURIComponent(id), {
        method: "PATCH",
        body: JSON.stringify({ status: status }),
      });
      loadOrders();
      loadStats();
    } catch (e) {
      alert("อัปเดตสถานะไม่สำเร็จ: " + e.message);
      btn.disabled = false;
    }
  }

  // ================================================================

  // ================================================================
  on("filter-user-search", "input", renderFilteredUsers);

  async function loadUsers() {
    var box = $("list-users");
    if (!box) return;
    box.innerHTML = '<div class="adm-loading">กำลังโหลดรายชื่อสมาชิก...</div>';
    try {
      var d = await api("/api/admin/users");
      cachedUsers = d.users || [];
      renderFilteredUsers();
    } catch (e) {
      box.innerHTML = '<div class="adm-error">โหลดรายชื่อสมาชิกไม่สำเร็จ: ' + esc(e.message) + '</div>';
    }
  }

  function renderFilteredUsers() {
    var box = $("list-users");
    if (!box) return;
    var q = $("filter-user-search") ? $("filter-user-search").value.trim().toLowerCase() : "";
    var list = cachedUsers.filter(function (u) {
      if (!q) return true;
      return String(u.username || "").toLowerCase().indexOf(q) !== -1 ||
             String(u.id || "").toLowerCase().indexOf(q) !== -1;
    });

    box.innerHTML = "";
    if (!list.length) {
      box.innerHTML = '<div class="adm-empty">ไม่พบข้อมูลสมาชิก</div>';
      return;
    }

    list.forEach(function (u) {
      var el = document.createElement("div");
      el.className = "adm-item-card";
      var isAdm = u.role === "admin";
      el.innerHTML =
        '<div class="adm-item-info">' +
          '<b>' + esc(u.username) + '</b> ' +
          '<span class="adm-tag ' + (isAdm ? "admin-role" : "") + '">' + (isAdm ? "แอดมิน (Admin)" : "สมาชิก (User)") + '</span> ' +
          (u.banned ? '<span class="adm-badge danger">ถูกระงับบัญชี</span>' : "") +
          '<div class="adm-sub">รหัส: <code>' + esc(u.id) + '</code> &middot; สมัครเมื่อ: ' + when(u.createdAt) + ' &middot; ยอดเงินคงเหลือ: <span class="adm-highlight" style="font-size:14px;">' + money(u.balance) + '</span></div>' +
        '</div>' +
        '<div class="adm-actions">' +
          '<button type="button" class="adm-btn sm primary" data-act="adjust">จัดการยอดเงิน</button>' +
          '<button type="button" class="adm-btn sm" data-act="role">' + (isAdm ? "ลดเป็น User" : "ตั้งเป็น Admin") + '</button>' +
          '<button type="button" class="adm-btn sm ' + (u.banned ? "ok" : "danger") + '" data-act="ban">' + (u.banned ? "ปลดแบน" : "แบนผู้ใช้") + '</button>' +
        '</div>';

      el.querySelector('[data-act="adjust"]').addEventListener("click", function () {
        openBalanceModal(u);
      });
      el.querySelector('[data-act="role"]').addEventListener("click", function () {
        toggleUserRole(u.id, isAdm ? "user" : "admin");
      });
      el.querySelector('[data-act="ban"]').addEventListener("click", function () {
        toggleUserBan(u.id, !u.banned);
      });
      box.appendChild(el);
    });
  }

  function setBalanceModalMode(mode) {
    balanceModalMode = mode;
    document.querySelectorAll("#modal-adjust-balance .adm-mode-btn").forEach(function (b) {
      b.classList.toggle("active", b.dataset.mode === mode);
    });
    var lbl = $("bal-modal-label");
    var inp = $("bal-modal-input");
    if (!lbl || !inp) return;
    var labelText = mode === "add"
      ? "จำนวนเงินที่ต้องการเพิ่ม (บาท)"
      : (mode === "sub" ? "จำนวนเงินที่ต้องการหักออก (บาท)" : "กำหนดยอดเงินคงเหลือใหม่เป็น (บาท)");
    lbl.childNodes[0].nodeValue = labelText + " ";
    inp.focus();
  }

  function openBalanceModal(u) {
    var modal = $("modal-adjust-balance");
    if (!modal) return;
    $("bal-modal-uid").value = u.id;
    $("bal-modal-uname").textContent = u.username;
    $("bal-modal-cur").textContent = money(u.balance);
    $("bal-modal-input").value = "";
    msg($("msg-modal-bal"), "");
    setBalanceModalMode("add");
    modal.hidden = false;
  }

  function initBalanceModal() {
    document.querySelectorAll("#modal-adjust-balance .adm-mode-btn").forEach(function (b) {
      b.addEventListener("click", function () {
        setBalanceModalMode(b.dataset.mode);
      });
    });
    document.querySelectorAll("#bal-quick-chips button").forEach(function (b) {
      b.addEventListener("click", function () {
        $("bal-modal-input").value = b.dataset.q;
      });
    });
    on("btn-close-bal-modal", "click", function () {
      $("modal-adjust-balance").hidden = true;
    });
    on("f-modal-balance", "submit", async function (e) {
      e.preventDefault();
      var uid = $("bal-modal-uid").value;
      var val = Number($("bal-modal-input").value);
      var m = $("msg-modal-bal");

      if (!Number.isFinite(val) || val < 0 || (balanceModalMode !== "set" && val === 0)) {
        msg(m, "กรุณาระบุจำนวนเงินที่ถูกต้อง", false);
        return;
      }

      var payload = {};
      if (balanceModalMode === "set") {
        payload.set_balance = val;
      } else if (balanceModalMode === "sub") {
        payload.amount = -Math.abs(val);
      } else {
        payload.amount = Math.abs(val);
      }

      try {
        await api("/api/admin/users/" + encodeURIComponent(uid) + "/adjust-balance", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        $("modal-adjust-balance").hidden = true;
        await loadUsers();
        loadStats();
        document.dispatchEvent(new Event("xn:auth"));
      } catch (err) {
        msg(m, "ปรับยอดเงินไม่สำเร็จ: " + err.message, false);
      }
    });
  }

  async function toggleUserRole(uid, newRole) {
    if (!confirm("ยืนยันการเปลี่ยนสิทธิ์ผู้ใช้นี้เป็น '" + newRole.toUpperCase() + "'?")) return;
    try {
      await api("/api/admin/users/" + encodeURIComponent(uid), {
        method: "PATCH",
        body: JSON.stringify({ role: newRole }),
      });
      loadUsers();
      document.dispatchEvent(new Event("xn:auth"));
    } catch (e) {
      alert("เปลี่ยนสิทธิ์ไม่สำเร็จ: " + e.message);
    }
  }

  async function toggleUserBan(uid, banState) {
    if (!confirm(banState ? "ยืนยันการระงับบัญชีผู้ใช้นี้?" : "ยืนยันการปลดระงับบัญชีผู้ใช้นี้?")) return;
    try {
      await api("/api/admin/users/" + encodeURIComponent(uid), {
        method: "PATCH",
        body: JSON.stringify({ banned: banState }),
      });
      loadUsers();
    } catch (e) {
      alert("ดำเนินการไม่สำเร็จ: " + e.message);
    }
  }

  // ================================================================
  // 7. COUPONS (Create + Edit + Toggle + Delete)
  // ================================================================
  function resetCouponForm() {
    $("cp-edit-id").value = "";
    $("cp-form-title").textContent = "สร้างโค้ดคูปองเครดิตใหม่";
    $("btn-submit-cp").textContent = "สร้างคูปอง";
    $("btn-cancel-edit-cp").hidden = true;
    $("cp-code").value = "";
    $("cp-amount").value = "";
    $("cp-max").value = "";
    $("cp-note").value = "";
    msg($("msg-coupon"), "");
  }

  on("btn-cancel-edit-cp", "click", resetCouponForm);

  async function loadCoupons() {
    var box = $("list-coupons");
    if (!box) return;
    box.innerHTML = '<div class="adm-loading">กำลังโหลดคูปอง...</div>';
    try {
      var d = await api("/api/admin/coupons");
      box.innerHTML = "";
      if (!d.coupons || !d.coupons.length) {
        box.innerHTML = '<div class="adm-empty">ยังไม่มีคูปองในระบบ</div>';
        return;
      }
      d.coupons.forEach(function (c) {
        var el = document.createElement("div");
        el.className = "adm-item-card";
        el.innerHTML =
          '<div class="adm-item-info">' +
            '<code class="adm-key-code">' + esc(c.code) + '</code> ' +
            '<span class="adm-badge ' + (c.enabled ? "ok" : "used") + '">' + (c.enabled ? "เปิดใช้งาน" : "ปิดใช้งาน") + '</span>' +
            '<div class="adm-sub">มูลค่า: <span class="adm-highlight">' + money(c.amount) + '</span> &middot; ใช้แล้ว: ' + (c.used_count || 0) + '/' + (c.max_uses || "ไม่จำกัด") + ' ครั้ง' + (c.note ? " &middot; " + esc(c.note) : "") + '</div>' +
          '</div>' +
          '<div class="adm-actions">' +
            '<button type="button" class="adm-btn sm primary" data-act="edit">แก้ไข</button>' +
            '<button type="button" class="adm-btn sm" data-act="toggle">' + (c.enabled ? "ปิดโค้ด" : "เปิดโค้ด") + '</button>' +
            '<button type="button" class="adm-btn sm danger" data-act="del">ลบ</button>' +
          '</div>';

        el.querySelector('[data-act="edit"]').addEventListener("click", function () {
          $("cp-edit-id").value = c.id;
          $("cp-form-title").textContent = "แก้ไขคูปอง: " + c.code;
          $("btn-submit-cp").textContent = "บันทึกการแก้ไขคูปอง";
          $("btn-cancel-edit-cp").hidden = false;
          $("cp-code").value = c.code || "";
          $("cp-amount").value = c.amount || "";
          $("cp-max").value = c.max_uses != null ? c.max_uses : "";
          $("cp-note").value = c.note || "";
          $("coupon-form-card").scrollIntoView({ behavior: "smooth", block: "start" });
        });
        el.querySelector('[data-act="toggle"]').addEventListener("click", async function () {
          var btn = this;
          btn.disabled = true;
          try {
            await api("/api/admin/coupons/" + encodeURIComponent(c.id), {
              method: "PATCH",
              body: JSON.stringify({ enabled: !c.enabled }),
            });
            loadCoupons();
          } catch (err) {
            alert("เปลี่ยนสถานะคูปองไม่สำเร็จ: " + err.message);
            btn.disabled = false;
          }
        });
        el.querySelector('[data-act="del"]').addEventListener("click", async function () {
          if (!confirm("ต้องการลบคูปอง " + c.code + " ใช่หรือไม่?")) return;
          var btn = this;
          btn.disabled = true;
          try {
            await api("/api/admin/coupons/" + encodeURIComponent(c.id), { method: "DELETE" });
            if ($("cp-edit-id").value === String(c.id)) resetCouponForm();
            loadCoupons();
          } catch (err) {
            alert("ลบคูปองไม่สำเร็จ: " + err.message);
            btn.disabled = false;
          }
        });
        box.appendChild(el);
      });
    } catch (e) {
      box.innerHTML = '<div class="adm-error">โหลดคูปองไม่สำเร็จ: ' + esc(e.message) + '</div>';
    }
  }

  on("f-add-coupon", "submit", async function (e) {
    e.preventDefault();
    var editId = $("cp-edit-id").value.trim();
    var code = $("cp-code").value.trim();
    var amount = Number($("cp-amount").value);
    var max = $("cp-max").value ? Number($("cp-max").value) : null;
    var note = $("cp-note").value.trim();
    var m = $("msg-coupon");

    try {
      if (editId) {
        await api("/api/admin/coupons/" + encodeURIComponent(editId), {
          method: "PATCH",
          body: JSON.stringify({ code: code, amount: amount, max_uses: max, note: note }),
        });
        resetCouponForm();
        msg(m, "อัปเดตคูปอง " + code.toUpperCase() + " สำเร็จ!", true);
      } else {
        await api("/api/admin/coupons", {
          method: "POST",
          body: JSON.stringify({ code: code, amount: amount, max_uses: max, note: note }),
        });
        resetCouponForm();
        msg(m, "สร้างคูปอง " + code.toUpperCase() + " สำเร็จ!", true);
      }
      loadCoupons();
    } catch (err) {
      msg(m, "บันทึกคูปองไม่สำเร็จ: " + err.message, false);
    }
  });

  // ================================================================
  // 8. NEWS / ANNOUNCEMENTS (Create + Edit + Delete)
  // ================================================================
  function resetNewsForm() {
    $("news-edit-id").value = "";
    $("news-form-title").textContent = "เพิ่มประกาศ / ข่าวสารใหม่";
    $("btn-submit-news").textContent = "เผยแพร่ประกาศ";
    $("btn-cancel-edit-news").hidden = true;
    $("news-title").value = "";
    $("news-img").value = "";
    $("news-content").value = "";
    msg($("msg-news"), "");
  }

  on("btn-cancel-edit-news", "click", resetNewsForm);

  async function loadNews() {
    var box = $("list-news");
    if (!box) return;
    box.innerHTML = '<div class="adm-loading">กำลังโหลดประกาศ...</div>';
    try {
      var d = await api("/api/admin/news");
      box.innerHTML = "";
      if (!d.posts || !d.posts.length) {
        box.innerHTML = '<div class="adm-empty">ยังไม่มีประกาศข่าวสาร</div>';
        return;
      }
      d.posts.forEach(function (n) {
        var el = document.createElement("div");
        el.className = "adm-item-card";
        el.innerHTML =
          '<div class="adm-item-info">' +
            '<b>' + esc(n.title) + '</b> ' +
            '<span class="adm-badge ' + (n.published ? "ok" : "used") + '">' + (n.published ? "เผยแพร่" : "ฉบับร่าง") + '</span>' +
            '<div class="adm-sub">' + esc(n.content || "") + '</div>' +
            '<div class="adm-sub">สร้างเมื่อ: ' + when(n.created_at) + '</div>' +
          '</div>' +
          '<div class="adm-actions">' +
            '<button type="button" class="adm-btn sm primary" data-act="edit">แก้ไข</button>' +
            '<button type="button" class="adm-btn sm danger" data-act="del">ลบประกาศ</button>' +
          '</div>';
        el.querySelector('[data-act="edit"]').addEventListener("click", function () {
          $("news-edit-id").value = n.id;
          $("news-form-title").textContent = "แก้ไขประกาศ: " + n.title;
          $("btn-submit-news").textContent = "บันทึกการแก้ไขประกาศ";
          $("btn-cancel-edit-news").hidden = false;
          $("news-title").value = n.title || "";
          $("news-img").value = n.image_url || "";
          $("news-content").value = n.content || "";
          $("news-form-card").scrollIntoView({ behavior: "smooth", block: "start" });
        });
        el.querySelector('[data-act="del"]').addEventListener("click", async function () {
          if (!confirm("ต้องการลบประกาศนี้ใช่หรือไม่?")) return;
          var btn = this;
          btn.disabled = true;
          try {
            await api("/api/admin/news/" + encodeURIComponent(n.id), { method: "DELETE" });
            if ($("news-edit-id").value === String(n.id)) resetNewsForm();
            loadNews();
          } catch (err) {
            alert("ลบประกาศไม่สำเร็จ: " + err.message);
            btn.disabled = false;
          }
        });
        box.appendChild(el);
      });
    } catch (e) {
      box.innerHTML = '<div class="adm-error">โหลดประกาศไม่สำเร็จ: ' + esc(e.message) + '</div>';
    }
  }

  on("f-add-news", "submit", async function (e) {
    e.preventDefault();
    var editId = $("news-edit-id").value.trim();
    var title = $("news-title").value.trim();
    var img = $("news-img").value.trim();
    var content = $("news-content").value.trim();
    var m = $("msg-news");
    try {
      if (editId) {
        await api("/api/admin/news/" + encodeURIComponent(editId), {
          method: "PATCH",
          body: JSON.stringify({ title: title, image_url: img, content: content, published: true }),
        });
        resetNewsForm();
        msg(m, "อัปเดตประกาศเรียบร้อยแล้ว!", true);
      } else {
        await api("/api/admin/news", {
          method: "POST",
          body: JSON.stringify({ title: title, image_url: img, content: content, published: true }),
        });
        resetNewsForm();
        msg(m, "เผยแพร่ประกาศเรียบร้อยแล้ว!", true);
      }
      loadNews();
    } catch (err) {
      msg(m, "เกิดข้อผิดพลาด: " + err.message, false);
    }
  });

  // ================================================================
  // 9. PAYMENT CHANNELS (Create + Edit + Delete)
  // ================================================================
  function resetChannelForm() {
    $("ch-edit-id").value = "";
    $("ch-form-title").textContent = "เพิ่มช่องทางรับชำระเงิน (ธนาคาร / พร้อมเพย์)";
    $("btn-submit-ch").textContent = "บันทึกช่องทางชำระเงิน";
    $("btn-cancel-edit-ch").hidden = true;
    $("ch-name").value = "";
    $("ch-acc-no").value = "";
    $("ch-acc-name").value = "";
    $("ch-qr").value = "";
    msg($("msg-channel"), "");
  }

  on("btn-cancel-edit-ch", "click", resetChannelForm);

  async function loadChannels() {
    var box = $("list-channels");
    if (!box) return;
    box.innerHTML = '<div class="adm-loading">กำลังโหลดช่องทางชำระเงิน...</div>';
    try {
      var d = await api("/api/admin/channels");
      box.innerHTML = "";
      if (!d.channels || !d.channels.length) {
        box.innerHTML = '<div class="adm-empty">ยังไม่มีช่องทางชำระเงิน</div>';
        return;
      }
      d.channels.forEach(function (c) {
        var el = document.createElement("div");
        el.className = "adm-item-card";
        el.innerHTML =
          '<div class="adm-item-info">' +
            '<b>' + esc(c.name) + '</b> <span class="adm-tag">' + esc(c.type || "bank") + '</span>' +
            '<div class="adm-sub">เลขที่บัญชี: <span class="adm-highlight">' + esc(c.account_no) + '</span> &middot; ชื่อบัญชี: ' + esc(c.account_name) + '</div>' +
          '</div>' +
          '<div class="adm-actions">' +
            '<button type="button" class="adm-btn sm primary" data-act="edit">แก้ไข</button>' +
            '<button type="button" class="adm-btn sm danger" data-act="del">ลบช่องทาง</button>' +
          '</div>';
        el.querySelector('[data-act="edit"]').addEventListener("click", function () {
          $("ch-edit-id").value = c.id;
          $("ch-form-title").textContent = "แก้ไขช่องทางชำระเงิน: " + c.name;
          $("btn-submit-ch").textContent = "บันทึกการแก้ไขช่องทาง";
          $("btn-cancel-edit-ch").hidden = false;
          $("ch-name").value = c.name || "";
          $("ch-acc-no").value = c.account_no || "";
          $("ch-acc-name").value = c.account_name || "";
          $("ch-qr").value = c.qr_img || "";
          $("ch-form-card").scrollIntoView({ behavior: "smooth", block: "start" });
        });
        el.querySelector('[data-act="del"]').addEventListener("click", async function () {
          if (!confirm("ต้องการลบช่องทาง '" + c.name + "' ใช่หรือไม่?")) return;
          var btn = this;
          btn.disabled = true;
          try {
            await api("/api/admin/channels/" + encodeURIComponent(c.id), { method: "DELETE" });
            if ($("ch-edit-id").value === String(c.id)) resetChannelForm();
            loadChannels();
          } catch (err) {
            alert("ลบช่องทางไม่สำเร็จ: " + err.message);
            btn.disabled = false;
          }
        });
        box.appendChild(el);
      });
    } catch (e) {
      box.innerHTML = '<div class="adm-error">โหลดไม่สำเร็จ: ' + esc(e.message) + '</div>';
    }
  }

  on("f-add-channel", "submit", async function (e) {
    e.preventDefault();
    var editId = $("ch-edit-id").value.trim();
    var name = $("ch-name").value.trim();
    var accNo = $("ch-acc-no").value.trim();
    var accName = $("ch-acc-name").value.trim();
    var qr = $("ch-qr").value.trim();
    var m = $("msg-channel");
    try {
      if (editId) {
        await api("/api/admin/channels/" + encodeURIComponent(editId), {
          method: "PATCH",
          body: JSON.stringify({
            name: name,
            account_no: accNo,
            account_name: accName,
            qr_img: qr,
          }),
        });
        resetChannelForm();
        msg(m, "อัปเดตช่องทางชำระเงินสำเร็จ!", true);
      } else {
        await api("/api/admin/channels", {
          method: "POST",
          body: JSON.stringify({
            name: name,
            bank_name: name,
            account_no: accNo,
            account_name: accName,
            qr_img: qr,
            type: "bank",
          }),
        });
        resetChannelForm();
        msg(m, "เพิ่มช่องทางชำระเงินสำเร็จ!", true);
      }
      loadChannels();
    } catch (err) {
      msg(m, "เกิดข้อผิดพลาด: " + err.message, false);
    }
  });

  // ================================================================
  // 10. SITE SETTINGS & MULTI-CHANNEL SUPPORT LINKS
  // ================================================================
  function resetSupportForm() {
    if (!$("sup-edit-id")) return;
    $("sup-edit-id").value = "";
    $("sup-form-title").textContent = "เพิ่มช่องทางติดต่อใหม่ (แสดงในหน้าติดต่อเรา)";
    $("btn-submit-sup").textContent = "+ เพิ่มช่องทางติดต่อ";
    $("btn-cancel-edit-sup").hidden = true;
    $("sup-platform").value = "discord";
    $("sup-label").value = "";
    $("sup-handle").value = "";
    $("sup-badge").value = "ออนไลน์ 24 ชม.";
    $("sup-url").value = "";
    $("sup-desc").value = "";
    msg($("msg-support"), "");
  }

  on("btn-cancel-edit-sup", "click", resetSupportForm);

  async function loadSupportLinks() {
    var box = $("list-support-links");
    if (!box) return;
    box.innerHTML = '<div class="adm-loading">กำลังโหลดช่องทางติดต่อ...</div>';
    try {
      var d = await api("/api/admin/support-links");
      var list = (d && Array.isArray(d.links)) ? d.links : [];
      box.innerHTML = "";
      if (!list.length) {
        box.innerHTML = '<div class="adm-empty">ยังไม่มีช่องทางติดต่อ กรุณาเพิ่มช่องทางด้านบน</div>';
        return;
      }
      list.forEach(function (item) {
        var el = document.createElement("div");
        el.className = "adm-item-card";
        var safeSupUrl = safeUrl(item.url, true);
        el.innerHTML =
          '<div class="adm-item-info">' +
            '<b>' + esc(item.label) + '</b> ' +
            '<span class="adm-tag" style="text-transform:uppercase;">' + esc(item.platform || "custom") + '</span> ' +
            '<span class="adm-badge ' + (item.enabled !== false ? "ok" : "used") + '">' + (item.enabled !== false ? "แสดงผล" : "ซ่อนไว้") + '</span>' +
            '<div class="adm-sub">ไอดี/บัญชี: <span class="adm-highlight">' + esc(item.handle || "-") + '</span> &middot; ลิงก์: ' +
              (safeSupUrl ? '<a href="' + esc(safeSupUrl) + '" target="_blank" rel="noopener noreferrer" style="color:#60a5fa;">' + esc(safeSupUrl) + '</a>' : '<span style="color:#71717a;">-</span>') +
            '</div>' +
            (item.description ? '<div class="adm-sub">' + esc(item.description) + '</div>' : "") +
          '</div>' +
          '<div class="adm-actions">' +
            '<button type="button" class="adm-btn sm primary" data-act="edit">แก้ไข</button>' +
            '<button type="button" class="adm-btn sm" data-act="toggle">' + (item.enabled !== false ? "ซ่อน" : "แสดง") + '</button>' +
            '<button type="button" class="adm-btn sm danger" data-act="del">ลบ</button>' +
          '</div>';

        el.querySelector('[data-act="edit"]').addEventListener("click", function () {
          $("sup-edit-id").value = item.id;
          $("sup-form-title").textContent = "แก้ไขช่องทางติดต่อ: " + item.label;
          $("btn-submit-sup").textContent = "บันทึกการแก้ไขช่องทางติดต่อ";
          $("btn-cancel-edit-sup").hidden = false;
          $("sup-platform").value = item.platform || "custom";
          $("sup-label").value = item.label || "";
          $("sup-handle").value = item.handle || "";
          $("sup-badge").value = item.badge || "ออนไลน์ 24 ชม.";
          $("sup-url").value = item.url || "";
          $("sup-desc").value = item.description || "";
          $("sup-form-card").scrollIntoView({ behavior: "smooth", block: "start" });
        });

        el.querySelector('[data-act="toggle"]').addEventListener("click", async function () {
          var btn = this;
          btn.disabled = true;
          try {
            await api("/api/admin/support-links/" + encodeURIComponent(item.id), {
              method: "PATCH",
              body: JSON.stringify({ enabled: item.enabled === false }),
            });
            loadSupportLinks();
          } catch (err) {
            alert("เปลี่ยนสถานะช่องทางติดต่อไม่สำเร็จ: " + err.message);
            btn.disabled = false;
          }
        });

        el.querySelector('[data-act="del"]').addEventListener("click", async function () {
          if (!confirm("ต้องการลบช่องทางติดต่อ '" + item.label + "' ใช่หรือไม่?")) return;
          var btn = this;
          btn.disabled = true;
          try {
            await api("/api/admin/support-links/" + encodeURIComponent(item.id), { method: "DELETE" });
            if ($("sup-edit-id").value === String(item.id)) resetSupportForm();
            loadSupportLinks();
          } catch (err) {
            alert("ลบช่องทางติดต่อไม่สำเร็จ: " + err.message);
            btn.disabled = false;
          }
        });

        box.appendChild(el);
      });
    } catch (e) {
      box.innerHTML = '<div class="adm-error">โหลดช่องทางติดต่อไม่สำเร็จ: ' + esc(e.message) + '</div>';
    }
  }

  on("f-add-support", "submit", async function (e) {
    e.preventDefault();
    var editId = $("sup-edit-id") ? $("sup-edit-id").value.trim() : "";
    var payload = {
      platform: $("sup-platform").value,
      label: $("sup-label").value.trim(),
      handle: $("sup-handle").value.trim(),
      badge: $("sup-badge").value.trim() || "ออนไลน์ 24 ชม.",
      url: $("sup-url").value.trim(),
      description: $("sup-desc").value.trim(),
    };
    var m = $("msg-support");
    try {
      if (editId) {
        await api("/api/admin/support-links/" + encodeURIComponent(editId), {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        resetSupportForm();
        msg(m, "อัปเดตช่องทางติดต่อสำเร็จ!", true);
      } else {
        await api("/api/admin/support-links", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        resetSupportForm();
        msg(m, "เพิ่มช่องทางติดต่อใหม่สำเร็จ!", true);
      }
      loadSupportLinks();
    } catch (err) {
      msg(m, "บันทึกไม่สำเร็จ: " + err.message, false);
    }
  });

  async function loadSettings() {
    try {
      var d = await api("/api/admin/settings");
      var s = d.settings || {};
      $("set-site-name").value = s.site_name || "XENARY";
      $("set-tm-phone").value = s.truemoney_phone || "";
      if ($("set-pp-id")) $("set-pp-id").value = s.promptpay_id || "";
      $("set-topup-mode").value = s.topup_mode || "direct";
      $("set-banner-url").value = s.banner_url || "";
      if ($("set-discord-url")) $("set-discord-url").value = s.discord_url || "";
      $("set-maintenance").checked = Boolean(s.maintenance);
    } catch (e) {}
    loadSupportLinks();
  }

  on("f-settings", "submit", async function (e) {
    e.preventDefault();
    var m = $("msg-settings");
    try {
      await api("/api/admin/settings", {
        method: "PATCH",
        body: JSON.stringify({
          site_name: $("set-site-name").value.trim(),
          truemoney_phone: $("set-tm-phone").value.trim(),
          promptpay_id: $("set-pp-id") ? $("set-pp-id").value.trim() : "",
          topup_mode: $("set-topup-mode").value,
          banner_url: $("set-banner-url").value.trim(),
          discord_url: $("set-discord-url") ? $("set-discord-url").value.trim() : "",
          maintenance: $("set-maintenance").checked,
        }),
      });
      msg(m, "บันทึกการตั้งค่าระบบเรียบร้อยแล้ว!", true);
      loadSupportLinks();
    } catch (err) {
      msg(m, "บันทึกไม่สำเร็จ: " + err.message, false);
    }
  });

  // ================================================================
  // INIT
  // ================================================================
  var initialized = false;
  async function init() {
    if (initialized) return;
    initialized = true;

    on("f-adm-login", "submit", async function (e) {
      e.preventDefault();
      var key = $("adm-key-input") ? $("adm-key-input").value.trim() : "";
      if (!key) return;
      setKey(key);
      try {
        await api("/api/admin/stats");
        $("adm-login-card").hidden = true;
        $("adm-main-panel").hidden = false;
        switchTab("dashboard");
      } catch (err) {
        setKey("");
        msg($("adm-login-msg"), err.message || "รหัสผ่านแอดมินไม่ถูกต้อง", false);
      }
    });

    initTabs();
    initProductFormControls();
    initBalanceModal();

    if (await checkAuth()) {
      switchTab("dashboard");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

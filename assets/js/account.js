/* XENARY — INFICOZ-style Top-up & Order History + Login/Register */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var money = function (n) {
    var num = Number(n) || 0;
    var hasDec = Math.round(num * 100) % 100 !== 0;
    return "฿" + num.toLocaleString("en-US", {
      minimumFractionDigits: hasDec ? 2 : 0,
      maximumFractionDigits: 2,
    });
  };
  var moneyExact = function (n) {
    return "฿" + (Number(n) || 0).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };
  var go = function (p) { window.XN_ROUTE ? (location.hash = window.XN_ROUTE(p)) : (location.href = p); };
  var cfg = {}, ppTimer = null, ppPoll = null, ppId = null;

  function api(path, opt) {
    opt = opt || {};
    var o = {
      method: opt.method || "GET",
      credentials: "same-origin",
      headers: Object.assign({ "Content-Type": "application/json" }, opt.headers || {}),
      cache: "no-store",
    };
    if (opt.body) o.body = JSON.stringify(opt.body);
    return fetch(path, o).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) {
          var e = new Error(j.message || j.error || "เกิดข้อผิดพลาด");
          e.data = j;
          e.status = r.status;
          throw e;
        }
        return j;
      });
    });
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function msg(el, t, ok) {
    if (!el) return;
    el.textContent = t || "";
    el.className = "xn-msg" + (ok ? " ok" : "");
  }

  function nextUrl() {
    var n = new URLSearchParams(location.search).get("next") || "/";
    return /^\/(?!\/)/.test(n) ? n : "/";
  }

  function once(id, fn) {
    var f = $(id);
    if (f && !f.dataset.b) {
      f.dataset.b = "1";
      fn(f);
    }
  }

  var when = function (iso) {
    var d = new Date(iso);
    return Number.isFinite(d.getTime())
      ? d.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })
      : "-";
  };

  var TS = {
    approved: ["สำเร็จ", "ok"],
    completed: ["สำเร็จ", "ok"],
    pending: ["รอตรวจสอบ", "wait"],
    processing: ["กำลังตรวจสอบ", "wait"],
    rejected: ["ไม่สำเร็จ", "no"],
    cancelled: ["ยกเลิก", "no"],
    expired: ["หมดอายุ", "no"],
  };
  var OS = {
    paid: ["ชำระแล้ว", "wait"],
    delivered: ["สำเร็จ", "ok"],
    completed: ["สำเร็จ", "ok"],
    cancelled: ["ยกเลิก", "no"],
    refunded: ["คืนเงินแล้ว", "no"],
  };

  function resetTurnstile() {
    if (window.turnstile && typeof window.turnstile.reset === "function") {
      try { window.turnstile.reset(); } catch (err) {}
    }
  }

  function bindAuth(id, path) {
    once(id, function (f) {
      f.addEventListener("submit", function (e) {
        e.preventDefault();
        var m = f.querySelector(".xn-msg"), d = Object.fromEntries(new FormData(f));
        if (d.confirm !== undefined && d.confirm !== d.password) return msg(m, "รหัสผ่านไม่ตรงกัน");
        var token = d["cf-turnstile-response"] || "";
        var isLocal = location.hostname === "localhost" || location.hostname === "127.0.0.1" || location.hostname.indexOf("192.168.") === 0;
        if (!token && !isLocal && window.turnstile) return msg(m, "กรุณายืนยันว่าไม่ใช่บอท");
        msg(m, "กำลังดำเนินการ...", true);
        api(path, {
          method: "POST",
          body: {
            username: d.username,
            password: d.password,
            "cf-turnstile-response": token,
            turnstileToken: token,
            website: d.website,
            remember: !!d.remember,
          },
        })
          .then(function () { document.dispatchEvent(new Event("xn:auth")); go(nextUrl()); })
          .catch(function (x) { msg(m, x.message); resetTurnstile(f); });
      });
    });
  }

  function bindGoogleAuth() {
    once("btn-google-login", function (btn) {
      btn.addEventListener("click", function () {
        var form = btn.closest("form");
        var m = form ? form.querySelector(".xn-msg") : null;
        var remEl = form ? form.querySelector('input[name="remember"]') : null;
        var remember = remEl ? Boolean(remEl.checked) : true;
        if (!window.XenaryFirebase || typeof window.XenaryFirebase.signInWithGoogle !== "function") {
          return msg(m, "กำลังโหลดระบบ Google Sign-In กรุณาลองอีกครั้ง");
        }
        btn.disabled = true;
        msg(m, "กำลังเข้าสู่ระบบด้วย Google...", true);
        window.XenaryFirebase.signInWithGoogle(remember)
          .then(function () {
            document.dispatchEvent(new Event("xn:auth"));
            go(nextUrl());
          })
          .catch(function (err) {
            var em = (err && err.code === "auth/popup-closed-by-user")
              ? "คุณปิดหน้าต่างเข้าสู่ระบบ Google ก่อนเสร็จสิ้น"
              : ((err && err.message) || "เข้าสู่ระบบด้วย Google ไม่สำเร็จ");
            msg(m, em);
          })
          .finally(function () {
            btn.disabled = false;
          });
      });
    });
  }

  /* ============================================================
     VIEW SWITCHER: /account/ (Top-up) vs /account/?tab=orders
     ============================================================ */
  function syncAccountViewMode() {
    var vTopup = $("inf-view-topup");
    var vOrders = $("inf-view-orders");
    if (!vTopup || !vOrders) return;

    var tab = new URLSearchParams(location.search).get("tab");
    var isOrders = tab === "orders";
    vTopup.hidden = isOrders;
    vOrders.hidden = !isOrders;

    var tabTopup = $("tab-btn-topup");
    var tabOrders = $("tab-btn-orders");
    if (tabTopup) tabTopup.classList.toggle("on", !isOrders);
    if (tabOrders) tabOrders.classList.toggle("on", isOrders);

    // Update active state on navbar buttons
    var ordBtn = document.querySelector(".xn-ord-hist-btn");
    if (ordBtn) ordBtn.classList.toggle("on", isOrders);
    var navTopup = document.querySelector('.xn-links a[href="/account/"]');
    if (navTopup) navTopup.classList.toggle("on", !isOrders);
  }

  /* ============================================================
     REFRESH WALLET, TOPUP HISTORY & ORDER HISTORY TABLE
     ============================================================ */
  function refresh() {
    Promise.all([
      api("/api/wallet/topups").catch(function () { return { balance: 0, topups: [] }; }),
      api("/api/manual-topup").catch(function () { return { topups: [] }; }),
    ]).then(function (resArr) {
      var d = resArr[0] || { balance: 0, topups: [] };
      var mTop = (resArr[1] && resArr[1].topups) ? resArr[1].topups : [];
      if ($("acc-bal")) $("acc-bal").textContent = money(d.balance);

      var box = $("hist-top");
      if (!box) return;
      box.innerHTML = "";

      var combined = (d.topups || []).map(function (t) {
        return {
          id: t.id,
          methodLabel: t.method === "truemoney" ? "ซองอั่งเปา TrueMoney" : "PromptPay QR",
          amount: t.amount,
          status: t.status,
          createdAt: t.createdAt,
        };
      }).concat(mTop.map(function (mt) {
        return {
          id: mt.id,
          methodLabel: "โอนผ่านธนาคาร (" + (mt.channel_name || "ธนาคาร") + ")",
          amount: mt.amount,
          status: mt.status,
          adminNote: mt.admin_note || "",
          createdAt: mt.created_at,
        };
      }));

      combined.sort(function (a, b) {
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      });

      if (!combined.length) {
        box.innerHTML = '<div class="inf-hist-empty">ไม่มีประวัติเติมเงิน</div>';
        return;
      }

      var listEl = document.createElement("div");
      listEl.className = "inf-topup-hist-list";
      combined.forEach(function (t) {
        var s = TS[t.status] || [t.status, "wait"];
        var item = document.createElement("div");
        item.className = "inf-topup-hist-row";
        item.innerHTML =
          '<div class="inf-th-left">' +
            '<strong>' + esc(t.methodLabel) + '</strong>' +
            '<small>' + esc(when(t.createdAt)) + (t.adminNote ? ' &middot; หมายเหตุ: ' + esc(t.adminNote) : '') + '</small>' +
          '</div>' +
          '<div class="inf-th-right">' +
            '<b class="inf-th-amt">' + esc(moneyExact(t.amount)) + '</b>' +
            '<span class="inf-status-pill ' + esc(s[1]) + '">' + esc(s[0]) + '</span>' +
          '</div>';
        listEl.appendChild(item);
      });
      box.appendChild(listEl);
    }).catch(function () {
      var box = $("hist-top");
      if (box) box.innerHTML = '<div class="inf-hist-empty">ไม่มีประวัติเติมเงิน</div>';
    });

    // Order History Table (Matches Image 1)
    api("/api/orders/mine").then(function (d) {
      var orders = (d && Array.isArray(d.orders)) ? d.orders : [];
      var countLbl = $("ord-count-label");
      if (countLbl) countLbl.textContent = orders.length + " รายการ";

      var tbody = $("hist-ord-tbody");
      if (!tbody) return;
      tbody.innerHTML = "";

      if (!orders.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="inf-orders-empty">ยังไม่มีคำสั่งซื้อ</td></tr>';
        return;
      }

      orders.forEach(function (o) {
        var s = OS[o.status] || [o.status || "สำเร็จ", "ok"];
        var product = o.product || {};
        var plan = o.plan || {};
        var tr = document.createElement("tr");

        // 1. ID
        var tdId = document.createElement("td");
        tdId.className = "inf-td-id";
        tdId.textContent = o.id || "-";
        tr.appendChild(tdId);

        // 2. Product Name
        var tdProd = document.createElement("td");
        tdProd.className = "inf-td-prod";
        tdProd.textContent = product.name || "สินค้า";
        tr.appendChild(tdProd);

        // 3. Variant
        var tdVar = document.createElement("td");
        tdVar.innerHTML = '<span class="inf-var-badge">' + esc(plan.label || "มาตรฐาน") + (o.quantity > 1 ? " ×" + Number(o.quantity) : "") + '</span>';
        tr.appendChild(tdVar);

        // 4. Price
        var tdPrice = document.createElement("td");
        tdPrice.className = "inf-td-price";
        tdPrice.textContent = money(o.total);
        tr.appendChild(tdPrice);

        // 5. Status
        var tdStat = document.createElement("td");
        tdStat.innerHTML = '<span class="inf-status-pill ' + esc(s[1]) + '">' + esc(s[0]) + '</span>';
        tr.appendChild(tdStat);

        // 6. Keys / Account
        var tdKeys = document.createElement("td");
        var keysArr = Array.isArray(o.keys) ? o.keys : [];
        if (keysArr.length) {
          var kWrap = document.createElement("div");
          kWrap.className = "inf-keys-cell";
          keysArr.forEach(function (kv) {
            var kBtn = document.createElement("button");
            kBtn.type = "button";
            kBtn.className = "inf-key-copy-pill";
            kBtn.title = "คลิกเพื่อคัดลอกคีย์";
            kBtn.textContent = kv;
            kBtn.addEventListener("click", function () {
              if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
                navigator.clipboard.writeText(kv).catch(function () {});
              }
              kBtn.textContent = "คัดลอกแล้ว ✓";
              kBtn.classList.add("copied");
              setTimeout(function () {
                kBtn.textContent = kv;
                kBtn.classList.remove("copied");
              }, 1400);
            });
            kWrap.appendChild(kBtn);
          });
          tdKeys.appendChild(kWrap);
        } else {
          tdKeys.innerHTML = '<span class="inf-muted-dash">-</span>';
        }
        tr.appendChild(tdKeys);

        // 7. Download
        var tdDl = document.createElement("td");
        var safeDl = o.download_url && /^(https?:\/\/|\/(?!\/))/i.test(String(o.download_url).trim()) ? String(o.download_url).trim() : "";
        if (safeDl) {
          var dlA = document.createElement("a");
          dlA.href = safeDl;
          dlA.target = "_blank";
          dlA.rel = "noopener noreferrer";
          dlA.className = "inf-dl-pill";
          dlA.innerHTML =
            '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>' +
            '<span>ดาวน์โหลด</span>';
          tdDl.appendChild(dlA);
        } else {
          tdDl.innerHTML = '<span class="inf-muted-dash">-</span>';
        }
        tr.appendChild(tdDl);

        // 8. Time
        var tdTime = document.createElement("td");
        tdTime.className = "inf-td-time";
        tdTime.textContent = when(o.createdAt);
        tr.appendChild(tdTime);

        tbody.appendChild(tr);
      });
    }).catch(function () {
      var tbody = $("hist-ord-tbody");
      if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="inf-orders-empty">ยังไม่มีคำสั่งซื้อ</td></tr>';
    });
  }

  /* ============================================================
     PROMPTPAY QR FLOW (Matches Image 4)
     ============================================================ */
  function stopPP() {
    clearInterval(ppTimer);
    clearInterval(ppPoll);
    ppId = null;
  }

  function showPP(d) {
    stopPP();
    ppId = d.id;
    if ($("f-pp")) $("f-pp").hidden = true;
    var resBox = $("pp-result");
    if (resBox) resBox.hidden = false;

    if ($("pp-amt")) $("pp-amt").textContent = moneyExact(d.amount);
    var baseAmt = d.baseAmount || Math.floor(Number(d.amount) || 0);
    if ($("pp-base-amt")) $("pp-base-amt").textContent = "(ยอดเติมจริง " + money(baseAmt) + ")";
    if ($("pp-status-code")) $("pp-status-code").textContent = "pending";
    msg($("pp-status"), "");

    var img = $("pp-qr"), fb = $("pp-fallback");
    if (d.qr) {
      img.hidden = false;
      img.src = d.qr;
      fb.hidden = true;
    } else {
      img.hidden = true;
      fb.hidden = false;
      fb.textContent = "ไม่พบรูป QR Code";
    }

    function tickCountdown() {
      var s = Math.max(0, Math.floor((d.expiresAt - Date.now()) / 1000));
      if ($("pp-left")) {
        $("pp-left").textContent = Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
      }
      if (!s) {
        stopPP();
        if ($("pp-status-code")) $("pp-status-code").textContent = "expired";
        msg($("pp-status"), "QR หมดอายุแล้ว กรุณากดสร้าง QR ใหม่");
      }
    }
    tickCountdown();
    ppTimer = setInterval(tickCountdown, 1000);

    ppPoll = setInterval(function () {
      api("/api/wallet/topups").then(function (r) {
        var t = (r.topups || []).filter(function (x) { return x.id === d.id; })[0];
        if (t && t.status === "approved") {
          stopPP();
          if ($("pp-status-code")) $("pp-status-code").textContent = "approved";
          msg($("pp-status"), "ชำระเงินสำเร็จ! เติมเครดิต " + moneyExact(t.amount) + " เรียบร้อย", true);
          refresh();
          document.dispatchEvent(new Event("xn:auth"));
          setTimeout(function () { closeAllPayModals(); }, 1200);
        }
      }).catch(function () {});
    }, 4500);
  }

  /* ============================================================
     MODALS CONTROLLER
     ============================================================ */
  var MODAL_MAP = {
    promptpay: "modal-pay-promptpay",
    bank: "modal-pay-bank",
    truemoney: "modal-pay-truemoney",
    coupon: "modal-pay-coupon",
  };

  function closeAllPayModals() {
    Object.keys(MODAL_MAP).forEach(function (k) {
      var m = $(MODAL_MAP[k]);
      if (m) m.hidden = true;
    });
  }

  function openPayModal(type) {
    closeAllPayModals();
    var m = $(MODAL_MAP[type]);
    if (!m) return;
    m.hidden = false;

    if (type === "promptpay") {
      // If there's no active QR countdown, show Step 1 form
      if (!ppId) {
        if ($("f-pp")) $("f-pp").hidden = false;
        if ($("pp-result")) $("pp-result").hidden = true;
      }
    }
  }

  /* ============================================================
     SLIP IMAGE COMPRESSION HELPER (Canvas -> Compact DataURL)
     ============================================================ */
  function readAndCompressImage(file, callback) {
    if (!file || !file.type || file.type.indexOf("image/") !== 0 || file.type === "image/svg+xml") {
      return callback(new Error("กรุณาเลือกไฟล์รูปภาพ PNG, JPG หรือ WEBP เท่านั้น"));
    }
    if (file.size > 12 * 1024 * 1024) {
      return callback(new Error("ขนาดไฟล์รูปภาพต้องไม่เกิน 12 MB"));
    }
    var reader = new FileReader();
    reader.onload = function (ev) {
      var img = new Image();
      img.onload = function () {
        var maxDim = 900;
        var w = img.width;
        var h = img.height;
        if (!w || !h) {
          return callback(new Error("ไม่สามารถอ่านขนาดรูปภาพนี้ได้"));
        }
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        var canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        var ctx = canvas.getContext("2d");
        if (!ctx) {
          return callback(new Error("เบราว์เซอร์ไม่รองรับการประมวลผลรูปภาพ"));
        }
        ctx.drawImage(img, 0, 0, w, h);
        var dataUrl = canvas.toDataURL("image/jpeg", 0.82);
        callback(null, dataUrl);
      };
      img.onerror = function () {
        callback(new Error("ไม่สามารถอ่านไฟล์รูปภาพนี้ได้"));
      };
      img.src = ev.target.result;
    };
    reader.onerror = function () {
      callback(new Error("อ่านไฟล์ไม่สำเร็จ"));
    };
    reader.readAsDataURL(file);
  }

  /* ============================================================
     INIT ACCOUNT PAGE
     ============================================================ */
  function initAccount() {
    if (!$("inf-view-topup") && !$("inf-view-orders")) return;

    syncAccountViewMode();

    api("/api/auth/me").then(function (d) {
      if (!d.user) return go("/login/?next=" + encodeURIComponent(location.pathname + location.search));
      if ($("acc-name")) $("acc-name").textContent = d.user.username;
      refresh();
    }).catch(function () {});

    api("/api/wallet/config").then(function (c) {
      cfg = c;
      if ($("pp-demo")) $("pp-demo").hidden = !c.demo;
    }).catch(function () {});

    // Bind payment card triggers
    document.querySelectorAll("[data-open-pay]").forEach(function (el) {
      if (el.dataset.boundPay) return;
      el.dataset.boundPay = "1";
      el.addEventListener("click", function (e) {
        e.stopPropagation();
        var payType = el.getAttribute("data-open-pay");
        openPayModal(payType);
      });
    });

    // Bind modal close buttons & backdrop click
    document.querySelectorAll("[data-close-pay]").forEach(function (btn) {
      if (btn.dataset.boundClose) return;
      btn.dataset.boundClose = "1";
      btn.addEventListener("click", function () {
        closeAllPayModals();
      });
    });

    Object.keys(MODAL_MAP).forEach(function (k) {
      var backdrop = $(MODAL_MAP[k]);
      if (!backdrop || backdrop.dataset.boundBackdrop) return;
      backdrop.dataset.boundBackdrop = "1";
      backdrop.addEventListener("click", function (e) {
        if (e.target === backdrop) closeAllPayModals();
      });
    });

    // Intercept clicks on navbar /account/ and /account/?tab=orders while on /account/
    if (!document.body.dataset.boundAccTabLinks) {
      document.body.dataset.boundAccTabLinks = "1";
      document.addEventListener("click", function (e) {
        var a = e.target.closest("a");
        if (!a || !a.href) return;
        var u;
        try {
          u = new URL(a.href, location.origin);
        } catch (err) {
          return;
        }
        if (u.origin === location.origin && u.pathname.replace(/\/+$/, "") === "/account" && location.pathname.replace(/\/+$/, "") === "/account") {
          e.preventDefault();
          history.pushState({}, "", u.pathname + u.search);
          closeAllPayModals();
          syncAccountViewMode();
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
      });
      window.addEventListener("popstate", function () {
        closeAllPayModals();
        syncAccountViewMode();
      });
    }

    if (!document.body.dataset.boundPayEsc) {
      document.body.dataset.boundPayEsc = "1";
      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape") closeAllPayModals();
      });
    }

    // 1. PromptPay Form & QR Actions
    once("f-pp", function (f) {
      var m = f.querySelector(".xn-msg");
      var chips = f.querySelectorAll("[data-amt]");
      chips.forEach(function (b) {
        b.addEventListener("click", function () {
          f.amount.value = b.dataset.amt;
          chips.forEach(function (x) { x.classList.toggle("on", x === b); });
        });
      });
      if (f.amount) {
        f.amount.addEventListener("input", function () {
          var v = String(f.amount.value || "").trim();
          chips.forEach(function (x) { x.classList.toggle("on", x.dataset.amt === v); });
        });
      }
      f.addEventListener("submit", function (e) {
        e.preventDefault();
        var submit = f.querySelector('button[type="submit"]');
        if (submit && submit.disabled) return;
        if (submit) submit.disabled = true;
        msg(m, "กำลังสร้าง QR Code...", true);
        api("/api/wallet/promptpay", { method: "POST", body: { amount: Number(f.amount.value) } })
          .then(function (d) {
            msg(m, "");
            showPP(d);
            refresh();
            if (window.XenaryFirebase && typeof window.XenaryFirebase.syncTopupToFirestore === "function") {
              window.XenaryFirebase.syncTopupToFirestore({ id: d.id, method: "promptpay", amount: d.amount }).catch(function () {});
            }
          })
          .catch(function (x) { msg(m, x.message); })
          .finally(function () { if (submit) submit.disabled = false; });
      });
    });

    once("pp-new-qr", function (b) {
      b.addEventListener("click", function () {
        if (b.disabled) return;
        var amtInput = $("f-pp") && $("f-pp").amount ? Number($("f-pp").amount.value) || 100 : 100;
        b.disabled = true;
        msg($("pp-status"), "กำลังสร้าง QR Code ใหม่...", true);
        api("/api/wallet/promptpay", { method: "POST", body: { amount: amtInput } })
          .then(function (d) { showPP(d); refresh(); })
          .catch(function (x) {
            stopPP();
            if ($("pp-result")) $("pp-result").hidden = true;
            if ($("f-pp")) $("f-pp").hidden = false;
            msg($("pp-status"), x.message || "สร้าง QR ใหม่ไม่สำเร็จ");
          })
          .finally(function () { b.disabled = false; });
      });
    });

    once("pp-cancel", function (b) {
      b.addEventListener("click", function () {
        if (!ppId) {
          if ($("pp-result")) $("pp-result").hidden = true;
          if ($("f-pp")) $("f-pp").hidden = false;
          closeAllPayModals();
          return;
        }
        if (b.disabled) return;
        b.disabled = true;
        api("/api/wallet/promptpay/" + encodeURIComponent(ppId) + "/cancel", { method: "POST", body: {} })
          .then(function () {
            stopPP();
            if ($("pp-result")) $("pp-result").hidden = true;
            if ($("f-pp")) $("f-pp").hidden = false;
            closeAllPayModals();
            refresh();
          })
          .catch(function () {
            stopPP();
            if ($("pp-result")) $("pp-result").hidden = true;
            if ($("f-pp")) $("f-pp").hidden = false;
            closeAllPayModals();
          })
          .finally(function () { b.disabled = false; });
      });
    });

    once("pp-demo", function (b) {
      b.addEventListener("click", function () {
        if (!ppId || b.disabled) return;
        b.disabled = true;
        api("/api/wallet/promptpay/" + encodeURIComponent(ppId) + "/simulate", { method: "POST", body: {} })
          .then(function () {
            msg($("pp-status"), "เติมเงินสำเร็จ!", true);
            stopPP();
            refresh();
            document.dispatchEvent(new Event("xn:auth"));
            setTimeout(function () {
              if ($("pp-result")) $("pp-result").hidden = true;
              if ($("f-pp")) $("f-pp").hidden = false;
              closeAllPayModals();
            }, 800);
          })
          .catch(function (x) { msg($("pp-status"), x.message || "ยืนยันรายการไม่สำเร็จ"); })
          .finally(function () { b.disabled = false; });
      });
    });

    // 2. Bank Transfer / Slip Upload Modal
    var bankChannels = [];
    function renderBankChannelCard() {
      var sel = $("bank-channel-select");
      var ch = bankChannels.filter(function (c) { return sel && String(c.id) === String(sel.value); })[0] || bankChannels[0];
      if (!ch) {
        ch = {
          id: "ch_kbank_default",
          name: "กสิกรไทย",
          bank_name: "กสิกรไทย",
          account_no: "146-8-73566-7",
          account_name: "XENARY STORE",
        };
      }
      if ($("bank-disp-name")) $("bank-disp-name").textContent = ch.bank_name || ch.name || "กสิกรไทย";
      if ($("bank-disp-no")) $("bank-disp-no").textContent = ch.account_no || "146-8-73566-7";
      if ($("bank-disp-owner")) $("bank-disp-owner").textContent = "ชื่อบัญชี: " + (ch.account_name || "XENARY STORE");
    }

    api("/api/manual-topup/channels").then(function (d) {
      bankChannels = (d && Array.isArray(d.channels) && d.channels.length) ? d.channels : [
        {
          id: "ch_kbank_default",
          name: "กสิกรไทย",
          bank_name: "กสิกรไทย",
          account_no: "146-8-73566-7",
          account_name: "XENARY STORE",
        },
      ];
      var sel = $("bank-channel-select");
      var wrap = $("bank-channel-select-wrap");
      if (sel) {
        sel.innerHTML = "";
        bankChannels.forEach(function (c) {
          var opt = document.createElement("option");
          opt.value = c.id;
          opt.textContent = (c.bank_name || c.name) + " — " + c.account_no + " (" + c.account_name + ")";
          sel.appendChild(opt);
        });
        if (wrap) wrap.hidden = bankChannels.length <= 1;
        sel.addEventListener("change", renderBankChannelCard);
      }
      renderBankChannelCard();
    }).catch(function () {
      renderBankChannelCard();
    });

    // Click account number to copy
    once("bank-disp-no", function (el) {
      el.addEventListener("click", function () {
        var raw = el.textContent.trim();
        if (!raw) return;
        if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
          navigator.clipboard.writeText(raw).catch(function () {});
        }
        var prev = raw;
        el.textContent = "คัดลอกเลขบัญชีแล้ว ✓";
        setTimeout(function () { el.textContent = prev; }, 1200);
      });
    });

    // Slip dropzone file upload
    once("bank-slip-dropzone", function (dz) {
      var fileInput = $("bank-slip-file");
      var hiddenData = $("bank-slip-data");
      var placeholder = $("bank-slip-placeholder");
      var previewWrap = $("bank-slip-preview-wrap");
      var previewImg = $("bank-slip-preview");
      var fileNameLbl = $("bank-slip-filename");

      dz.addEventListener("click", function () {
        if (fileInput) fileInput.click();
      });

      if (fileInput) {
        fileInput.addEventListener("change", function () {
          var file = fileInput.files && fileInput.files[0];
          if (!file) return;
          var slipForm = $("f-bank-slip");
          var slipMsg = slipForm ? slipForm.querySelector(".xn-msg") : null;
          msg(slipMsg, "");
          readAndCompressImage(file, function (err, dataUrl) {
            if (err || !dataUrl) {
              fileInput.value = "";
              if (hiddenData) hiddenData.value = "";
              if (placeholder) placeholder.hidden = false;
              if (previewWrap) previewWrap.hidden = true;
              msg(slipMsg, (err && err.message) || "ไม่สามารถอ่านไฟล์รูปภาพนี้ได้");
              return;
            }
            if (hiddenData) hiddenData.value = dataUrl;
            if (previewImg) previewImg.src = dataUrl;
            if (fileNameLbl) fileNameLbl.textContent = file.name + " (คลิกเพื่อเปลี่ยนรูป)";
            if (placeholder) placeholder.hidden = true;
            if (previewWrap) previewWrap.hidden = false;
          });
        });
      }
    });

    once("f-bank-slip", function (f) {
      var m = f.querySelector(".xn-msg");
      f.addEventListener("submit", function (e) {
        e.preventDefault();
        var slipData = $("bank-slip-data") ? $("bank-slip-data").value.trim() : "";
        var qrPayload = $("bank-qr-payload") ? $("bank-qr-payload").value.trim() : "";
        if (!slipData && !qrPayload) {
          msg(m, "กรุณาอัปโหลดรูปภาพสลิป หรือวาง Payload จาก QR Code");
          return;
        }
        var submit = f.querySelector('button[type="submit"]');
        if (submit && submit.disabled) return;
        if (submit) submit.disabled = true;
        msg(m, "กำลังส่งข้อมูลยืนยันสลิป...", true);
        api("/api/manual-topup", {
          method: "POST",
          body: {
            channel_id: f.channel_id ? f.channel_id.value : "ch_kbank_default",
            amount: Number(f.amount.value) || 100,
            slip_url: slipData || qrPayload,
            qr_payload: qrPayload || null,
          },
        })
          .then(function (r) {
            msg(m, "ส่งสลิปโอนเงินสำเร็จ! ระบบกำลังตรวจสอบรายการของคุณ", true);
            if ($("bank-slip-file")) $("bank-slip-file").value = "";
            if ($("bank-slip-data")) $("bank-slip-data").value = "";
            if ($("bank-qr-payload")) $("bank-qr-payload").value = "";
            if ($("bank-slip-placeholder")) $("bank-slip-placeholder").hidden = false;
            if ($("bank-slip-preview-wrap")) $("bank-slip-preview-wrap").hidden = true;
            if (window.XenaryFirebase && typeof window.XenaryFirebase.syncTopupToFirestore === "function" && r && r.topup) {
              window.XenaryFirebase.syncTopupToFirestore({ id: r.topup.id, method: "slip", amount: r.topup.amount }).catch(function () {});
            }
            refresh();
            setTimeout(function () {
              msg(m, "");
              closeAllPayModals();
            }, 1300);
          })
          .catch(function (x) { msg(m, x.message); })
          .finally(function () { if (submit) submit.disabled = false; });
      });
    });

    // 3. TrueMoney Angpao Form
    once("f-tm", function (f) {
      var m = f.querySelector(".xn-msg");
      f.addEventListener("submit", function (e) {
        e.preventDefault();
        var submit = f.querySelector('button[type="submit"]');
        if (submit && submit.disabled) return;
        if (submit) submit.disabled = true;
        msg(m, "กำลังตรวจสอบซองอั่งเปา...", true);
        api("/api/wallet/truemoney", { method: "POST", body: { link: f.link.value } })
          .then(function (r) {
            msg(m, "เติมเงิน " + money(r.amount) + " สำเร็จ!", true);
            f.reset();
            refresh();
            document.dispatchEvent(new Event("xn:auth"));
            setTimeout(function () {
              msg(m, "");
              closeAllPayModals();
            }, 1200);
          })
          .catch(function (x) { msg(m, x.message); })
          .finally(function () { if (submit) submit.disabled = false; });
      });
    });

    // 4. Store Gift Code / Coupon Form
    once("f-redeem-coupon", function (f) {
      var m = f.querySelector(".xn-msg");
      f.addEventListener("submit", function (e) {
        e.preventDefault();
        var submit = f.querySelector('button[type="submit"]');
        if (submit && submit.disabled) return;
        if (submit) submit.disabled = true;
        msg(m, "กำลังตรวจสอบโค้ด...", true);
        api("/api/coupon/redeem", { method: "POST", body: { code: f.code.value } })
          .then(function (r) {
            msg(m, r.message || ("แลกโค้ดสำเร็จ! ได้รับ " + money(r.amount)), true);
            f.reset();
            refresh();
            document.dispatchEvent(new Event("xn:auth"));
            setTimeout(function () {
              msg(m, "");
              closeAllPayModals();
            }, 1200);
          })
          .catch(function (x) { msg(m, x.message); })
          .finally(function () { if (submit) submit.disabled = false; });
      });
    });
  }

  function boot() {
    bindAuth("f-login", "/api/auth/login");
    bindAuth("f-register", "/api/auth/register");
    bindGoogleAuth();
    initAccount();
  }
  window.__xenary_init_account = boot;
  boot();
  window.addEventListener("hashchange", function () { stopPP(); boot(); });
})();

 
var DISCORD_URL = "https://discord.gg/xenary";

var CONTACT_PLATFORMS = {
  discord: {
    code: "DISCORD",
    cls: "sup-discord",
    btnText: "เข้าร่วม Discord",
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>',
  },
  line: {
    code: "LINE OFFICIAL",
    cls: "sup-line",
    btnText: "แอดไลน์ / ทักแชท",
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>',
  },
  facebook: {
    code: "FACEBOOK PAGE",
    cls: "sup-facebook",
    btnText: "เปิดเพจ / ทักแชท",
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>',
  },
  telegram: {
    code: "TELEGRAM",
    cls: "sup-telegram",
    btnText: "เข้าร่วม Telegram",
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" x2="11" y1="2" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>',
  },
  instagram: {
    code: "INSTAGRAM",
    cls: "sup-instagram",
    btnText: "เปิด Instagram",
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/></svg>',
  },
  youtube: {
    code: "YOUTUBE",
    cls: "sup-youtube",
    btnText: "ดูช่อง YouTube",
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17"/><path d="m10 15 5-3-5-3v6Z"/></svg>',
  },
  tiktok: {
    code: "TIKTOK",
    cls: "sup-tiktok",
    btnText: "เปิด TikTok",
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5"/></svg>',
  },
  email: {
    code: "EMAIL SUPPORT",
    cls: "sup-email",
    btnText: "ส่งอีเมลติดต่อ",
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>',
  },
  phone: {
    code: "HOTLINE / CALL",
    cls: "sup-phone",
    btnText: "โทรติดต่อทันที",
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>',
  },
  custom: {
    code: "OFFICIAL LINK",
    cls: "sup-custom",
    btnText: "เปิดลิงก์ติดต่อ",
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" x2="22" y1="12" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
  },
};

function escHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

function safeContactUrl(rawUrl, pfKey) {
  var u = String(rawUrl || "").trim();
  if (!u) return "#";
  if (pfKey === "email" && u.indexOf("mailto:") !== 0 && u.indexOf("http") !== 0) {
    return "mailto:" + u.replace(/^javascript:/i, "");
  }
  if (pfKey === "phone" && u.indexOf("tel:") !== 0 && u.indexOf("http") !== 0) {
    return "tel:" + u.replace(/[^0-9+*#-]/g, "");
  }
  if (/^(https?:\/\/|mailto:|tel:|\/(?!\/)|#)/i.test(u)) {
    return u;
  }
  return "#";
}

function renderContactCards(links) {
  var grid = document.getElementById("inf-contact-grid");
  if (!grid) return;
  grid.innerHTML = "";

  var safeLinks = Array.isArray(links) && links.length ? links : [];
  safeLinks.forEach(function (item) {
    var pfKey = String(item.platform || "custom").toLowerCase();
    var meta = CONTACT_PLATFORMS[pfKey] || CONTACT_PLATFORMS.custom;
    var card = document.createElement("article");
    card.className = "inf-pay-card inf-contact-card";

    var href = safeContactUrl(item.url, pfKey);
    var handleText = String(item.handle || item.url || "-");
    var labelText = String(item.label || meta.code);
    var badgeText = String(item.badge || "ออนไลน์");
    var descText = String(item.description || "ติดต่อสอบถามข้อมูลหรือแจ้งปัญหาผ่านช่องทางนี้");

    card.innerHTML =
      '<div class="inf-pay-card-top">' +
        '<span class="inf-pay-code">' + escHtml(meta.code) + '</span>' +
        '<span class="inf-pay-badge">' + escHtml(badgeText) + '</span>' +
      '</div>' +
      '<div class="inf-pay-logo ' + meta.cls + '" aria-hidden="true">' + meta.svg + '</div>' +
      '<h3 class="inf-pay-title">' + escHtml(labelText) + '</h3>' +
      '<p class="inf-pay-sub">' + escHtml(descText) + '</p>' +
      '<button type="button" class="inf-pay-min inf-copy-handle" title="คลิกเพื่อคัดลอกไอดี">' + escHtml(handleText) + '</button>' +
      '<a href="' + escHtml(href) + '" target="_blank" rel="noopener noreferrer" class="inf-pay-action-btn" style="text-decoration:none;box-sizing:border-box;">' +
        '<span>' + escHtml(meta.btnText) + '</span>' +
        '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17L17 7M17 7H7M17 7V17"/></svg>' +
      '</a>' +
      '<div class="inf-pay-foot">' +
        '<span>' + escHtml(labelText) + '</span>' +
        '<span>คลิกไอดีเพื่อคัดลอก</span>' +
      '</div>';

    var copyBtn = card.querySelector(".inf-copy-handle");
    if (copyBtn) {
      copyBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
          navigator.clipboard.writeText(handleText).catch(function () {});
        }
        copyBtn.textContent = "คัดลอกแล้ว: " + handleText;
        copyBtn.style.color = "#34d399";
        setTimeout(function () {
          copyBtn.textContent = handleText;
          copyBtn.style.color = "";
        }, 1400);
      });
    }

    grid.appendChild(card);
  });
}

function initDiscordStatus() {
  fetch("/api/support", { cache: "no-store" })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      var links = (d && Array.isArray(d.links)) ? d.links : [];
      var discordItem = links.filter(function (x) { return x.platform === "discord"; })[0];
      var candidateDiscord = (d && d.discord_url) ? d.discord_url : ((discordItem && discordItem.url) ? discordItem.url : "");
      var safeDiscord = candidateDiscord ? safeContactUrl(candidateDiscord, "discord") : "#";
      if (safeDiscord && safeDiscord !== "#") DISCORD_URL = safeDiscord;

      renderContactCards(links);

      document.querySelectorAll("[data-discord]").forEach(function (a) {
        if (DISCORD_URL) {
          a.href = DISCORD_URL;
          a.target = "_blank";
          a.rel = "noopener noreferrer";
          a.removeAttribute("aria-disabled");
        }
      });
    })
    .catch(function () {});
}

function initStatusTile() {
  var box = document.getElementById("xn-status");
  if (!box) return;
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function tile(l, v, c) { return '<div class="xn-card xn-tile"><span>' + l + '</span><b class="' + (c || "") + '">' + v + '</b></div>'; }
  function fmt(s) { var d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60); return (d ? d + " วัน " : "") + h + " ชม. " + m + " นาที"; }
  fetch("/api/status", { cache: "no-store" }).then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (s) {
    var updCount = Number(s.updatingCount) || 0;
    var isMaint = Boolean(s.maintenance);
    box.innerHTML =
      tile("สถานะระบบ", isMaint ? "กำลังปิดปรับปรุง" : "ออนไลน์", isMaint ? "xn-warn" : "xn-on") +
      tile("ทำงานมาแล้ว", fmt(s.uptimeSec)) +
      tile("สินค้าทั้งหมด", s.products) +
      tile("กำลังปิดอัปเดต", updCount + " รายการ", updCount > 0 ? "xn-warn" : "xn-on");

    var prodBox = document.getElementById("xn-status-products");
    if (prodBox && Array.isArray(s.items)) {
      if (!s.items.length) {
        prodBox.innerHTML = "";
        return;
      }
      var rows = s.items.map(function (it) {
        var isUpd = Boolean(it.updating || it.status_mode === "updating");
        var hasStock = Number(it.stock) > 0;
        var badgeCls = isUpd ? "updating" : (hasStock ? "ok" : "out");
        var badgeText = isUpd
          ? ("กำลังปิดอัปเดต" + (it.update_note ? " · " + it.update_note : ""))
          : (hasStock ? "ปลอดภัย / พร้อมใช้งาน" : "รอเติมสต็อก");

        return (
          '<a href="/products/?item=' + encodeURIComponent(it.slug) + '" class="xn-status-card">' +
            '<div class="xn-status-left">' +
              '<span class="xn-status-tag">' + esc((it.tag || "VALORANT").toUpperCase()) + '</span>' +
              '<strong class="xn-status-title">' + esc(it.name) + '</strong>' +
            '</div>' +
            '<div class="xn-status-right">' +
              '<span class="xn-status-stock">คงเหลือ ' + Number(it.stock || 0) + ' ชิ้น</span>' +
              '<span class="xn-status-pill ' + badgeCls + '">' + esc(badgeText) + '</span>' +
            '</div>' +
          '</a>'
        );
      }).join("");

      prodBox.innerHTML =
        '<h2 style="font-size:18px;font-weight:700;margin:0 0 12px;color:#fff;">สถานะสินค้าแต่ละรายการ</h2>' +
        '<div style="display:flex;flex-direction:column;gap:10px;">' + rows + '</div>';
    }
  }).catch(function () { box.innerHTML = tile("สถานะระบบ", "ออฟไลน์", "xn-off"); });
}

(function () {
  function el(tag, attrs, text) { var e = document.createElement(tag); for (var k in attrs) e.setAttribute(k, attrs[k]); if (text) e.textContent = text; return e; }

  var NAV_ICONS = {
    "/": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
    "/products": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>',
    "/account": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>',
    "/status": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>',
    "/tos": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
    "/contact": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
  };

  function decorateNavBar() {
    var nav = document.querySelector(".xn-nav");
    var linksBox = document.querySelector(".xn-links");
    var userBox = document.getElementById("xn-user");
    if (!nav || !linksBox) return;


    if (userBox && userBox.parentNode === linksBox) {
      nav.appendChild(userBox);
    }

     
    if (!linksBox.querySelector('a[href="/account/"]')) {
      var prodLink = linksBox.querySelector('a[href="/products/"]');
      var topupLink = document.createElement("a");
      topupLink.setAttribute("href", "/account/");
      topupLink.textContent = "เติมเงิน";
      if (prodLink && prodLink.nextSibling) {
        linksBox.insertBefore(topupLink, prodLink.nextSibling);
      } else {
        linksBox.appendChild(topupLink);
      }
    }

     
    var curCleanPath = location.pathname.replace(/\/+$/, "") || "/";
    var isOrdersView = curCleanPath === "/account" && new URLSearchParams(location.search).get("tab") === "orders";
    linksBox.querySelectorAll("a").forEach(function (a) {
      var href = (a.getAttribute("href") || "").replace(/\/+$/, "") || "/";
      if (a.dataset.iconized !== "1") {
        var label = a.textContent.trim();
        if (href === "/" && label === "หน้าแรก") label = "หน้าหลัก";
        if (href === "/products" && label === "สินค้า") label = "ร้านค้า";
        var svg = NAV_ICONS[href] || "";
        a.innerHTML = svg + "<span>" + escHtml(label) + "</span>";
        a.dataset.iconized = "1";
      }
      if (href === "/account") {
        a.classList.toggle("on", curCleanPath === "/account" && !isOrdersView);
      } else {
        a.classList.toggle("on", href === curCleanPath);
      }
    });

     
    var foot = document.querySelector("footer.xn-foot");
    if (foot && !foot.querySelector(".xn-foot-inner")) {
      foot.innerHTML =
        '<div class="xn-foot-inner">' +
          '<div class="xn-foot-left">' +
            '<span>© 2026 XENARY. All rights reserved.</span>' +
            '<span>&middot;</span>' +
            '<span>Made with <span class="xn-foot-heart">&#10084;</span> by XENARY</span>' +
          '</div>' +
          '<div class="xn-foot-studio">' +
            '<span>สนใจเปิดเว็บติดต่อ <a href="/contact/">XENARY - Studio</a></span>' +
          '</div>' +
        '</div>';
    }
  }

  function render(user) {
    decorateNavBar();
    var box = document.getElementById("xn-user");
    if (!box) return;
    box.innerHTML = "";
    if (!user) {
      var loginA = el("a", { href: "/login/", class: "xn-login-btn" });
      loginA.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" x2="3" y1="12" y2="12"/></svg><span>เข้าสู่ระบบ</span>';
      box.appendChild(loginA);
      box.appendChild(el("a", { href: "/register/", class: "cta" }, "สมัครสมาชิก"));
    } else {
      if (user.role === "admin") {
        var isAdmPage = location.pathname.startsWith("/admin");
        var admLink = el("a", { href: "/admin/", class: "xn-adm-pill" + (isAdmPage ? " on" : ""), title: "เปิดศูนย์ควบคุมแอดมิน" }, "แอดมิน");
        box.appendChild(admLink);
      }
      var userLink = el("a", { href: "/account/", class: "xn-user-prof", title: "ยอดเงินคงเหลือ ฿" + Number(user.balance || 0).toLocaleString("en-US", { minimumFractionDigits: 2 }) });
      userLink.innerHTML =
        '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>' +
        '<span>' + escHtml(user.username || "") + '</span>' +
        '<span class="xn-user-bal">฿' + Number(user.balance || 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + '</span>';
      box.appendChild(userLink);

      var isOrdersTab = location.pathname.startsWith("/account") && new URLSearchParams(location.search).get("tab") === "orders";
      var ordBtn = el("a", { href: "/account/?tab=orders", class: "xn-ord-hist-btn" + (isOrdersTab ? " on" : "") }, "ประวัติการสั่งซื้อ");
      box.appendChild(ordBtn);

      var b = el("button", { type: "button", class: "xn-out xn-out-icon", title: "ออกจากระบบ", "aria-label": "ออกจากระบบ" });
      b.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>';
      b.addEventListener("click", function () {
        try { localStorage.removeItem("xn_cached_user"); } catch (e) {}
        if (window.XenaryFirebase && typeof window.XenaryFirebase.signOut === "function") {
          window.XenaryFirebase.signOut().catch(function () {});
        }
        fetch("/api/auth/logout", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        })
          .catch(function () {})
          .finally(function () {
            document.dispatchEvent(new Event("xn:auth"));
            location.href = "/";
          });
      });
      box.appendChild(b);
    }
  }

  decorateNavBar();


  try {
    var cached = localStorage.getItem("xn_cached_user");
    if (cached) {
      render(JSON.parse(cached));
    }
  } catch (e) {}


  function load() {
    fetch("/api/auth/me", { cache: "no-store", credentials: "same-origin" })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d.user) {
          try { localStorage.setItem("xn_cached_user", JSON.stringify(d.user)); } catch (e) {}
          render(d.user);
        } else {
          try { localStorage.removeItem("xn_cached_user"); } catch (e) {}
          render(null);
        }
      })
      .catch(function () {
        try { localStorage.removeItem("xn_cached_user"); } catch (e) {}
        render(null);
      });
  }

  document.addEventListener("xn:auth", load);
  load();

  initDiscordStatus();
  initStatusTile();

   
  var pjaxProgress = null;
  function showProgress() {
    if (!pjaxProgress) {
      pjaxProgress = document.createElement("div");
      pjaxProgress.id = "xn-pjax-bar";
      pjaxProgress.style.cssText = "position:fixed;top:0;left:0;height:2.5px;width:0%;background:#ffffff;box-shadow:0 0 10px rgba(255,255,255,0.8);z-index:999999;transition:width 0.25s ease,opacity 0.2s ease;";
      document.body.appendChild(pjaxProgress);
    }
    pjaxProgress.style.opacity = "1";
    pjaxProgress.style.width = "20%";
    setTimeout(function () { if (pjaxProgress) pjaxProgress.style.width = "70%"; }, 50);
  }
  function hideProgress() {
    if (pjaxProgress) {
      pjaxProgress.style.width = "100%";
      setTimeout(function () {
        if (pjaxProgress) {
          pjaxProgress.style.opacity = "0";
          setTimeout(function () { if (pjaxProgress) pjaxProgress.style.width = "0%"; }, 200);
        }
      }, 100);
    }
  }

  function updateNavLinks(pathname) {
    var cleanPath = pathname.replace(/\/+$/, "") || "/";
    var isOrdersView = cleanPath === "/account" && new URLSearchParams(location.search).get("tab") === "orders";
    document.querySelectorAll(".xn-links a").forEach(function (a) {
      if (a.classList.contains("xn-pill") || a.classList.contains("xn-adm-pill") || a.classList.contains("cta")) return;
      var aPath = (a.getAttribute("href") || "").replace(/\/+$/, "") || "/";
      if (aPath === "/account") {
        a.classList.toggle("on", cleanPath === "/account" && !isOrdersView);
      } else {
        a.classList.toggle("on", aPath === cleanPath);
      }
    });
  }

  function runPageScripts(newMain) {
     
    if (location.pathname.indexOf("/status") !== -1) {
      initStatusTile();
    }
     
    initDiscordStatus();
     
    if (document.getElementById("sx-product-grid")) {
      if (typeof window.__xenary_init_shop === "function") {
        window.__xenary_init_shop();
      } else {
        var shopScript = document.createElement("script");
        shopScript.src = "/src/client/shop/shop.js";
        document.body.appendChild(shopScript);
      }
    }
    if (document.getElementById("inf-view-topup") || document.getElementById("inf-view-orders") || document.getElementById("f-login") || document.getElementById("f-register")) {
      if (typeof window.__xenary_init_account === "function") {
        window.__xenary_init_account();
      } else {
        var accScript = document.createElement("script");
        accScript.src = "/assets/js/account.js";
        document.body.appendChild(accScript);
      }
    }
     
    if (newMain) {
      newMain.querySelectorAll("script").forEach(function (oldScript) {
        var srcAttr = oldScript.getAttribute("src") || "";
        if (srcAttr && /(shop|site|account|admin)\.js/i.test(srcAttr)) return;
        var s = document.createElement("script");
        Array.from(oldScript.attributes).forEach(function (attr) { s.setAttribute(attr.name, attr.value); });
        s.textContent = oldScript.textContent;
        oldScript.parentNode.replaceChild(s, oldScript);
      });
    }
  }

  var lastPjaxPath = location.pathname.replace(/\/+$/, "") || "/";

  function pjaxNavigate(url, push) {
    var curMain = document.querySelector("main.xn-main");
    if (!curMain) {
      location.href = url;
      return;
    }
    showProgress();
    curMain.style.transition = "opacity 0.12s ease";
    curMain.style.opacity = "0.4";

    fetch(url, { headers: { "X-Requested-With": "XenaryPjax" }, cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.text();
      })
      .then(function (html) {
        var doc = new DOMParser().parseFromString(html, "text/html");
        var nextMain = doc.querySelector("main.xn-main");
        if (!nextMain) {
          location.href = url;
          return;
        }

         
        if (doc.title) document.title = doc.title;

         
        curMain.innerHTML = nextMain.innerHTML;
        curMain.className = nextMain.className;
        curMain.id = nextMain.id;
        window.scrollTo({ top: 0, behavior: "instant" });
        curMain.style.opacity = "1";

        if (push) {
          history.pushState({ pjaxUrl: url }, doc.title || "", url);
        }
        lastPjaxPath = location.pathname.replace(/\/+$/, "") || "/";

        updateNavLinks(location.pathname);
        runPageScripts(curMain);
        hideProgress();
      })
      .catch(function () {
        hideProgress();
        location.href = url;
      });
  }

   
  document.addEventListener("click", function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest("a");
    if (!a || !a.href) return;

    var targetUrl;
    try {
      targetUrl = new URL(a.href, location.origin);
    } catch (err) {
      return;
    }
    if (targetUrl.origin !== location.origin) return;  
    if (a.hasAttribute("download") || a.target === "_blank") return;

    var p = targetUrl.pathname;
    var cleanTargetPath = p.replace(/\/+$/, "") || "/";
    var cleanCurrentPath = location.pathname.replace(/\/+$/, "") || "/";

    if (location.pathname.startsWith("/admin/")) return;
    if (p.startsWith("/admin/")) return;
    if (cleanTargetPath === "/account" && cleanCurrentPath === "/account") {
      return;
    }
    if (p === location.pathname && targetUrl.search === location.search && targetUrl.hash) {
      return;  
    }

     
    e.preventDefault();
    pjaxNavigate(targetUrl.href, true);
  });

  window.addEventListener("popstate", function () {
    var curPath = location.pathname.replace(/\/+$/, "") || "/";
    if (curPath === lastPjaxPath && (curPath === "/products" || curPath === "/account")) {
      updateNavLinks(location.pathname);
      return;
    }
    pjaxNavigate(location.href, false);
  });

   
  (function initFloatingBrandCanvas() {
    if (document.getElementById("xn-bg-canvas")) return;
    var canvas = document.createElement("canvas");
    canvas.id = "xn-bg-canvas";
    canvas.setAttribute("aria-hidden", "true");
    document.body.insertBefore(canvas, document.body.firstChild);

    var ctx = canvas.getContext("2d");
    if (!ctx) return;

    var w = 0;
    var h = 0;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var mouse = { x: -9999, y: -9999, cx: 0, cy: 0 };

    function resize() {
      w = window.innerWidth || document.documentElement.clientWidth || 1280;
      h = window.innerHeight || document.documentElement.clientHeight || 720;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!mouse.cx && !mouse.cy) {
        mouse.cx = w * 0.5;
        mouse.cy = h * 0.5;
      }
    }
    resize();
    window.addEventListener("resize", resize, { passive: true });
    window.addEventListener("mousemove", function (e) {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    }, { passive: true });

    var logoImg = new Image();
    var logoLoaded = false;
    logoImg.onload = function () { logoLoaded = true; };
    logoImg.src = "/assets/img/float-logo.png";

    var count = Math.min(26, Math.max(16, Math.floor((window.innerWidth || 1280) / 75)));
    var items = [];
    for (var i = 0; i < count; i++) {
      var depth = 0.35 + Math.random() * 0.65;
      items.push({
        x: Math.random() * (w || 1280),
        y: Math.random() * (h || 800),
        size: Math.round(30 + depth * 46),
        vx: (Math.random() - 0.5) * 0.42 * depth,
        vy: (-0.2 - Math.random() * 0.4) * depth,
        swayAmp: 0.35 + Math.random() * 0.65,
        swayFreq: 0.007 + Math.random() * 0.012,
        phase: Math.random() * Math.PI * 2,
        angle: (Math.random() - 0.5) * Math.PI,
        vAngle: (Math.random() - 0.5) * 0.006,
        alpha: 0.08 + depth * 0.16,
        depth: depth
      });
    }

    var tick = 0;
    function render() {
      if (document.hidden) {
        requestAnimationFrame(render);
        return;
      }
      tick += 1;
      ctx.clearRect(0, 0, w, h);

      if (mouse.x > 0 && mouse.y > 0) {
        mouse.cx += (mouse.x - mouse.cx) * 0.06;
        mouse.cy += (mouse.y - mouse.cy) * 0.06;
      } else {
        mouse.cx = w * 0.5 + Math.sin(tick * 0.01) * 100;
        mouse.cy = h * 0.4 + Math.cos(tick * 0.008) * 70;
      }

      var parX = ((mouse.cx / (w || 1)) - 0.5) * 24;
      var parY = ((mouse.cy / (h || 1)) - 0.5) * 24;

      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        it.x += it.vx + Math.sin(tick * it.swayFreq + it.phase) * it.swayAmp;
        it.y += it.vy + Math.cos(tick * it.swayFreq * 0.8 + it.phase) * 0.18;
        it.angle += it.vAngle;

        if (mouse.x > 0 && mouse.y > 0) {
          var dx = it.x - mouse.x;
          var dy = it.y - mouse.y;
          var dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 160 && dist > 1) {
            var push = (1 - dist / 160) * 1.4;
            it.x += (dx / dist) * push;
            it.y += (dy / dist) * push;
          }
        }

        var pad = it.size + 30;
        if (it.y < -pad) {
          it.y = h + pad;
          it.x = Math.random() * w;
        } else if (it.y > h + pad) {
          it.y = -pad;
        }
        if (it.x < -pad) it.x = w + pad;
        if (it.x > w + pad) it.x = -pad;

        var drawX = it.x + parX * it.depth * 0.5;
        var drawY = it.y + parY * it.depth * 0.5;
        var pulseAlpha = it.alpha * (0.85 + 0.15 * Math.sin(tick * 0.02 + it.phase));

        ctx.save();
        ctx.translate(drawX, drawY);
        ctx.rotate(it.angle);
        ctx.globalAlpha = pulseAlpha;

        if (logoLoaded) {
          var half = it.size * 0.5;
          ctx.shadowColor = "rgba(255, 255, 255, 0.45)";
          ctx.shadowBlur = 12 * it.depth;
          ctx.drawImage(logoImg, -half, -half, it.size, it.size);
        }
        ctx.restore();
      }

      requestAnimationFrame(render);
    }

    requestAnimationFrame(render);
  })();

   
  (function initMiniMusicPlayer() {
    if (document.getElementById("xn-music-widget")) return;

    var VIDEO_ID = "DeVDKGxyDY4";
    var TITLE = "SURIYA MQT -YUNG TON...";
    var ARTIST = "YouTube Audio";
    var COVER = "https://i.ytimg.com/vi/" + VIDEO_ID + "/hqdefault.jpg";
    var YT_URL = "https://www.youtube.com/watch?v=" + VIDEO_ID;

    var wrap = document.createElement("div");
    wrap.id = "xn-music-widget";
    wrap.className = "xn-mp-widget";

    wrap.innerHTML =
      '<div class="xn-mp-dock" id="xn-mp-dock">' +
        '<button type="button" class="xn-mp-trigger" id="xn-mp-btn" title="เครื่องเล่นเพลง" aria-label="เครื่องเล่นเพลง">' +
          '<img src="' + escHtml(COVER) + '" alt="Music Cover">' +
          '<span class="xn-mp-trigger-badge">' +
            '<svg viewBox="0 0 24 24"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>' +
          '</span>' +
        '</button>' +
      '</div>' +

      '<div class="xn-mp-popup" id="xn-mp-card">' +
        '<div class="xn-mp-header">' +
          '<div class="xn-mp-title-wrap">' +
            '<div class="xn-mp-eq xn-hide" id="xn-mp-eq">' +
              '<span></span><span></span><span></span>' +
            '</div>' +
            '<span class="xn-mp-dots" id="xn-mp-dots">•••</span>' +
            '<span class="xn-mp-header-text" id="xn-mp-status-text">หยุดชั่วคราว</span>' +
          '</div>' +
          '<button type="button" class="xn-mp-close" id="xn-mp-close" aria-label="ปิด">' +
            '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>' +
          '</button>' +
        '</div>' +

        '<div class="xn-mp-track-card">' +
          '<img class="xn-mp-cover" src="' + escHtml(COVER) + '" alt="Cover">' +
          '<div class="xn-mp-meta">' +
            '<div class="xn-mp-track-name" title="' + escHtml(TITLE) + '">' + escHtml(TITLE) + '</div>' +
            '<div class="xn-mp-track-artist">' + escHtml(ARTIST) + '</div>' +
          '</div>' +
          '<a class="xn-mp-yt-link" href="' + escHtml(YT_URL) + '" target="_blank" rel="noopener noreferrer" title="เปิดบน YouTube">' +
            '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>' +
          '</a>' +
        '</div>' +

        '<div class="xn-mp-time-row">' +
          '<span id="xn-mp-cur-time">0:00</span>' +
          '<span id="xn-mp-dur-time">3:17</span>' +
        '</div>' +
        '<div class="xn-mp-progress-bar" id="xn-mp-seek-bar">' +
          '<div class="xn-mp-progress-fill" id="xn-mp-seek-fill"></div>' +
        '</div>' +

        '<div class="xn-mp-controls">' +
          '<button type="button" class="xn-mp-ctrl-btn" id="xn-mp-loop-btn" title="เล่นวนซ้ำ">' +
            '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/></svg>' +
          '</button>' +
          '<button type="button" class="xn-mp-play-btn" id="xn-mp-toggle-play" aria-label="เล่นหรือหยุดเพลง">' +
            '<svg id="xn-mp-play-icon" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>' +
            '<svg id="xn-mp-pause-icon" class="xn-hide" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>' +
          '</button>' +
          '<button type="button" class="xn-mp-ctrl-btn" id="xn-mp-mute-btn" title="ปิด/เปิดเสียง">' +
            '<svg id="xn-mp-vol-on-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>' +
            '<svg id="xn-mp-vol-off-icon" class="xn-hide" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>' +
          '</button>' +
        '</div>' +

        '<div class="xn-mp-volume-row">' +
          '<div class="xn-mp-vol-icon">' +
            '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>' +
          '</div>' +
          '<input type="range" class="xn-mp-vol-slider" id="xn-mp-vol-slider" min="0" max="100" value="35">' +
          '<span class="xn-mp-vol-text" id="xn-mp-vol-text">35%</span>' +
        '</div>' +
      '</div>' +

      '<div class="xn-mp-hidden-iframe">' +
        '<div id="xn-yt-player-target"></div>' +
      '</div>';

    document.body.appendChild(wrap);

     
    var btnTrigger = document.getElementById("xn-mp-btn");
    var cardPopup = document.getElementById("xn-mp-card");
    var btnClose = document.getElementById("xn-mp-close");
    var btnPlay = document.getElementById("xn-mp-toggle-play");
    var iconPlay = document.getElementById("xn-mp-play-icon");
    var iconPause = document.getElementById("xn-mp-pause-icon");
    var eqBar = document.getElementById("xn-mp-eq");
    var curTimeEl = document.getElementById("xn-mp-cur-time");
    var durTimeEl = document.getElementById("xn-mp-dur-time");
    var seekBar = document.getElementById("xn-mp-seek-bar");
    var seekFill = document.getElementById("xn-mp-seek-fill");
    var btnLoop = document.getElementById("xn-mp-loop-btn");
    var btnMute = document.getElementById("xn-mp-mute-btn");
    var iconVolOn = document.getElementById("xn-mp-vol-on-icon");
    var iconVolOff = document.getElementById("xn-mp-vol-off-icon");
    var volSlider = document.getElementById("xn-mp-vol-slider");
    var volText = document.getElementById("xn-mp-vol-text");

    var player = null;
    var isPlaying = false;
    var isLooping = true;
    var isMuted = false;
    var rawVol = parseInt(localStorage.getItem("xn_yt_vol") || "40", 10);
    var currentVol = Number.isFinite(rawVol) ? Math.max(0, Math.min(100, rawVol)) : 40;
    var rawTime = parseFloat(localStorage.getItem("xn_yt_time") || "0");
    var savedTime = Number.isFinite(rawTime) && rawTime >= 0 ? rawTime : 0;
    var shouldAutoPlay = localStorage.getItem("xn_yt_playing") !== "false";
    var timeInterval = null;

    btnLoop.classList.add("active");

    function formatTime(s) {
      s = Math.floor(s || 0);
      var m = Math.floor(s / 60);
      var sec = s % 60;
      return m + ":" + (sec < 10 ? "0" + sec : sec);
    }

    var isSeeking = false;

    function updatePlayState(playing) {
      isPlaying = playing;
      localStorage.setItem("xn_yt_playing", String(playing));
      var eqEl = document.getElementById("xn-mp-eq");
      var dotsEl = document.getElementById("xn-mp-dots");
      var statusEl = document.getElementById("xn-mp-status-text");

      if (playing) {
        if (dotsEl) dotsEl.classList.add("xn-hide");
        if (eqEl) {
          eqEl.classList.remove("xn-hide");
          eqEl.classList.add("active");
        }
        if (statusEl) statusEl.textContent = "กำลังเล่นเพลง";
        iconPlay.classList.add("xn-hide");
        iconPause.classList.remove("xn-hide");
        btnTrigger.classList.add("playing");
      } else {
        if (eqEl) {
          eqEl.classList.remove("active");
          eqEl.classList.add("xn-hide");
        }
        if (dotsEl) dotsEl.classList.remove("xn-hide");
        if (statusEl) statusEl.textContent = "หยุดชั่วคราว";
        iconPlay.classList.remove("xn-hide");
        iconPause.classList.add("xn-hide");
        btnTrigger.classList.remove("playing");
      }
    }

    function startTimeSync() {
      if (timeInterval) clearInterval(timeInterval);
      timeInterval = setInterval(function () {
        if (!player || typeof player.getCurrentTime !== "function" || isSeeking) return;
        var cur = player.getCurrentTime() || 0;
        var dur = player.getDuration() || 0;
        curTimeEl.textContent = formatTime(cur);
        durTimeEl.textContent = formatTime(dur);
        if (dur > 0) {
          var pct = Math.min(100, Math.max(0, (cur / dur) * 100));
          seekFill.style.width = pct + "%";
          localStorage.setItem("xn_yt_time", String(cur));
        }
      }, 500);
    }

     
    btnTrigger.addEventListener("click", function () {
      var isOpen = cardPopup.classList.toggle("open");
      wrap.classList.toggle("open", isOpen);
    });
    btnClose.addEventListener("click", function () {
      cardPopup.classList.remove("open");
      wrap.classList.remove("open");
    });

     
    function setupPlayer() {
      if (!window.YT || !window.YT.Player) return;
      player = new window.YT.Player("xn-yt-player-target", {
        height: "100",
        width: "100",
        videoId: VIDEO_ID,
        playerVars: {
          autoplay: 0,
          controls: 0,
          loop: 1,
          playlist: VIDEO_ID,
          modestbranding: 1,
          rel: 0
        },
        events: {
          onReady: function () {
            player.setVolume(currentVol);
            volSlider.value = currentVol;
            volText.textContent = currentVol + "%";
            if (savedTime > 1) {
              player.seekTo(savedTime, true);
            }
            startTimeSync();

            if (shouldAutoPlay) {
              player.playVideo();
            }

             
            var startTrigger = function () {
              if (player && typeof player.playVideo === "function" && !isPlaying) {
                player.playVideo();
              }
              window.removeEventListener("click", startTrigger);
              window.removeEventListener("keydown", startTrigger);
              window.removeEventListener("touchstart", startTrigger);
            };
            window.addEventListener("click", startTrigger, { once: true });
            window.addEventListener("keydown", startTrigger, { once: true });
            window.addEventListener("touchstart", startTrigger, { once: true });
          },
          onStateChange: function (event) {
            if (event.data === 1) {
              updatePlayState(true);
            } else if (event.data === 2) {
              updatePlayState(false);
            } else if (event.data === 0) {
              if (isLooping) {
                player.playVideo();
              } else {
                updatePlayState(false);
              }
            }
          }
        }
      });
    }

     
    if (!window.YT) {
      var tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      var firstScript = document.getElementsByTagName("script")[0];
      if (firstScript && firstScript.parentNode) {
        firstScript.parentNode.insertBefore(tag, firstScript);
      } else {
        document.head.appendChild(tag);
      }
      window.onYouTubeIframeAPIReady = function () {
        setupPlayer();
      };
    } else {
      setupPlayer();
    }

     
    btnPlay.addEventListener("click", function () {
      if (!player || typeof player.playVideo !== "function") return;
      if (isPlaying) {
        player.pauseVideo();
      } else {
        player.playVideo();
      }
    });

    btnLoop.addEventListener("click", function () {
      isLooping = !isLooping;
      btnLoop.classList.toggle("active", isLooping);
      if (player && typeof player.setLoop === "function") {
        player.setLoop(isLooping);
      }
    });

    btnMute.addEventListener("click", function () {
      if (!player) return;
      isMuted = !isMuted;
      if (isMuted) {
        player.mute();
        iconVolOn.classList.add("xn-hide");
        iconVolOff.classList.remove("xn-hide");
      } else {
        player.unMute();
        iconVolOn.classList.remove("xn-hide");
        iconVolOff.classList.add("xn-hide");
      }
    });

    volSlider.addEventListener("input", function () {
      var val = Number(volSlider.value);
      currentVol = val;
      volText.textContent = val + "%";
      localStorage.setItem("xn_yt_vol", String(val));
      if (player && typeof player.setVolume === "function") {
        player.setVolume(val);
        if (val === 0 && !isMuted) {
          isMuted = true;
          iconVolOn.classList.add("xn-hide");
          iconVolOff.classList.remove("xn-hide");
        } else if (val > 0 && isMuted) {
          isMuted = false;
          player.unMute();
          iconVolOn.classList.remove("xn-hide");
          iconVolOff.classList.add("xn-hide");
        }
      }
    });

    function seekFromEvent(e) {
      if (!player || typeof player.getDuration !== "function") return 0;
      var clientX = e.clientX;
      if (e.touches && e.touches.length > 0) {
        clientX = e.touches[0].clientX;
      }
      var rect = seekBar.getBoundingClientRect();
      var pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      var dur = player.getDuration() || 0;
      var target = dur * pct;
      seekFill.style.width = (pct * 100) + "%";
      curTimeEl.textContent = formatTime(target);
      return target;
    }

    seekBar.addEventListener("mousedown", function (e) {
      isSeeking = true;
      var target = seekFromEvent(e);
      if (player && typeof player.seekTo === "function") {
        player.seekTo(target, true);
      }
    });

    window.addEventListener("mousemove", function (e) {
      if (!isSeeking) return;
      var target = seekFromEvent(e);
      if (player && typeof player.seekTo === "function") {
        player.seekTo(target, true);
      }
    });

    window.addEventListener("mouseup", function (e) {
      if (!isSeeking) return;
      var target = seekFromEvent(e);
      if (player && typeof player.seekTo === "function") {
        player.seekTo(target, true);
        localStorage.setItem("xn_yt_time", String(target));
      }
      isSeeking = false;
    });

    seekBar.addEventListener("touchstart", function (e) {
      isSeeking = true;
      var target = seekFromEvent(e);
      if (player && typeof player.seekTo === "function") {
        player.seekTo(target, true);
      }
    }, { passive: true });

    window.addEventListener("touchmove", function (e) {
      if (!isSeeking) return;
      var target = seekFromEvent(e);
      if (player && typeof player.seekTo === "function") {
        player.seekTo(target, true);
      }
    }, { passive: true });

    window.addEventListener("touchend", function (e) {
      if (!isSeeking) return;
      var target = parseFloat(localStorage.getItem("xn_yt_time") || "0");
      if (player && typeof player.seekTo === "function") {
        player.seekTo(target, true);
      }
      isSeeking = false;
    });
  })();

   
  (function initCustomCursorAndSparks() {
    if (window.__xn_cursor_inited) return;
    window.__xn_cursor_inited = true;

    var dot = document.getElementById("xn-cursor-dot");
    if (!dot) {
      dot = document.createElement("div");
      dot.id = "xn-cursor-dot";
      dot.innerHTML =
        '<svg viewBox="0 0 16 20" width="15" height="19" class="xn-cur-arrow-svg">' +
          '<defs>' +
            '<linearGradient id="xn-cur-glass" x1="0%" y1="0%" x2="100%" y2="100%">' +
              '<stop offset="0%" stop-color="#ffffff" stop-opacity="0.85"/>' +
              '<stop offset="40%" stop-color="#ffffff" stop-opacity="0.35"/>' +
              '<stop offset="100%" stop-color="#71717a" stop-opacity="0.2"/>' +
            '</linearGradient>' +
          '</defs>' +
          '<path d="M 0,0 L 0,16 L 3.8,12.2 L 6.8,18.5 L 9.2,17.2 L 6.2,11.2 L 12,11.2 Z" fill="rgba(9, 9, 11, 0.65)" stroke="#27272a" stroke-width="1.2" stroke-linejoin="round"></path>' +
          '<path d="M 0,0 L 0,15 L 3.5,11.5 L 6.5,17.5 L 8.5,16.5 L 5.5,10.5 L 11,10.5 Z" fill="url(#xn-cur-glass)" stroke="rgba(255, 255, 255, 0.55)" stroke-width="0.75" stroke-linejoin="round"></path>' +
          '<line x1="2" y1="4.5" x2="4.5" y2="9.5" stroke="rgba(255, 255, 255, 0.65)" stroke-width="0.6" stroke-linecap="round"></line>' +
        '</svg>';
      document.body.appendChild(dot);
    }

    function getContainer() {
      var c = document.getElementById("xn-click-fx-container");
      if (!c) {
        c = document.createElement("div");
        c.id = "xn-click-fx-container";
        document.body.appendChild(c);
      }
      return c;
    }

    var mouseX = -100;
    var mouseY = -100;
    var isVisible = false;

    function renderPos(e) {
      mouseX = e.clientX;
      mouseY = e.clientY;
      dot.style.transform = "translate3d(" + mouseX + "px, " + mouseY + "px, 0)";
      if (!isVisible) {
        isVisible = true;
        dot.classList.add("visible");
      }
    }

    window.addEventListener("pointermove", renderPos, { passive: true, capture: true });
    window.addEventListener("mousemove", renderPos, { passive: true, capture: true });

    document.addEventListener("mouseleave", function () {
      isVisible = false;
      dot.classList.remove("visible");
    });

    document.addEventListener("mouseenter", function () {
      isVisible = true;
      dot.classList.add("visible");
    });

    window.addEventListener("pointerdown", function (e) {
      if (e.button && e.button !== 0) return;
      dot.classList.add("clicking");

      var x = e.clientX;
      var y = e.clientY;
      if (x != null && y != null) {
        var container = getContainer();
        var particleCount = 7;
        for (var i = 0; i < particleCount; i++) {
          var p = document.createElement("div");
          p.className = "xn-click-particle";
          var size = Math.floor(Math.random() * 3) + 2.5;
          p.style.width = size + "px";
          p.style.height = size + "px";
          p.style.left = x + "px";
          p.style.top = y + "px";

          var angle = (i * (360 / particleCount) + Math.random() * 20) * (Math.PI / 180);
          var dist = Math.floor(Math.random() * 26) + 18;
          var dx = Math.cos(angle) * dist;
          var dy = Math.sin(angle) * dist;
          p.style.setProperty("--dx", dx.toFixed(1) + "px");
          p.style.setProperty("--dy", dy.toFixed(1) + "px");

          container.appendChild(p);
          (function (el) {
            setTimeout(function () { el.remove(); }, 450);
          })(p);
        }
      }
    }, { passive: true, capture: true });

    window.addEventListener("pointerup", function () {
      dot.classList.remove("clicking");
    }, { passive: true, capture: true });

    document.addEventListener("mouseover", function (e) {
      var t = e.target;
      if (t && t.closest && t.closest("button, a, input, select, textarea, .xn-card, .inf-plan-card, .sx-head-btn, .inf-back-btn, [role='button']")) {
        dot.classList.add("hovering");
      }
    }, { passive: true });

    document.addEventListener("mouseout", function (e) {
      var t = e.target;
      if (t && t.closest && t.closest("button, a, input, select, textarea, .xn-card, .inf-plan-card, .sx-head-btn, .inf-back-btn, [role='button']")) {
        dot.classList.remove("hovering");
      }
    }, { passive: true });
  })();
})();

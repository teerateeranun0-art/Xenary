use leptos::prelude::*;
use leptos_router::components::A;
use leptos_router::hooks::use_location;

use crate::client_api::{api_post, format_thb_2, scroll_to_top};
use crate::models::{
    AuthResponse, PublicRecentOrder, StoreStatusResponse, StoreSummaryResponse, UserPublic,
};

#[derive(Clone, Copy)]
pub struct AppStateContext {
    pub user: RwSignal<Option<UserPublic>>,
    pub status: RwSignal<Option<StoreStatusResponse>>,
    pub summary: RwSignal<Option<StoreSummaryResponse>>,
    pub refresh_tick: RwSignal<u64>,
}

#[component]
pub fn Navbar() -> impl IntoView {
    let ctx = expect_context::<AppStateContext>();
    let loc = use_location();
    let pathname = move || loc.pathname.get();

    let is_home = move || pathname() == "/";
    let is_products = move || pathname().starts_with("/product");
    let is_account = move || pathname().starts_with("/account");
    let is_status = move || pathname().starts_with("/status");
    let is_contact = move || pathname().starts_with("/contact");

    let on_logout = move |_| {
        let user_sig = ctx.user;
        leptos::task::spawn_local(async move {
            let _ = api_post::<serde_json::Value, AuthResponse>(
                "/api/auth/logout",
                &serde_json::json!({}),
            )
            .await;
            user_sig.set(None);
        });
    };

    let marquee_text = move || {
        ctx.status
            .get()
            .map(|s| s.marquee_text)
            .filter(|t| !t.trim().is_empty())
            .unwrap_or_else(|| {
                "เติมเงินซื้อสินค้าแล้ว ไม่มีนโยบาย คืนเงินทุกกรณี  •  จัดส่งคีย์อัตโนมัติ 24 ชั่วโมง".to_string()
            })
    };

    view! {
        <header class="xn-head">
            <nav class="xn-nav">
                <A href="/" attr:class="xn-brand">
                    <img src="/assets/img/logo.png" alt="XENARY" width="38" height="38"/>
                    <span>"XENARY"</span>
                </A>

                <div class="xn-links">
                    <A href="/" attr:class=move || if is_home() { "on" } else { "" }>
                        <span>"หน้าหลัก"</span>
                    </A>
                    <A href="/products" attr:class=move || if is_products() { "on" } else { "" }>
                        <span>"ร้านค้า"</span>
                    </A>
                    <A href="/account" attr:class=move || if is_account() && !loc.search.get().contains("tab=orders") { "on" } else { "" }>
                        <span>"เติมเงิน"</span>
                    </A>
                    <A href="/account?tab=orders" attr:class=move || if is_account() && loc.search.get().contains("tab=orders") { "on" } else { "" }>
                        <span>"ประวัติสั่งซื้อ"</span>
                    </A>
                    <A href="/status" attr:class=move || if is_status() { "on" } else { "" }>
                        <span>"สถานะ"</span>
                    </A>
                </div>

                <span id="xn-user">
                    <A href="/contact" attr:class=move || if is_contact() { "xn-icon-btn on" } else { "xn-icon-btn" } attr:title="ติดต่อร้านค้า" attr:aria-label="ติดต่อร้านค้า">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                    </A>
                    {move || match ctx.user.get() {
                        Some(u) => {
                            let is_admin = u.role == "admin";
                            let bal = format_thb_2(u.balance);
                            let uname = u.username.clone();
                            view! {
                                <div class="xn-user-strip">
                                    {if is_admin {
                                        view! {
                                            <A href="/admin" attr:class="xn-adm-pill">"หลังบ้าน"</A>
                                        }.into_any()
                                    } else {
                                        ().into_any()
                                    }}
                                    <A href="/account" attr:class="xn-pill">
                                        <span>{uname}</span>
                                        <span>" · "</span>
                                        <span>{bal}</span>
                                    </A>
                                    <button type="button" class="xn-out" on:click=on_logout>"ออก"</button>
                                </div>
                            }.into_any()
                        }
                        None => view! {
                            <A href="/login" attr:class="xn-login-btn">"เข้าสู่ระบบ"</A>
                            <A href="/register" attr:class="cta">"สมัครสมาชิก"</A>
                        }.into_any(),
                    }}
                </span>
            </nav>

            <div class="xn-marquee-wrap" aria-hidden="true">
                <div class="xn-marquee-track">
                    <span class="xn-marquee-item">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                        <span>{marquee_text}</span>
                    </span>
                    <span class="xn-marquee-item">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                        <span>{marquee_text}</span>
                    </span>
                    <span class="xn-marquee-item">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                        <span>{marquee_text}</span>
                    </span>
                    <span class="xn-marquee-item">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                        <span>{marquee_text}</span>
                    </span>
                </div>
            </div>
        </header>
    }
}

#[component]
pub fn Footer() -> impl IntoView {
    view! {
        <footer class="xn-foot">
            <div class="xn-foot-shell">
                <div class="xn-foot-cols">
                    <div class="xn-foot-col">
                        <A href="/" attr:class="xn-foot-brand">
                            <img src="/assets/img/logo.png" alt="XENARY" width="32" height="32"/>
                            <span>"XENARY"</span>
                        </A>
                        <p class="xn-foot-desc">"ร้านบริการจำหน่ายสินค้าดิจิทัลและซอฟต์แวร์คุณภาพ ราคาคุ้มค่า จัดส่งคีย์อัตโนมัติตลอด 24 ชั่วโมง (Rust 100% Full-Stack)"</p>
                        <div class="xn-foot-socials">
                            <a href="https://discord.gg/xenary" target="_blank" rel="noopener noreferrer" class="xn-foot-soc-btn">"Discord"</a>
                            <a href="https://youtube.com/@xenary" target="_blank" rel="noopener noreferrer" class="xn-foot-soc-btn">"YouTube"</a>
                        </div>
                    </div>
                    <div class="xn-foot-col">
                        <h4>"เมนูลัด"</h4>
                        <ul class="xn-foot-menu">
                            <li><A href="/">"หน้าหลัก"</A></li>
                            <li><A href="/products">"หมวดหมู่สินค้า"</A></li>
                            <li><A href="/account">"เติมเงิน"</A></li>
                            <li><A href="/account?tab=orders">"ประวัติการสั่งซื้อ"</A></li>
                        </ul>
                    </div>
                    <div class="xn-foot-col">
                        <h4>"ช่วยเหลือ"</h4>
                        <ul class="xn-foot-menu">
                            <li><A href="/contact">"ติดต่อร้านค้า"</A></li>
                            <li><A href="/status">"สถานะสินค้า & ระบบ"</A></li>
                            <li><A href="/tos">"เงื่อนไขการใช้บริการ"</A></li>
                        </ul>
                    </div>
                </div>
                <div class="xn-foot-bottom">
                    <div class="xn-foot-bottom-left">
                        <span>"© 2026 XENARY All rights reserved."</span>
                        <span>"·"</span>
                        <span>"Powered by Rust (Axum + Leptos + SQLx)"</span>
                    </div>
                    <div class="xn-foot-bottom-right">
                        <A href="/tos">"นโยบาย & เงื่อนไข"</A>
                        <button
                            type="button"
                            class="xn-foot-top-btn"
                            on:click=move |_| scroll_to_top()
                        >
                            <span>"กลับขึ้นข้างบน ▴"</span>
                        </button>
                    </div>
                </div>
            </div>
        </footer>
    }
}

#[component]
pub fn LivePurchaseToast() -> impl IntoView {
    let ctx = expect_context::<AppStateContext>();
    let dismissed = RwSignal::new(false);
    let idx = RwSignal::new(0usize);

    #[cfg(feature = "hydrate")]
    {
        Effect::new(move |_| {
            leptos::task::spawn_local(async move {
                loop {
                    gloo_timers::future::TimeoutFuture::new(6000).await;
                    idx.update(|n| *n = n.wrapping_add(1));
                }
            });
        });
    }

    let current_order = move || -> Option<PublicRecentOrder> {
        let sum = ctx.summary.get()?;
        if sum.recent_orders.is_empty() {
            return None;
        }
        let i = idx.get() % sum.recent_orders.len();
        sum.recent_orders.get(i).cloned()
    };

    view! {
        {move || {
            if dismissed.get() {
                return ().into_any();
            }
            match current_order() {
                Some(ord) => {
                    let href = format!("/product/{}", ord.product_slug);
                    let prod_title = format!("{} ({})", ord.product_name, ord.plan_label);
                    view! {
                        <aside class="xn-live-toast" aria-live="polite">
                            <A href=href attr:style="display:flex;align-items:center;gap:11px;flex:1;min-width:0;text-decoration:none;color:inherit;">
                                <img class="xn-live-toast-img" src=ord.product_img alt=ord.product_name/>
                                <div class="xn-live-toast-body">
                                    <div class="xn-live-toast-top">
                                        <span class="xn-live-toast-dot"></span>
                                        <span>{ord.buyer}" เพิ่งสั่งซื้อ"</span>
                                    </div>
                                    <div class="xn-live-toast-title">{prod_title}</div>
                                    <div class="xn-live-toast-meta">
                                        <span>"เมื่อสักครู่"</span>
                                        <span class="ok">"✓ ยืนยันแล้ว"</span>
                                    </div>
                                </div>
                            </A>
                            <button
                                type="button"
                                class="xn-live-toast-close"
                                aria-label="ปิดการแจ้งเตือน"
                                on:click=move |_| dismissed.set(true)
                            >"×"</button>
                        </aside>
                    }.into_any()
                }
                None => ().into_any(),
            }
        }}
    }
}

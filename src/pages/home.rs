use leptos::prelude::*;
use leptos_router::components::A;

use crate::client_api::{api_get, format_commas, format_thb};
use crate::components::layout::AppStateContext;
use crate::models::{CatalogFile, Product};

#[component]
pub fn HomePage() -> impl IntoView {
    let ctx = expect_context::<AppStateContext>();
    let selected_tag = RwSignal::new(String::new());
    let search_q = RwSignal::new(String::new());

    let catalog = LocalResource::new(move || {
        let _tick = ctx.refresh_tick.get();
        async move { api_get::<CatalogFile>("/api/products").await.ok() }
    });

    let banner_url = move || {
        ctx.status
            .get()
            .map(|s| s.banner_url)
            .filter(|b| !b.is_empty())
            .unwrap_or_else(|| "/assets/img/hero.jpg".to_string())
    };
    let hero_title = move || {
        ctx.status
            .get()
            .map(|s| s.hero_title)
            .filter(|t| !t.is_empty())
            .unwrap_or_else(|| "ยินดีต้อนรับสู่ XENARY Store".to_string())
    };
    let hero_subtitle = move || {
        ctx.status
            .get()
            .map(|s| s.hero_subtitle)
            .filter(|t| !t.is_empty())
            .unwrap_or_else(|| {
                "ร้านจำหน่ายสินค้าดิจิทัลและซอฟต์แวร์คุณภาพ จัดส่งคีย์อัตโนมัติทันทีตลอด 24 ชั่วโมง".to_string()
            })
    };

    let all_products = move || -> Vec<Product> {
        catalog
            .get()
            .and_then(|opt| opt)
            .map(|c| c.products)
            .unwrap_or_default()
    };

    let all_tags = move || -> Vec<String> {
        let mut tags = Vec::new();
        for p in all_products() {
            if !p.tag.is_empty() && !tags.contains(&p.tag) {
                tags.push(p.tag);
            }
        }
        tags
    };

    let filtered_products = move || -> Vec<Product> {
        let tag = selected_tag.get();
        let q = search_q.get().trim().to_lowercase();
        all_products()
            .into_iter()
            .filter(|p| {
                let tag_ok = tag.is_empty() || p.tag.eq_ignore_ascii_case(&tag);
                let q_ok = q.is_empty()
                    || p.name.to_lowercase().contains(&q)
                    || p.tag.to_lowercase().contains(&q)
                    || p.desc.to_lowercase().contains(&q);
                tag_ok && q_ok
            })
            .collect()
    };

    view! {
        <section class="sx-shop-section" id="home">
            <div class="sx-banner">
                <img src=banner_url alt="XENARY Store Banner" id="sx-hero-banner-img"/>
            </div>

            <div class="sx-welcome-card" id="sx-welcome-card">
                <div class="sx-welcome-left">
                    <span class="sx-welcome-kicker">"XENARY STORE · RUST FULL-STACK MARKETPLACE"</span>
                    <h1 class="sx-welcome-title">{hero_title}</h1>
                    <p class="sx-welcome-sub">{hero_subtitle}</p>
                </div>
                <div class="sx-welcome-actions">
                    <a href="#sx-products-anchor" class="sx-btn-cobalt">"เลือกดูสินค้า →"</a>
                    <A href="/account" attr:class="sx-btn-glass">"เติมเงินเข้ากระเป๋า"</A>
                </div>
            </div>

            {move || {
                let sum = ctx.summary.get();
                let u_txt = sum.as_ref().map(|s| format_commas(s.total_users as i64)).unwrap_or_else(|| "-".into());
                let p_txt = sum.as_ref().map(|s| format_commas(s.total_products as i64)).unwrap_or_else(|| "-".into());
                let st_txt = sum.as_ref().map(|s| format_commas(s.total_stock)).unwrap_or_else(|| "-".into());
                let so_txt = sum.as_ref().map(|s| format_commas(s.total_sold)).unwrap_or_else(|| "-".into());
                view! {
                    <div class="sx-kpi-grid" id="sx-kpi-grid">
                        <div class="sx-kpi-card">
                            <span class="sx-kpi-ico">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                            </span>
                            <div><b class="sx-kpi-val" id="kpi-users">{u_txt}</b><span class="sx-kpi-lbl">"สมาชิกทั้งหมด"</span></div>
                        </div>
                        <div class="sx-kpi-card">
                            <span class="sx-kpi-ico">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
                            </span>
                            <div><b class="sx-kpi-val" id="kpi-products">{p_txt}</b><span class="sx-kpi-lbl">"รายการสินค้า"</span></div>
                        </div>
                        <div class="sx-kpi-card">
                            <span class="sx-kpi-ico">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>
                            </span>
                            <div><b class="sx-kpi-val" id="kpi-stock">{st_txt}</b><span class="sx-kpi-lbl">"สินค้าพร้อมส่ง"</span></div>
                        </div>
                        <div class="sx-kpi-card">
                            <span class="sx-kpi-ico">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                            </span>
                            <div><b class="sx-kpi-val" id="kpi-sold">{so_txt}</b><span class="sx-kpi-lbl">"ขายแล้วทั้งหมด"</span></div>
                        </div>
                    </div>
                }
            }}

            <div class="sx-section-head">
                <span class="sx-head-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>
                </span>
                <div class="sx-head-text">
                    <h2 class="sx-head-title">"หมวดหมู่แนะนำ"</h2>
                    <p class="sx-head-sub">"Recommended Categories"</p>
                </div>
                <span class="sx-head-line" aria-hidden="true"></span>
                <a href="#sx-products-anchor" class="sx-head-btn">"ดูทั้งหมด ›"</a>
            </div>

            <div class="sx-cat-grid">
                {move || {
                    let cats = ctx.summary.get().map(|s| s.categories).unwrap_or_default();
                    cats.into_iter().map(|cat| {
                        let name = cat.name.clone();
                        let name_click = cat.name.clone();
                        view! {
                            <button
                                type="button"
                                class="inf-cat-showcase-card"
                                on:click=move |_| selected_tag.set(name_click.clone())
                            >
                                <img class="inf-cat-showcase-bg" src=cat.img alt=name.clone()/>
                                <div class="inf-cat-showcase-content">
                                    <h3 class="inf-cat-showcase-title">{name}</h3>
                                    <p class="inf-cat-showcase-sub">{format!("{} รายการสินค้า", cat.count)}</p>
                                </div>
                            </button>
                        }
                    }).collect_view()
                }}
            </div>

            <div class="sx-section-head">
                <span class="sx-head-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                </span>
                <div class="sx-head-text">
                    <h2 class="sx-head-title">"รายการสั่งซื้อล่าสุด"</h2>
                    <p class="sx-head-sub">"Latest order list"</p>
                </div>
                <span class="sx-head-line" aria-hidden="true"></span>
            </div>

            <div class="sx-orders">
                {move || {
                    let orders = ctx.summary.get().map(|s| s.recent_orders).unwrap_or_default();
                    orders.into_iter().take(6).map(|ord| {
                        let href = format!("/product/{}", ord.product_slug);
                        let p_name = ord.product_name.clone();
                        view! {
                            <A href=href attr:class="sx-order-card" attr:style="text-decoration:none;">
                                <div class="sx-order-thumb">
                                    <img src=ord.product_img alt=p_name.clone()/>
                                </div>
                                <div class="sx-order-info">
                                    <strong>{p_name}</strong>
                                    <span>{format_thb(ord.total)}</span>
                                    <small>{format!("{} · {}", ord.buyer, ord.plan_label)}</small>
                                </div>
                            </A>
                        }
                    }).collect_view()
                }}
            </div>

            <div class="xn-s1" id="sx-products-anchor"></div>
            <div class="sx-section-head">
                <div class="sx-head-text">
                    <h2 class="sx-head-title">"สินค้าทั้งหมด"</h2>
                </div>
            </div>

            <div class="sx-filter-bar">
                <div class="sx-filter-tabs">
                    <button
                        type="button"
                        class=move || if selected_tag.get().is_empty() { "sx-tab-btn active" } else { "sx-tab-btn" }
                        on:click=move |_| selected_tag.set(String::new())
                    >"สินค้าทั้งหมด"</button>
                    {move || {
                        all_tags().into_iter().map(|tg| {
                            let tg_cmp = tg.clone();
                            let tg_click = tg.clone();
                            view! {
                                <button
                                    type="button"
                                    class=move || if selected_tag.get() == tg_cmp { "sx-tab-btn active" } else { "sx-tab-btn" }
                                    on:click=move |_| selected_tag.set(tg_click.clone())
                                >{tg}</button>
                            }
                        }).collect_view()
                    }}
                </div>
                <div>
                    <input
                        type="text"
                        id="sx-search-input"
                        class="sx-search-input"
                        placeholder="ค้นหาสินค้า..."
                        prop:value=search_q
                        on:input=move |ev| search_q.set(event_target_value(&ev))
                    />
                </div>
            </div>

            <div class="product-grid" id="sx-product-grid">
                {move || {
                    filtered_products().into_iter().map(|p| {
                        let href = format!("/product/{}", p.slug);
                        let p_name = p.name.clone();
                        let p_name_alt = p_name.clone();
                        let p_img = p.img.clone();
                        let p_tag = p.tag.clone();
                        let is_upd = p.updating || p.status_mode == "updating";
                        let min_p = p.from;
                        let max_p = p.plans.iter().map(|pl| pl.price).fold(min_p, f64::max);
                        let price_str = if (max_p - min_p).abs() > 0.01 {
                            format!("{} - {}", format_thb(min_p), format_thb(max_p))
                        } else {
                            format_thb(min_p)
                        };
                        let stock_txt = if p.stock > 0 {
                            format!("คงเหลือ {} ชิ้น", p.stock)
                        } else {
                            "สินค้าหมด".to_string()
                        };
                        let sold_txt = format!("ขายแล้ว {}", p.sold);
                        view! {
                            <article class={if is_upd { "product-card is-updating" } else { "product-card" }}>
                                <A href=href.clone() attr:class="product-img">
                                    <img src=p_img alt=p_name_alt/>
                                    {if is_upd {
                                        view! { <span class="inf-updating-tag">"กำลังอัปเดต"</span> }.into_any()
                                    } else {
                                        ().into_any()
                                    }}
                                </A>
                                <div class="product-content">
                                    <div class="inf-card-main-row">
                                        <h3 class="product-title">{p_name}</h3>
                                        <A href=href attr:class="inf-btn-detail">
                                            <span>"รายละเอียด"</span>
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                                        </A>
                                    </div>
                                    <div class="product-price-val">{price_str}</div>
                                    <div class="inf-card-stat-row">
                                        <span class="inf-stat-item">{stock_txt}</span>
                                        <span>"·"</span>
                                        <span class="inf-stat-item">{sold_txt}</span>
                                        <span>"·"</span>
                                        <span class="inf-stat-item">{p_tag}</span>
                                    </div>
                                </div>
                            </article>
                        }
                    }).collect_view()
                }}
            </div>
        </section>
    }
}

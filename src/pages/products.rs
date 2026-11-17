use leptos::prelude::*;
use leptos_router::components::A;
use leptos_router::hooks::{use_navigate, use_params_map, use_query_map};

use crate::client_api::{api_get, api_post, copy_text, format_thb};
use crate::components::layout::AppStateContext;
use crate::models::{
    BuyOrderPayload, BuyOrderResponse, CatalogFile, CouponValidatePayload, CouponValidateResponse,
    Product,
};

#[component]
pub fn ProductsPage() -> impl IntoView {
    let query = use_query_map();
    let item_slug = move || query.with(|q| q.get("item").unwrap_or_default());

    view! {
        {move || {
            let slug = item_slug();
            if slug.is_empty() {
                view! { <CatalogGridView/> }.into_any()
            } else {
                view! { <ProductDetailView slug=slug/> }.into_any()
            }
        }}
    }
}

#[component]
pub fn ProductSlugPage() -> impl IntoView {
    let params = use_params_map();
    let slug = move || params.with(|p| p.get("slug").unwrap_or_default());

    view! {
        {move || {
            let s = slug();
            view! { <ProductDetailView slug=s/> }
        }}
    }
}

#[component]
fn CatalogGridView() -> impl IntoView {
    let ctx = expect_context::<AppStateContext>();
    let selected_tag = RwSignal::new(String::new());
    let search_q = RwSignal::new(String::new());

    let catalog = LocalResource::new(move || {
        let _tick = ctx.refresh_tick.get();
        async move { api_get::<CatalogFile>("/api/products").await.ok() }
    });

    let all_products = move || -> Vec<Product> {
        catalog
            .get()
            .and_then(|o| o)
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

    let filtered = move || -> Vec<Product> {
        let tag = selected_tag.get();
        let q = search_q.get().trim().to_lowercase();
        all_products()
            .into_iter()
            .filter(|p| {
                let tag_ok = tag.is_empty() || p.tag.eq_ignore_ascii_case(&tag);
                let q_ok = q.is_empty()
                    || p.name.to_lowercase().contains(&q)
                    || p.tag.to_lowercase().contains(&q);
                tag_ok && q_ok
            })
            .collect()
    };

    view! {
        <section class="sx-shop-section" id="categories">
            <div class="sx-section-head">
                <div class="sx-head-text">
                    <h1 class="sx-head-title">"ร้านค้า — สินค้าทั้งหมด"</h1>
                    <p class="sx-head-sub">"เลือกแพ็กเกจและชำระเงินอัตโนมัติ รับคีย์ทันที"</p>
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
                        class="sx-search-input"
                        placeholder="ค้นหาสินค้า..."
                        prop:value=search_q
                        on:input=move |ev| search_q.set(event_target_value(&ev))
                    />
                </div>
            </div>

            <div class="product-grid" id="sx-product-grid">
                {move || {
                    filtered().into_iter().map(|p| {
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

#[component]
fn ProductDetailView(slug: String) -> impl IntoView {
    let ctx = expect_context::<AppStateContext>();
    let navigate = use_navigate();
    let slug_sig = RwSignal::new(slug);

    let catalog = LocalResource::new(move || {
        let _tick = ctx.refresh_tick.get();
        async move { api_get::<CatalogFile>("/api/products").await.ok() }
    });

    let selected_plan_idx = RwSignal::new(0usize);
    let qty = RwSignal::new(1u32);
    let desc_expanded = RwSignal::new(false);
    let coupon_input = RwSignal::new(String::new());
    let applied_coupon = RwSignal::new(Option::<(String, f64)>::None);
    let coupon_msg = RwSignal::new(Option::<(bool, String)>::None);
    let buy_error = RwSignal::new(Option::<String>::None);
    let busy = RwSignal::new(false);
    let delivered_modal = RwSignal::new(Option::<BuyOrderResponse>::None);

    let product = move || -> Option<Product> {
        let s = slug_sig.get();
        catalog
            .get()
            .and_then(|o| o)
            .and_then(|c| c.products.into_iter().find(|p| p.slug == s))
    };

    let related_products = move || -> Vec<Product> {
        let s = slug_sig.get();
        catalog
            .get()
            .and_then(|o| o)
            .map(|c| {
                c.products
                    .into_iter()
                    .filter(|p| p.slug != s)
                    .take(4)
                    .collect()
            })
            .unwrap_or_default()
    };

    let current_plan = move || {
        product().and_then(|p| p.plans.get(selected_plan_idx.get()).cloned())
    };

    let subtotal = move || -> f64 {
        current_plan()
            .map(|pl| pl.price * (qty.get() as f64))
            .unwrap_or(0.0)
    };

    let final_total = move || -> f64 {
        let sub = subtotal();
        let disc = applied_coupon.get().map(|(_, d)| d).unwrap_or(0.0);
        (sub - disc).max(0.0)
    };

    let on_check_coupon = Callback::new(move |_: leptos::ev::MouseEvent| {
        let code = coupon_input.get().trim().to_string();
        if code.is_empty() {
            coupon_msg.set(Some((false, "กรุณากรอกโค้ดส่วนลด".to_string())));
            return;
        }
        let sub = subtotal();
        leptos::task::spawn_local(async move {
            match api_post::<CouponValidatePayload, CouponValidateResponse>(
                "/api/coupons/check",
                &CouponValidatePayload {
                    code,
                    subtotal: sub,
                },
            )
            .await
            {
                Ok(res) => {
                    applied_coupon.set(Some((res.code.clone(), res.discount)));
                    coupon_msg.set(Some((true, res.message)));
                }
                Err(e) => {
                    applied_coupon.set(None);
                    coupon_msg.set(Some((false, e)));
                }
            }
        });
    });

    let on_buy = Callback::new(move |_: leptos::ev::MouseEvent| {
        buy_error.set(None);
        if ctx.user.get().is_none() {
            navigate("/login", Default::default());
            return;
        }
        let Some(p) = product() else {
            return;
        };
        let Some(pl) = current_plan() else {
            return;
        };
        let q = qty.get();
        let cp = applied_coupon
            .get()
            .map(|(c, _)| c)
            .unwrap_or_default();

        busy.set(true);
        let user_sig = ctx.user;
        let tick_sig = ctx.refresh_tick;
        leptos::task::spawn_local(async move {
            let payload = BuyOrderPayload {
                slug: p.slug.clone(),
                plan_label: pl.label.clone(),
                quantity: q,
                coupon_code: cp,
                contact: String::new(),
            };
            match api_post::<BuyOrderPayload, BuyOrderResponse>("/api/orders", &payload).await {
                Ok(res) => {
                    user_sig.update(|u_opt| {
                        if let Some(u) = u_opt {
                            u.balance = res.new_balance;
                        }
                    });
                    tick_sig.update(|n| *n += 1);
                    delivered_modal.set(Some(res));
                }
                Err(e) => {
                    buy_error.set(Some(e));
                }
            }
            busy.set(false);
        });
    });

    view! {
        <section class="sx-shop-section is-detail-mode">
            <div id="inf-product-detail-root" class="inf-detail-view">
                {move || match product() {
                    None => view! {
                        <div class="xn-card" style="padding:36px;text-align:center;">
                            <h2>"กำลังโหลดข้อมูลสินค้า..."</h2>
                            <p class="lead">"หรือเลือกสินค้าจากหน้ารวมสินค้า"</p>
                            <A href="/products" attr:class="xn-btn">"กลับไปหน้าร้านค้า"</A>
                        </div>
                    }.into_any(),
                    Some(p) => {
                        let plan_count = p.plans.len();
                        let sel_pl = p.plans.get(selected_plan_idx.get()).cloned();
                        let unit_price = sel_pl.as_ref().map(|x| x.price).unwrap_or(p.from);
                        let sel_stock = sel_pl
                            .as_ref()
                            .and_then(|x| x.stock)
                            .unwrap_or(p.stock);
                        let is_updating = p.updating || p.status_mode == "updating";
                        let can_buy = !is_updating && sel_stock >= (qty.get() as i64) && !busy.get();
                        let p_name_crumb = p.name.clone();
                        let p_name_img = p.name.clone();
                        let p_name_title = p.name.clone();
                        let p_tag_crumb = p.tag.clone();
                        let p_tag_info = p.tag.clone();

                        view! {
                            <div class="inf-breadcrumb">
                                <A href="/">"หน้าแรก"</A>
                                <span>"/"</span>
                                <A href="/products">"หมวดหมู่สินค้า"</A>
                                <span>"/"</span>
                                <span>{p_tag_crumb}</span>
                                <span>"/"</span>
                                <span class="cur">{p_name_crumb}</span>
                            </div>

                            <div class="inf-detail-grid">
                                <div class="inf-detail-left">
                                    <div class="inf-detail-img-box">
                                        <img src=p.img.clone() alt=p_name_img/>
                                    </div>

                                    <div class="inf-left-info-card">
                                        <div class="inf-left-info-head">
                                            <span class="inf-left-info-ico">"ⓘ"</span>
                                            <div>
                                                <strong>"ข้อมูลสินค้า"</strong>
                                                <span>"สถานะและรายละเอียดการจำหน่าย"</span>
                                            </div>
                                        </div>
                                        <div class="inf-info-rows">
                                            <div class="inf-info-row">
                                                <span class="inf-info-k">"หมวดหมู่"</span>
                                                <A href="/products" attr:class="inf-info-v" attr:style="text-decoration:none;">{format!("{} ↗", p_tag_info)}</A>
                                            </div>
                                            <div class="inf-info-row">
                                                <span class="inf-info-k">"สถานะ"</span>
                                                {if is_updating {
                                                    view! { <span class="inf-status-pill-inline updating">"กำลังอัปเดต"</span> }.into_any()
                                                } else if sel_stock > 0 {
                                                    view! { <span class="inf-status-pill-inline">"พร้อมขาย"</span> }.into_any()
                                                } else {
                                                    view! { <span class="inf-status-pill-inline out">"สินค้าหมด"</span> }.into_any()
                                                }}
                                            </div>
                                            <div class="inf-info-row">
                                                <span class="inf-info-k">"คงเหลือ"</span>
                                                <span class="inf-info-v">{format!("{} ชิ้น", sel_stock)}</span>
                                            </div>
                                            <div class="inf-info-row">
                                                <span class="inf-info-k">"ขายไปแล้ว"</span>
                                                <span class="inf-info-v blue">{format!("{} ชิ้น", p.sold)}</span>
                                            </div>
                                            <div class="inf-info-row">
                                                <span class="inf-info-k">"ประเภทสินค้า"</span>
                                                <span class="inf-info-v">{if plan_count > 1 { "มีตัวเลือกย่อย" } else { "คีย์อัตโนมัติ" }}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div class="inf-detail-right">
                                    <h1 class="inf-detail-title">{p_name_title}</h1>

                                    {if is_updating && !p.update_note.is_empty() {
                                        view! { <div class="inf-updating-banner">{p.update_note.clone()}</div> }.into_any()
                                    } else {
                                        ().into_any()
                                    }}

                                    <div class="inf-desc-section">
                                        <div class="inf-desc-head">
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
                                            <span>"รายละเอียดสินค้า"</span>
                                        </div>
                                        <div class=move || if desc_expanded.get() { "inf-desc-body" } else { "inf-desc-body is-clamped" }>
                                            {p.desc.clone()}
                                        </div>
                                        <div class="inf-desc-toggle-wrap">
                                            <button
                                                type="button"
                                                class="inf-desc-toggle-btn"
                                                on:click=move |_| desc_expanded.update(|v| *v = !*v)
                                            >
                                                {move || if desc_expanded.get() { "ย่อรายละเอียด ^" } else { "แสดงเพิ่มเติม ⌄" }}
                                            </button>
                                        </div>
                                    </div>

                                    <div class="inf-sec-label">
                                        <span class="inf-sec-label-l">
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>
                                            <span>"เลือกตัวเลือก"</span>
                                        </span>
                                        <span class="inf-sec-label-r">{format!("{} ตัวเลือก", plan_count)}</span>
                                    </div>

                                    <div class="inf-plans-grid">
                                        {p.plans.iter().enumerate().map(|(i, pl)| {
                                            let lbl = pl.label.clone();
                                            let p_price = format_thb(pl.price);
                                            let p_stock = pl.stock.unwrap_or(p.stock);
                                            let out_cls = if p_stock <= 0 { " out-of-stock" } else { "" };
                                            view! {
                                                <button
                                                    type="button"
                                                    class=move || if selected_plan_idx.get() == i {
                                                        format!("inf-plan-card selected{out_cls}")
                                                    } else {
                                                        format!("inf-plan-card{out_cls}")
                                                    }
                                                    on:click=move |_| {
                                                        selected_plan_idx.set(i);
                                                        applied_coupon.set(None);
                                                        coupon_msg.set(None);
                                                    }
                                                >
                                                    <div class="inf-plan-top">
                                                        <span class="inf-plan-name">{lbl}</span>
                                                        <span class="inf-plan-check">"✓"</span>
                                                    </div>
                                                    <div class="inf-plan-bottom">
                                                        <span class="inf-plan-price">{p_price}</span>
                                                        <span class="inf-plan-stock">{format!("เหลือ {} ชิ้น", p_stock)}</span>
                                                    </div>
                                                </button>
                                            }
                                        }).collect_view()}
                                    </div>

                                    <div class="inf-inline-qty-row">
                                        <span>"จำนวน"</span>
                                        <div class="inf-inline-qty">
                                            <button
                                                type="button"
                                                id="inf-qty-minus"
                                                aria-label="ลดจำนวน"
                                                disabled={move || qty.get() <= 1}
                                                on:click=move |_| qty.update(|q| if *q > 1 { *q -= 1; })
                                            >"-"</button>
                                            <b>{move || qty.get().to_string()}</b>
                                            <button
                                                type="button"
                                                id="inf-qty-plus"
                                                aria-label="เพิ่มจำนวน"
                                                disabled={move || qty.get() >= 50}
                                                on:click=move |_| qty.update(|q| if *q < 50 { *q += 1; })
                                            >"+"</button>
                                        </div>
                                    </div>

                                    <div class="inf-coupon-box">
                                        <div class="inf-coupon-row">
                                            <input
                                                type="text"
                                                class="inf-coupon-input"
                                                placeholder="โค้ดส่วนลด (ถ้ามี)"
                                                prop:value=coupon_input
                                                on:input=move |ev| coupon_input.set(event_target_value(&ev))
                                            />
                                            <button type="button" class="inf-coupon-btn" on:click=move |ev| on_check_coupon.run(ev)>"ตรวจสอบ"</button>
                                        </div>
                                        {move || coupon_msg.get().map(|(ok, msg)| view! {
                                            <p class={if ok { "inf-coupon-msg ok" } else { "inf-coupon-msg err" }}>{msg}</p>
                                        })}
                                    </div>

                                    <div class="inf-total-box">
                                        <div class="inf-total-left">
                                            <strong>"ราคารวมทั้งสิ้น"</strong>
                                            <span>{move || format!("{} ชิ้น × {}", qty.get(), format_thb(unit_price))}</span>
                                        </div>
                                        <div class="inf-total-right">
                                            <div class="inf-total-price">{move || format_thb(final_total())}</div>
                                        </div>
                                    </div>

                                    {move || buy_error.get().map(|err| view! {
                                        <p class="xn-msg" role="alert">{err}</p>
                                    })}

                                    <div class="inf-cta-row">
                                        <button
                                            type="button"
                                            class="inf-cta-buy"
                                            disabled={move || !can_buy}
                                            on:click=move |ev| on_buy.run(ev)
                                        >
                                            {move || if busy.get() {
                                                "กำลังดำเนินการ..."
                                            } else if is_updating {
                                                "สินค้าอยู่ระหว่างอัปเดต"
                                            } else if sel_stock < (qty.get() as i64) {
                                                "สต็อกไม่เพียงพอ"
                                            } else {
                                                "🛒 ซื้อสินค้า"
                                            }}
                                        </button>
                                        <A href="/account" attr:class="inf-btn-dark inf-cta-wallet">"เติมเงิน"</A>
                                    </div>
                                </div>
                            </div>

                            {move || {
                                let rel = related_products();
                                if rel.is_empty() {
                                    ().into_any()
                                } else {
                                    view! {
                                        <div class="inf-related-head">
                                            <div>
                                                <h2>"สินค้าอื่นๆ ในร้าน"</h2>
                                                <p>"เลือกชมสินค้าดิจิทัลเพิ่มเติมจาก XENARY Store"</p>
                                            </div>
                                            <A href="/products" attr:class="sx-head-btn">"ดูทั้งหมด ›"</A>
                                        </div>
                                        <div class="product-grid">
                                            {rel.into_iter().map(|rp| {
                                                let rhref = format!("/product/{}", rp.slug);
                                                let rname = rp.name.clone();
                                                let rname_alt = rname.clone();
                                                let rimg = rp.img.clone();
                                                let rtag = rp.tag.clone();
                                                let min_rp = rp.from;
                                                view! {
                                                    <article class="product-card">
                                                        <A href=rhref.clone() attr:class="product-img">
                                                            <img src=rimg alt=rname_alt/>
                                                        </A>
                                                        <div class="product-content">
                                                            <div class="inf-card-main-row">
                                                                <h3 class="product-title">{rname}</h3>
                                                                <A href=rhref attr:class="inf-btn-detail">"ดูเพิ่มเติม"</A>
                                                            </div>
                                                            <div class="product-price-val">{format_thb(min_rp)}</div>
                                                            <div class="inf-card-stat-row">
                                                                <span class="inf-stat-item">{format!("คงเหลือ {}", rp.stock)}</span>
                                                                <span>"·"</span>
                                                                <span class="inf-stat-item">{rtag}</span>
                                                            </div>
                                                        </div>
                                                    </article>
                                                }
                                            }).collect_view()}
                                        </div>
                                    }.into_any()
                                }
                            }}
                        }.into_any()
                    }
                }}
            </div>

            {move || delivered_modal.get().map(|res| view! {
                <div class="sx-modal-backdrop">
                    <div class="sx-modal">
                        <h3 class="sx-m-title">"สั่งซื้อสำเร็จ! ส่งมอบคีย์เรียบร้อย"</h3>
                        <p class="sx-m-sub">{format!("รหัสคำสั่งซื้อ: {}", res.order.id)}</p>
                        <div class="sx-m-box">
                            {res.keys.into_iter().map(|k| {
                                let k_cp = k.clone();
                                view! {
                                    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 0;">
                                        <code style="word-break:break-all;color:#34d399;">{k}</code>
                                        <button type="button" class="adm-btn sm" on:click=move |_| copy_text(&k_cp)>"คัดลอก"</button>
                                    </div>
                                }
                            }).collect_view()}
                        </div>
                        {res.order.download_url.clone().map(|dl| view! {
                            <div style="margin-bottom:14px;">
                                <a href=dl target="_blank" rel="noopener noreferrer" class="xn-btn" style="display:inline-block;text-decoration:none;width:100%;text-align:center;box-sizing:border-box;">
                                    "ดาวน์โหลดไฟล์โปรแกรม ↗"
                                </a>
                            </div>
                        })}
                        <div class="inf-pay-modal-actions">
                            <A href="/account?tab=orders" attr:class="inf-btn-cancel" attr:style="text-decoration:none;text-align:center;">
                                "ดูประวัติสั่งซื้อ"
                            </A>
                            <button type="button" class="inf-btn-submit" on:click=move |_| delivered_modal.set(None)>"ปิด"</button>
                        </div>
                    </div>
                </div>
            })}
        </section>
    }
}

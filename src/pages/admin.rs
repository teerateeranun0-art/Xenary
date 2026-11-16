use leptos::prelude::*;
use leptos_router::components::A;
use leptos_router::hooks::use_location;
use serde::Deserialize;

use crate::client_api::{
    api_admin_req, api_get_admin, format_thb_2, session_get, session_set,
};
use crate::components::layout::AppStateContext;
use crate::models::*;

#[derive(Debug, Clone, Deserialize)]
struct KeysResp {
    keys: Vec<ProductKey>,
}
#[derive(Debug, Clone, Deserialize)]
struct OrdersResp {
    orders: Vec<OrderRecord>,
}
#[derive(Debug, Clone, Deserialize)]
struct TopupsResp {
    topups: Vec<TopupRecord>,
}
#[derive(Debug, Clone, Deserialize)]
struct UsersResp {
    users: Vec<UserPublic>,
}
#[derive(Debug, Clone, Deserialize)]
struct CouponsResp {
    coupons: Vec<CouponRecord>,
}
#[derive(Debug, Clone, Deserialize)]
struct ChannelsResp {
    channels: Vec<PaymentChannel>,
}
#[derive(Debug, Clone, Deserialize)]
struct NewsResp {
    news: Vec<NewsItem>,
}
#[derive(Debug, Clone, Deserialize)]
struct SettingsResp {
    settings: StoreSettings,
}
#[derive(Debug, Clone, Deserialize)]
struct OkResp {
    #[allow(dead_code)]
    ok: bool,
}

#[component]
pub fn AdminPage() -> impl IntoView {
    let ctx = expect_context::<AppStateContext>();
    let loc = use_location();

    let initial_tab = if loc.pathname.get_untracked().ends_with("/redeem") {
        "redeem".to_string()
    } else if loc.pathname.get_untracked().ends_with("/staff") {
        "staff".to_string()
    } else {
        "dashboard".to_string()
    };

    let active_tab = RwSignal::new(initial_tab);
    let admin_key = RwSignal::new(session_get("xn_admin"));
    let unlocked = RwSignal::new(false);
    let key_input = RwSignal::new(String::new());
    let login_err = RwSignal::new(String::new());
    let nav_search = RwSignal::new(String::new());
    let reload_tick = RwSignal::new(0u64);
    let action_msg = RwSignal::new(Option::<(bool, String)>::None);

    Effect::new(move |_| {
        let p = loc.pathname.get();
        if p.ends_with("/redeem") {
            active_tab.set("redeem".to_string());
        } else if p.ends_with("/staff") {
            active_tab.set("staff".to_string());
        } else if p == "/admin" || p == "/admin/" {
            active_tab.set("dashboard".to_string());
        }
    });

    // Unlock automatically if user is admin OR cached session key validates
    Effect::new(move |_| {
        if let Some(u) = ctx.user.get()
            && u.role == "admin"
        {
            unlocked.set(true);
            return;
        }
        let k = admin_key.get();
        if !k.is_empty() && !unlocked.get_untracked() {
            leptos::task::spawn_local(async move {
                if api_get_admin::<AdminStatsResponse>("/api/admin/stats", &k)
                    .await
                    .is_ok()
                {
                    unlocked.set(true);
                } else {
                    session_set("xn_admin", "");
                    admin_key.set(String::new());
                }
            });
        }
    });

    // Data resources when unlocked
    let stats_res = LocalResource::new(move || {
        let on = unlocked.get();
        let k = admin_key.get();
        let _r = reload_tick.get();
        async move {
            if !on {
                return None;
            }
            api_get_admin::<AdminStatsResponse>("/api/admin/stats", &k)
                .await
                .ok()
        }
    });

    let products_res = LocalResource::new(move || {
        let on = unlocked.get();
        let k = admin_key.get();
        let _r = reload_tick.get();
        async move {
            if !on {
                return vec![];
            }
            api_get_admin::<CatalogFile>("/api/admin/products", &k)
                .await
                .map(|c| c.products)
                .unwrap_or_default()
        }
    });

    let keys_res = LocalResource::new(move || {
        let on = unlocked.get();
        let k = admin_key.get();
        let _r = reload_tick.get();
        async move {
            if !on {
                return vec![];
            }
            api_get_admin::<KeysResp>("/api/admin/keys", &k)
                .await
                .map(|r| r.keys)
                .unwrap_or_default()
        }
    });

    let orders_res = LocalResource::new(move || {
        let on = unlocked.get();
        let k = admin_key.get();
        let _r = reload_tick.get();
        async move {
            if !on {
                return vec![];
            }
            api_get_admin::<OrdersResp>("/api/admin/orders", &k)
                .await
                .map(|r| r.orders)
                .unwrap_or_default()
        }
    });

    let topups_res = LocalResource::new(move || {
        let on = unlocked.get();
        let k = admin_key.get();
        let _r = reload_tick.get();
        async move {
            if !on {
                return vec![];
            }
            api_get_admin::<TopupsResp>("/api/admin/topups", &k)
                .await
                .map(|r| r.topups)
                .unwrap_or_default()
        }
    });

    let users_res = LocalResource::new(move || {
        let on = unlocked.get();
        let k = admin_key.get();
        let _r = reload_tick.get();
        async move {
            if !on {
                return vec![];
            }
            api_get_admin::<UsersResp>("/api/admin/users", &k)
                .await
                .map(|r| r.users)
                .unwrap_or_default()
        }
    });

    let coupons_res = LocalResource::new(move || {
        let on = unlocked.get();
        let k = admin_key.get();
        let _r = reload_tick.get();
        async move {
            if !on {
                return vec![];
            }
            api_get_admin::<CouponsResp>("/api/admin/coupons", &k)
                .await
                .map(|r| r.coupons)
                .unwrap_or_default()
        }
    });

    let channels_res = LocalResource::new(move || {
        let on = unlocked.get();
        let k = admin_key.get();
        let _r = reload_tick.get();
        async move {
            if !on {
                return vec![];
            }
            api_get_admin::<ChannelsResp>("/api/admin/channels", &k)
                .await
                .map(|r| r.channels)
                .unwrap_or_default()
        }
    });

    let news_res = LocalResource::new(move || {
        let on = unlocked.get();
        let k = admin_key.get();
        let _r = reload_tick.get();
        async move {
            if !on {
                return vec![];
            }
            api_get_admin::<NewsResp>("/api/admin/news", &k)
                .await
                .map(|r| r.news)
                .unwrap_or_default()
        }
    });

    let settings_res = LocalResource::new(move || {
        let on = unlocked.get();
        let k = admin_key.get();
        let _r = reload_tick.get();
        async move {
            if !on {
                return None;
            }
            api_get_admin::<SettingsResp>("/api/admin/settings", &k)
                .await
                .ok()
                .map(|r| r.settings)
        }
    });

    // Forms state
    let p_slug = RwSignal::new(String::new());
    let p_name = RwSignal::new(String::new());
    let p_tag = RwSignal::new("Valorant".to_string());
    let p_img = RwSignal::new("/assets/img/hero.jpg".to_string());
    let p_desc = RwSignal::new(String::new());
    let p_plan_lbl = RwSignal::new("1 วัน".to_string());
    let p_plan_price = RwSignal::new("59".to_string());

    let k_prod = RwSignal::new("aim-color".to_string());
    let k_plan = RwSignal::new("1 วัน".to_string());
    let k_text = RwSignal::new(String::new());

    let cp_code = RwSignal::new(String::new());
    let cp_type = RwSignal::new("credit".to_string());
    let cp_mode = RwSignal::new("fixed".to_string());
    let cp_value = RwSignal::new("20".to_string());
    let cp_max = RwSignal::new("100".to_string());
    let cp_note = RwSignal::new(String::new());

    let user_search = RwSignal::new(String::new());
    let bal_input = RwSignal::new("100".to_string());

    let ch_name = RwSignal::new(String::new());
    let ch_bank = RwSignal::new(String::new());
    let ch_no = RwSignal::new(String::new());
    let ch_owner = RwSignal::new(String::new());

    let nw_title = RwSignal::new(String::new());
    let nw_content = RwSignal::new(String::new());

    let set_site_name = RwSignal::new("XENARY".to_string());
    let set_hero_title = RwSignal::new(String::new());
    let set_hero_sub = RwSignal::new(String::new());
    let set_marquee = RwSignal::new(String::new());
    let set_pp_id = RwSignal::new(String::new());
    let set_banner = RwSignal::new(String::new());
    let set_maint = RwSignal::new(false);

    Effect::new(move |_| {
        if let Some(s) = settings_res.get().and_then(|o| o) {
            set_site_name.set(s.site_name);
            set_hero_title.set(s.hero_title);
            set_hero_sub.set(s.hero_subtitle);
            set_marquee.set(s.marquee_text);
            set_pp_id.set(s.promptpay_id);
            set_banner.set(s.banner_url);
            set_maint.set(s.maintenance);
        }
    });

    let on_unlock = move |ev: leptos::ev::SubmitEvent| {
        ev.prevent_default();
        login_err.set(String::new());
        let k = key_input.get().trim().to_string();
        if k.is_empty() {
            return;
        }
        leptos::task::spawn_local(async move {
            match api_get_admin::<AdminStatsResponse>("/api/admin/stats", &k).await {
                Ok(_) => {
                    session_set("xn_admin", &k);
                    admin_key.set(k);
                    unlocked.set(true);
                    reload_tick.update(|v| *v += 1);
                }
                Err(e) => login_err.set(e),
            }
        });
    };

    let switch_tab = move |tab: &'static str| {
        action_msg.set(None);
        if tab == "redeem" {
            cp_type.set("credit".to_string());
        } else if tab == "coupons" {
            cp_type.set("discount".to_string());
        }
        active_tab.set(tab.to_string());
    };

    let nav_items: &[(&'static str, &'static str, &'static str)] = &[
        ("dashboard", "Overview", "ภาพรวม & สถิติ"),
        ("products", "Store", "จัดการสินค้า"),
        ("keys", "Store", "สต็อกคีย์สินค้า"),
        ("orders", "Store", "คำสั่งซื้อ"),
        ("coupons", "Store", "คูปอง & ส่วนลด"),
        ("topups", "Topup", "รายการเติมเงิน"),
        ("channels", "Topup", "ช่องทางชำระเงิน"),
        ("redeem", "Topup", "จัดการโค้ดเติมเงิน"),
        ("news", "Design & Settings", "ประกาศข่าวสาร"),
        ("settings", "Design & Settings", "ตั้งค่าเว็บไซต์"),
        ("staff", "System", "จัดการสิทธิ์แอดมิน"),
        ("users", "System", "สมาชิก & ยอดเงิน"),
    ];

    let crumb_group = move || {
        let cur = active_tab.get();
        nav_items
            .iter()
            .find(|(id, _, _)| *id == cur)
            .map(|(_, g, _)| *g)
            .unwrap_or("Admin")
    };
    let crumb_label = move || {
        let cur = active_tab.get();
        nav_items
            .iter()
            .find(|(id, _, _)| *id == cur)
            .map(|(_, _, l)| *l)
            .unwrap_or("Dashboard")
    };

    view! {
        <div class="adm-container">
            {move || if !unlocked.get() {
                view! {
                    <div id="adm-login-card" class="xn-pg xn-narrow">
                        <h1>"เข้าสู่ระบบผู้ดูแล"</h1>
                        <p class="lead">"กรอกรหัส Admin Key หรือเข้าสู่ระบบด้วยบัญชีแอดมินเพื่อเข้าถึงระบบหลังบ้าน"</p>
                        <div class="xn-card">
                            <form id="f-adm-login" class="xn-form" on:submit=on_unlock>
                                <label>
                                    <span>"รหัสผ่านแอดมิน (ADMIN_KEY)"</span>
                                    <input
                                        id="adm-key-input"
                                        type="password"
                                        autocomplete="off"
                                        placeholder="••••••••••••"
                                        required
                                        prop:value=key_input
                                        on:input=move |ev| key_input.set(event_target_value(&ev))
                                    />
                                </label>
                                {move || {
                                    let err = login_err.get();
                                    if err.is_empty() { ().into_any() } else { view! { <p class="xn-msg" role="alert">{err}</p> }.into_any() }
                                }}
                                <button class="xn-btn" type="submit">"ปลดล็อคระบบ"</button>
                            </form>
                        </div>
                    </div>
                }.into_any()
            } else {
                view! {
                    <div id="adm-main-panel" class="adm-shell">
                        <aside class="adm-sidebar" id="adm-sidebar">
                            <div class="adm-side-head">
                                <div class="adm-side-brand">
                                    <img src="/assets/img/logo.png" alt="XENARY"/>
                                    <div>
                                        <strong>"XENARY"</strong>
                                        <span>"Dashboard"</span>
                                    </div>
                                </div>
                            </div>

                            <div class="adm-side-search-wrap">
                                <input
                                    type="text"
                                    class="adm-side-search"
                                    placeholder="Search anything"
                                    prop:value=nav_search
                                    on:input=move |ev| nav_search.set(event_target_value(&ev))
                                />
                            </div>

                            {["Overview", "Store", "Topup", "Design & Settings", "System"].into_iter().map(|grp| {
                                view! {
                                    <div class="adm-side-group">
                                        <div class="adm-side-group-title">{grp}</div>
                                        {nav_items.iter().filter(|(_, g, _)| *g == grp).map(|(id, _, lbl)| {
                                            let id_str = *id;
                                            let lbl_str = *lbl;
                                            let visible = move || {
                                                let q = nav_search.get().trim().to_lowercase();
                                                q.is_empty() || lbl_str.to_lowercase().contains(&q) || id_str.contains(&q)
                                            };
                                            view! {
                                                {move || if visible() {
                                                    view! {
                                                        <button
                                                            type="button"
                                                            class=move || if active_tab.get() == id_str { "adm-nav-btn active" } else { "adm-nav-btn" }
                                                            data-tab=id_str
                                                            on:click=move |_| switch_tab(id_str)
                                                        >
                                                            <span>{lbl_str}</span>
                                                        </button>
                                                    }.into_any()
                                                } else {
                                                    ().into_any()
                                                }}
                                            }
                                        }).collect_view()}
                                    </div>
                                }
                            }).collect_view()}

                            <div class="adm-side-user">
                                <div class="adm-side-avatar">"A"</div>
                                <div class="adm-side-user-meta">
                                    <strong>{move || ctx.user.get().map(|u| u.username).unwrap_or_else(|| "Admin".to_string())}</strong>
                                    <span>"แอดมิน (Rust Engine)"</span>
                                </div>
                            </div>
                        </aside>

                        <div class="adm-main-area">
                            <div class="adm-topbar">
                                <div class="adm-topbar-left">
                                    <div class="adm-topbar-crumb">
                                        <span>{move || format!("{} / ", crumb_group())}</span>
                                        <b>{crumb_label}</b>
                                    </div>
                                </div>
                                <div class="adm-topbar-actions">
                                    <A href="/" attr:class="adm-btn sm" attr:style="text-decoration:none;">"ไปที่หน้าร้าน ↗"</A>
                                </div>
                            </div>

                            {move || action_msg.get().map(|(ok, m)| view! {
                                <p class={if ok { "xn-msg ok" } else { "xn-msg" }} style="margin-bottom:12px;">{m}</p>
                            })}

                            {move || match active_tab.get().as_str() {
                                "dashboard" => {
                                    let st = stats_res.get().and_then(|o| o);
                                    match st {
                                        None => view! { <div class="adm-loading">"กำลังโหลดข้อมูล..."</div> }.into_any(),
                                        Some(s) => view! {
                                            <div class="adm-stats-grid">
                                                <div class="adm-stat-card"><span class="label">"รายได้วันนี้"</span><span class="val green">{format_thb_2(s.rev_today)}</span></div>
                                                <div class="adm-stat-card"><span class="label">"รายได้เดือนนี้"</span><span class="val green">{format_thb_2(s.rev_month)}</span></div>
                                                <div class="adm-stat-card"><span class="label">"รายได้รวมทั้งหมด"</span><span class="val green">{format_thb_2(s.rev_total)}</span></div>
                                                <div class="adm-stat-card"><span class="label">"ออเดอร์ที่ชำระแล้ว"</span><span class="val">{format!("{} รายการ", s.orders_paid)}</span></div>
                                                <div class="adm-stat-card"><span class="label">"สมาชิกทั้งหมด"</span><span class="val">{format!("{} บัญชี", s.total_users)}</span></div>
                                                <div class="adm-stat-card"><span class="label">"เติมเงินรอตรวจสอบ"</span><span class="val yellow">{format!("{} รายการ", s.topups_pending)}</span></div>
                                                <div class="adm-stat-card"><span class="label">"คีย์พร้อมขาย"</span><span class="val blue">{format!("{} คีย์", s.keys_remain)}</span></div>
                                                <div class="adm-stat-card"><span class="label">"ฐานข้อมูล"</span><span class="val">{s.db_driver}</span></div>
                                            </div>
                                            <div class="xn-card xn-s7" style="margin-top:16px;">
                                                <h3>"สรุปสต็อกแยกตามสินค้า"</h3>
                                                <div class="adm-table-list">
                                                    {s.product_stock.into_iter().map(|row| view! {
                                                        <div class="adm-row-item">
                                                            <strong>{row.name}</strong>
                                                            <span>{format!("คงเหลือ {} · ขายแล้ว {}", row.unused_keys, row.sold)}</span>
                                                        </div>
                                                    }).collect_view()}
                                                </div>
                                            </div>
                                        }.into_any(),
                                    }
                                },
                                "products" => {
                                    let on_add_prod = move |ev: leptos::ev::SubmitEvent| {
                                        ev.prevent_default();
                                        let k = admin_key.get();
                                        let payload = AdminCreateProductPayload {
                                            slug: p_slug.get(),
                                            name: p_name.get(),
                                            tag: p_tag.get(),
                                            desc: p_desc.get(),
                                            img: p_img.get(),
                                            download_url: String::new(),
                                            tutorial_video: String::new(),
                                            key_based: true,
                                            best_seller: true,
                                            featured: true,
                                            updating: false,
                                            update_note: String::new(),
                                            plans: vec![ProductPlan {
                                                label: p_plan_lbl.get(),
                                                price: p_plan_price.get().parse().unwrap_or(59.0),
                                                per: String::new(),
                                                stock: None,
                                                plan_keys: None,
                                            }],
                                        };
                                        leptos::task::spawn_local(async move {
                                            match api_admin_req::<_, serde_json::Value>("POST", "/api/admin/products", Some(&payload), &k).await {
                                                Ok(_) => {
                                                    action_msg.set(Some((true, "บันทึกสินค้าสำเร็จ".into())));
                                                    reload_tick.update(|v| *v += 1);
                                                }
                                                Err(e) => action_msg.set(Some((false, e))),
                                            }
                                        });
                                    };
                                    view! {
                                        <div class="xn-card" style="margin-bottom:16px;">
                                            <h2>"เพิ่ม / แก้ไขสินค้า"</h2>
                                            <form class="xn-form" on:submit=on_add_prod>
                                                <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                                                    <label><span>"Slug"</span><input required placeholder="aim-pro" prop:value=p_slug on:input=move |ev| p_slug.set(event_target_value(&ev))/></label>
                                                    <label><span>"ชื่อสินค้า"</span><input required placeholder="Aim Pro" prop:value=p_name on:input=move |ev| p_name.set(event_target_value(&ev))/></label>
                                                    <label><span>"หมวดหมู่"</span><input required prop:value=p_tag on:input=move |ev| p_tag.set(event_target_value(&ev))/></label>
                                                    <label><span>"URL รูปภาพ"</span><input prop:value=p_img on:input=move |ev| p_img.set(event_target_value(&ev))/></label>
                                                    <label><span>"แพ็กเกจ"</span><input required prop:value=p_plan_lbl on:input=move |ev| p_plan_lbl.set(event_target_value(&ev))/></label>
                                                    <label><span>"ราคา (บาท)"</span><input type="number" required prop:value=p_plan_price on:input=move |ev| p_plan_price.set(event_target_value(&ev))/></label>
                                                </div>
                                                <label><span>"รายละเอียด"</span><textarea rows="3" prop:value=p_desc on:input=move |ev| p_desc.set(event_target_value(&ev))></textarea></label>
                                                <button type="submit" class="xn-btn">"บันทึกสินค้า"</button>
                                            </form>
                                        </div>
                                        <div class="xn-card">
                                            <h3>"สินค้าในระบบ"</h3>
                                            <div class="adm-table-list">
                                                {move || products_res.get().unwrap_or_default().into_iter().map(|p| {
                                                    let slug_del = p.slug.clone();
                                                    view! {
                                                        <div class="adm-row-item">
                                                            <div>
                                                                <strong>{p.name}</strong>
                                                                <span style="margin-left:8px;color:#9ca3af;">{format!("({}) · คงเหลือ {} · ขายแล้ว {}", p.tag, p.stock, p.sold)}</span>
                                                            </div>
                                                            <button type="button" class="adm-btn sm danger" on:click=move |_| {
                                                                let k = admin_key.get();
                                                                let s = slug_del.clone();
                                                                leptos::task::spawn_local(async move {
                                                                    let _ = api_admin_req::<(), OkResp>("DELETE", &format!("/api/admin/products/{s}"), None, &k).await;
                                                                    reload_tick.update(|v| *v += 1);
                                                                });
                                                            }>"ลบ"</button>
                                                        </div>
                                                    }
                                                }).collect_view()}
                                            </div>
                                        </div>
                                    }.into_any()
                                },
                                "keys" => {
                                    let on_add_keys = move |ev: leptos::ev::SubmitEvent| {
                                        ev.prevent_default();
                                        let k = admin_key.get();
                                        let payload = AdminAddKeysPayload {
                                            product_id: k_prod.get(),
                                            plan_label: k_plan.get(),
                                            keys_text: k_text.get(),
                                        };
                                        leptos::task::spawn_local(async move {
                                            match api_admin_req::<_, serde_json::Value>("POST", "/api/admin/keys", Some(&payload), &k).await {
                                                Ok(_) => {
                                                    k_text.set(String::new());
                                                    action_msg.set(Some((true, "เพิ่มคีย์สินค้าเรียบร้อย".into())));
                                                    reload_tick.update(|v| *v += 1);
                                                }
                                                Err(e) => action_msg.set(Some((false, e))),
                                            }
                                        });
                                    };
                                    view! {
                                        <div class="xn-card" style="margin-bottom:16px;">
                                            <h2>"เพิ่มสต็อกคีย์ (บรรทัดละ 1 คีย์)"</h2>
                                            <form class="xn-form" on:submit=on_add_keys>
                                                <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                                                    <label><span>"รหัสสินค้า (Slug)"</span><input required prop:value=k_prod on:input=move |ev| k_prod.set(event_target_value(&ev))/></label>
                                                    <label><span>"แพ็กเกจ (เช่น 1 วัน, 7 วัน)"</span><input prop:value=k_plan on:input=move |ev| k_plan.set(event_target_value(&ev))/></label>
                                                </div>
                                                <label><span>"รายการคีย์"</span><textarea rows="4" required placeholder="KEY-001\nKEY-002" prop:value=k_text on:input=move |ev| k_text.set(event_target_value(&ev))></textarea></label>
                                                <button type="submit" class="xn-btn">"เพิ่มคีย์เข้าคลัง"</button>
                                            </form>
                                        </div>
                                        <div class="xn-card">
                                            <h3>"คลังคีย์ทั้งหมด"</h3>
                                            <div class="adm-table-list">
                                                {move || keys_res.get().unwrap_or_default().into_iter().take(60).map(|ky| {
                                                    let kid = ky.id.clone();
                                                    view! {
                                                        <div class="adm-row-item">
                                                            <div>
                                                                <code>{ky.key_value}</code>
                                                                <span style="margin-left:8px;color:#9ca3af;">{format!("{} ({})", ky.product_id, ky.plan_label.unwrap_or_else(|| "ทุกแพ็กเกจ".into()))}</span>
                                                            </div>
                                                            <div style="display:flex;gap:8px;align-items:center;">
                                                                <span class={if ky.is_used { "inf-status-pill out" } else { "inf-status-pill ok" }}>
                                                                    {if ky.is_used { "ใช้แล้ว" } else { "พร้อมขาย" }}
                                                                </span>
                                                                {if !ky.is_used {
                                                                    view! {
                                                                        <button type="button" class="adm-btn sm danger" on:click=move |_| {
                                                                            let k = admin_key.get();
                                                                            let id_d = kid.clone();
                                                                            leptos::task::spawn_local(async move {
                                                                                let _ = api_admin_req::<(), OkResp>("DELETE", &format!("/api/admin/keys/{id_d}"), None, &k).await;
                                                                                reload_tick.update(|v| *v += 1);
                                                                            });
                                                                        }>"ลบ"</button>
                                                                    }.into_any()
                                                                } else {
                                                                    ().into_any()
                                                                }}
                                                            </div>
                                                        </div>
                                                    }
                                                }).collect_view()}
                                            </div>
                                        </div>
                                    }.into_any()
                                },
                                "orders" => view! {
                                    <div class="xn-card">
                                        <h2>"คำสั่งซื้อทั้งหมด"</h2>
                                        <div class="inf-orders-table-wrap">
                                            <table class="inf-orders-table">
                                                <thead><tr><th>"ID"</th><th>"ผู้ซื้อ"</th><th>"สินค้า"</th><th>"แพ็กเกจ"</th><th>"ยอดรวม"</th><th>"สถานะ"</th></tr></thead>
                                                <tbody>
                                                    {move || orders_res.get().unwrap_or_default().into_iter().map(|o| view! {
                                                        <tr>
                                                            <td><code>{o.id}</code></td>
                                                            <td>{o.contact.unwrap_or(o.user_id)}</td>
                                                            <td>{o.product.name}</td>
                                                            <td>{o.plan.label}</td>
                                                            <td>{format_thb_2(o.total)}</td>
                                                            <td><span class="inf-status-pill ok">{o.status}</span></td>
                                                        </tr>
                                                    }).collect_view()}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                }.into_any(),
                                "coupons" | "redeem" => {
                                    let is_redeem = active_tab.get() == "redeem";
                                    let on_create_cp = move |ev: leptos::ev::SubmitEvent| {
                                        ev.prevent_default();
                                        let k = admin_key.get();
                                        let payload = AdminCreateCouponPayload {
                                            code: cp_code.get(),
                                            coupon_type: cp_type.get(),
                                            discount_mode: cp_mode.get(),
                                            value: cp_value.get().parse().unwrap_or(20.0),
                                            min_spend: 0.0,
                                            max_uses: cp_max.get().parse::<i64>().ok(),
                                            per_user_limit: 1,
                                            expires_at: None,
                                            note: cp_note.get(),
                                        };
                                        leptos::task::spawn_local(async move {
                                            match api_admin_req::<_, serde_json::Value>("POST", "/api/admin/coupons", Some(&payload), &k).await {
                                                Ok(_) => {
                                                    cp_code.set(String::new());
                                                    action_msg.set(Some((true, "สร้างคูปองสำเร็จ".into())));
                                                    reload_tick.update(|v| *v += 1);
                                                }
                                                Err(e) => action_msg.set(Some((false, e))),
                                            }
                                        });
                                    };
                                    view! {
                                        <div class="adm-header">
                                            <div>
                                                <h1>{if is_redeem { "จัดการโค้ดเติมเงิน" } else { "จัดการโค้ดส่วนลด" }}</h1>
                                                <p class="adm-sub">{if is_redeem { "สร้างและจัดการรหัสคูปองเติมเงินเข้ากระเป๋าผู้ใช้" } else { "สร้างและจัดการรหัสส่วนลดหน้าสินค้า" }}</p>
                                            </div>
                                        </div>
                                        {move || {
                                            let all = coupons_res.get().unwrap_or_default();
                                            let filtered: Vec<CouponRecord> = all.into_iter().filter(|c| !is_redeem || c.coupon_type == "credit").collect();
                                            let total_cnt = filtered.len();
                                            let active_cnt = filtered.iter().filter(|c| c.enabled && c.max_uses.map(|m| c.used_count < m).unwrap_or(true)).count();
                                            let total_val: f64 = filtered.iter().map(|c| c.value).sum();
                                            let used_total: i64 = filtered.iter().map(|c| c.used_count).sum();
                                            view! {
                                                <div class="adm-stats-grid">
                                                    <div class="adm-stat-card"><span class="label">"โค้ดทั้งหมด"</span><span class="val">{format!("{total_cnt} รายการ")}</span></div>
                                                    <div class="adm-stat-card"><span class="label">"ใช้งานได้"</span><span class="val green">{format!("{active_cnt} โค้ด")}</span></div>
                                                    <div class="adm-stat-card"><span class="label">"มูลค่ารวม"</span><span class="val blue">{format_thb_2(total_val)}</span></div>
                                                    <div class="adm-stat-card"><span class="label">"ถูกใช้แล้ว"</span><span class="val yellow">{format!("{used_total} ครั้ง")}</span></div>
                                                </div>
                                            }
                                        }}
                                        <div class="xn-card" style="margin-bottom:16px;">
                                            <h2>{if is_redeem { "สร้างโค้ดเติมเงินเข้ากระเป๋า (Redeem Code)" } else { "สร้างโค้ดส่วนลดหน้าสินค้า" }}</h2>
                                            <form class="xn-form" on:submit=on_create_cp>
                                                <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                                                    <label>
                                                        <span>"ประเภทคูปอง"</span>
                                                        <select prop:value=cp_type on:change=move |ev| cp_type.set(event_target_value(&ev))>
                                                            <option value="credit">"โค้ดเติมเงินเข้ากระเป๋า (Credit Code)"</option>
                                                            <option value="discount">"โค้ดส่วนลดหน้าสินค้า (Discount)"</option>
                                                        </select>
                                                    </label>
                                                    <label><span>"รหัสโค้ด"</span><input required placeholder="FREE50" prop:value=cp_code on:input=move |ev| cp_code.set(event_target_value(&ev))/></label>
                                                    <label><span>"มูลค่า (บาท หรือ %)"</span><input type="number" step="0.01" required prop:value=cp_value on:input=move |ev| cp_value.set(event_target_value(&ev))/></label>
                                                    <label><span>"จำกัดสิทธิ์ทั้งหมด"</span><input type="number" prop:value=cp_max on:input=move |ev| cp_max.set(event_target_value(&ev))/></label>
                                                </div>
                                                <label><span>"หมายเหตุ"</span><input prop:value=cp_note on:input=move |ev| cp_note.set(event_target_value(&ev))/></label>
                                                <button type="submit" class="xn-btn">"สร้างคูปอง"</button>
                                            </form>
                                        </div>
                                        <div class="xn-card">
                                            <h3>{if is_redeem { "โค้ดเติมเงินทั้งหมดในระบบ" } else { "คูปองทั้งหมดในระบบ" }}</h3>
                                            <div class="adm-table-list">
                                                {move || {
                                                    let items: Vec<CouponRecord> = coupons_res.get().unwrap_or_default().into_iter().filter(|c| !is_redeem || c.coupon_type == "credit").collect();
                                                    if items.is_empty() {
                                                        return view! { <div class="adm-empty">{if is_redeem { "ยังไม่มีโค้ดเติมเงินในระบบ" } else { "ยังไม่มีคูปองในระบบ" }}</div> }.into_any();
                                                    }
                                                    items.into_iter().map(|c| {
                                                        let cid = c.id.clone();
                                                        view! {
                                                            <div class="adm-row-item">
                                                                <div>
                                                                    <code>{c.code}</code>
                                                                    <span style="margin-left:8px;color:#9ca3af;">{format!("{} · มูลค่า ฿{:.2} · ใช้แล้ว {}", c.coupon_type, c.value, c.used_count)}</span>
                                                                </div>
                                                                <button type="button" class="adm-btn sm danger" on:click=move |_| {
                                                                    let k = admin_key.get();
                                                                    let id_d = cid.clone();
                                                                    leptos::task::spawn_local(async move {
                                                                        let _ = api_admin_req::<(), OkResp>("DELETE", &format!("/api/admin/coupons/{id_d}"), None, &k).await;
                                                                        reload_tick.update(|v| *v += 1);
                                                                    });
                                                                }>"ลบ"</button>
                                                            </div>
                                                        }
                                                    }).collect_view().into_any()
                                                }}
                                            </div>
                                        </div>
                                    }.into_any()
                                },
                                "topups" => view! {
                                    <div class="xn-card">
                                        <h2>"รายการเติมเงินทั้งหมด"</h2>
                                        <div class="adm-table-list">
                                            {move || topups_res.get().unwrap_or_default().into_iter().map(|t| {
                                                let tid1 = t.id.clone();
                                                let tid2 = t.id.clone();
                                                let is_pending = t.status == "pending";
                                                let amt = if t.amount > 0.0 { t.amount } else { 50.0 };
                                                view! {
                                                    <div class="adm-row-item">
                                                        <div>
                                                            <strong>{format!("{} · {}", t.username, t.channel_name)}</strong>
                                                            <div style="font-size:12px;color:#9ca3af;">{format!("{} · ฿{:.2} · {}", t.id, t.amount, t.status)}</div>
                                                        </div>
                                                        {if is_pending {
                                                            view! {
                                                                <div style="display:flex;gap:6px;">
                                                                    <button type="button" class="adm-btn sm" on:click=move |_| {
                                                                        let k = admin_key.get();
                                                                        let id_a = tid1.clone();
                                                                        leptos::task::spawn_local(async move {
                                                                            let _ = api_admin_req::<_, OkResp>("POST", &format!("/api/admin/topups/{id_a}/approve"), Some(&serde_json::json!({ "amount": amt })), &k).await;
                                                                            reload_tick.update(|v| *v += 1);
                                                                        });
                                                                    }>"อนุมัติ"</button>
                                                                    <button type="button" class="adm-btn sm danger" on:click=move |_| {
                                                                        let k = admin_key.get();
                                                                        let id_r = tid2.clone();
                                                                        leptos::task::spawn_local(async move {
                                                                            let _ = api_admin_req::<(), OkResp>("POST", &format!("/api/admin/topups/{id_r}/reject"), None, &k).await;
                                                                            reload_tick.update(|v| *v += 1);
                                                                        });
                                                                    }>"ปฏิเสธ"</button>
                                                                </div>
                                                            }.into_any()
                                                        } else {
                                                            view! { <span class="inf-status-pill ok">{t.status}</span> }.into_any()
                                                        }}
                                                    </div>
                                                }
                                            }).collect_view()}
                                        </div>
                                    </div>
                                }.into_any(),
                                "channels" => {
                                    let on_add_ch = move |ev: leptos::ev::SubmitEvent| {
                                        ev.prevent_default();
                                        let k = admin_key.get();
                                        let payload = AdminCreateChannelPayload {
                                            name: ch_name.get(),
                                            channel_type: "bank".into(),
                                            bank_name: ch_bank.get(),
                                            account_no: ch_no.get(),
                                            account_name: ch_owner.get(),
                                            qr_img: String::new(),
                                        };
                                        leptos::task::spawn_local(async move {
                                            let _ = api_admin_req::<_, serde_json::Value>("POST", "/api/admin/channels", Some(&payload), &k).await;
                                            ch_name.set(String::new());
                                            reload_tick.update(|v| *v += 1);
                                        });
                                    };
                                    view! {
                                        <div class="xn-card" style="margin-bottom:16px;">
                                            <h2>"เพิ่มช่องทางรับชำระเงิน"</h2>
                                            <form class="xn-form" on:submit=on_add_ch>
                                                <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                                                    <label><span>"ชื่อช่องทาง"</span><input required prop:value=ch_name on:input=move |ev| ch_name.set(event_target_value(&ev))/></label>
                                                    <label><span>"ธนาคาร"</span><input required prop:value=ch_bank on:input=move |ev| ch_bank.set(event_target_value(&ev))/></label>
                                                    <label><span>"เลขบัญชี"</span><input required prop:value=ch_no on:input=move |ev| ch_no.set(event_target_value(&ev))/></label>
                                                    <label><span>"ชื่อบัญชี"</span><input required prop:value=ch_owner on:input=move |ev| ch_owner.set(event_target_value(&ev))/></label>
                                                </div>
                                                <button type="submit" class="xn-btn">"เพิ่มบัญชีธนาคาร"</button>
                                            </form>
                                        </div>
                                        <div class="xn-card">
                                            <div class="adm-table-list">
                                                {move || channels_res.get().unwrap_or_default().into_iter().map(|c| {
                                                    let cid = c.id.clone();
                                                    view! {
                                                        <div class="adm-row-item">
                                                            <div><strong>{c.name}</strong> " · " {c.account_no} " (" {c.account_name} ")"</div>
                                                            <button type="button" class="adm-btn sm danger" on:click=move |_| {
                                                                let k = admin_key.get();
                                                                let id_d = cid.clone();
                                                                leptos::task::spawn_local(async move {
                                                                    let _ = api_admin_req::<(), OkResp>("DELETE", &format!("/api/admin/channels/{id_d}"), None, &k).await;
                                                                    reload_tick.update(|v| *v += 1);
                                                                });
                                                            }>"ลบ"</button>
                                                        </div>
                                                    }
                                                }).collect_view()}
                                            </div>
                                        </div>
                                    }.into_any()
                                },
                                "news" => {
                                    let on_add_nw = move |ev: leptos::ev::SubmitEvent| {
                                        ev.prevent_default();
                                        let k = admin_key.get();
                                        let payload = AdminCreateNewsPayload {
                                            title: nw_title.get(),
                                            content: nw_content.get(),
                                            image_url: String::new(),
                                        };
                                        leptos::task::spawn_local(async move {
                                            let _ = api_admin_req::<_, serde_json::Value>("POST", "/api/admin/news", Some(&payload), &k).await;
                                            nw_title.set(String::new());
                                            nw_content.set(String::new());
                                            reload_tick.update(|v| *v += 1);
                                        });
                                    };
                                    view! {
                                        <div class="xn-card" style="margin-bottom:16px;">
                                            <h2>"เพิ่มประกาศข่าวสาร"</h2>
                                            <form class="xn-form" on:submit=on_add_nw>
                                                <label><span>"หัวข้อข่าว"</span><input required prop:value=nw_title on:input=move |ev| nw_title.set(event_target_value(&ev))/></label>
                                                <label><span>"เนื้อหา"</span><textarea rows="3" prop:value=nw_content on:input=move |ev| nw_content.set(event_target_value(&ev))></textarea></label>
                                                <button type="submit" class="xn-btn">"โพสต์ประกาศ"</button>
                                            </form>
                                        </div>
                                        <div class="xn-card">
                                            <div class="adm-table-list">
                                                {move || news_res.get().unwrap_or_default().into_iter().map(|n| {
                                                    let nid = n.id.clone();
                                                    view! {
                                                        <div class="adm-row-item">
                                                            <div><strong>{n.title}</strong><div style="font-size:12px;color:#9ca3af;">{n.content}</div></div>
                                                            <button type="button" class="adm-btn sm danger" on:click=move |_| {
                                                                let k = admin_key.get();
                                                                let id_d = nid.clone();
                                                                leptos::task::spawn_local(async move {
                                                                    let _ = api_admin_req::<(), OkResp>("DELETE", &format!("/api/admin/news/{id_d}"), None, &k).await;
                                                                    reload_tick.update(|v| *v += 1);
                                                                });
                                                            }>"ลบ"</button>
                                                        </div>
                                                    }
                                                }).collect_view()}
                                            </div>
                                        </div>
                                    }.into_any()
                                },
                                "settings" => {
                                    let on_save_set = move |ev: leptos::ev::SubmitEvent| {
                                        ev.prevent_default();
                                        let k = admin_key.get();
                                        let mut s = settings_res.get().and_then(|o| o).unwrap_or_default();
                                        s.site_name = set_site_name.get();
                                        s.hero_title = set_hero_title.get();
                                        s.hero_subtitle = set_hero_sub.get();
                                        s.marquee_text = set_marquee.get();
                                        s.promptpay_id = set_pp_id.get();
                                        s.banner_url = set_banner.get();
                                        s.maintenance = set_maint.get();
                                        let tick_pub = ctx.refresh_tick;
                                        leptos::task::spawn_local(async move {
                                            match api_admin_req::<_, serde_json::Value>("PATCH", "/api/admin/settings", Some(&s), &k).await {
                                                Ok(_) => {
                                                    action_msg.set(Some((true, "บันทึกการตั้งค่าระบบเรียบร้อย".into())));
                                                    reload_tick.update(|v| *v += 1);
                                                    tick_pub.update(|v| *v += 1);
                                                }
                                                Err(e) => action_msg.set(Some((false, e))),
                                            }
                                        });
                                    };
                                    view! {
                                        <div class="xn-card">
                                            <h2>"ตั้งค่าเว็บไซต์หลัก"</h2>
                                            <form class="xn-form" on:submit=on_save_set>
                                                <label><span>"ชื่อเว็บไซต์"</span><input prop:value=set_site_name on:input=move |ev| set_site_name.set(event_target_value(&ev))/></label>
                                                <label><span>"หัวข้อ Hero"</span><input prop:value=set_hero_title on:input=move |ev| set_hero_title.set(event_target_value(&ev))/></label>
                                                <label><span>"คำบรรยาย Hero"</span><input prop:value=set_hero_sub on:input=move |ev| set_hero_sub.set(event_target_value(&ev))/></label>
                                                <label><span>"ข้อความตัววิ่ง (Marquee)"</span><input prop:value=set_marquee on:input=move |ev| set_marquee.set(event_target_value(&ev))/></label>
                                                <label><span>"PromptPay ID"</span><input prop:value=set_pp_id on:input=move |ev| set_pp_id.set(event_target_value(&ev))/></label>
                                                <label><span>"Banner URL"</span><input prop:value=set_banner on:input=move |ev| set_banner.set(event_target_value(&ev))/></label>
                                                <label class="xn-chk">
                                                    <input type="checkbox" prop:checked=set_maint on:change=move |ev| set_maint.set(event_target_checked(&ev))/>
                                                    <span>"ปิดปรับปรุงเว็บไซต์ (Maintenance Mode)"</span>
                                                </label>
                                                <button type="submit" class="xn-btn">"บันทึกการตั้งค่า"</button>
                                            </form>
                                        </div>
                                    }.into_any()
                                },
                                "staff" | "users" => {
                                    let staff_only = active_tab.get() == "staff";
                                    view! {
                                        <div class="adm-header">
                                            <div>
                                                <h1>{if staff_only { "จัดการสิทธิ์แอดมิน & ทีมงาน" } else { "บัญชีสมาชิก & จัดการยอดเงิน" }}</h1>
                                                <p class="adm-sub">{if staff_only { "แต่งตั้งแอดมิน กำหนดบทบาท และจัดการสิทธิ์การเข้าถึงเมนูต่างๆ ของร้านค้า" } else { "ปรับยอดเงิน ตั้งสิทธิ์แอดมิน และแบนผู้ใช้" }}</p>
                                            </div>
                                        </div>

                                        <div class="xn-card">
                                            <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:16px;">
                                                <h2 style="margin:0;border-left:3px solid #3b82f6;padding-left:10px;">
                                                    {if staff_only { "รายชื่อทีมงานและแอดมินทั้งหมด" } else { "รายชื่อสมาชิกทั้งหมด" }}
                                                </h2>
                                                <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                                                    <input
                                                        type="text"
                                                        class="sx-search-input"
                                                        placeholder="ค้นหาชื่อ, Username, บทบาท..."
                                                        prop:value=user_search
                                                        on:input=move |ev| user_search.set(event_target_value(&ev))
                                                    />
                                                    <input
                                                        type="number"
                                                        class="sx-search-input"
                                                        style="width:108px;"
                                                        placeholder="จำนวน ฿"
                                                        prop:value=bal_input
                                                        on:input=move |ev| bal_input.set(event_target_value(&ev))
                                                    />
                                                    <button
                                                        type="button"
                                                        class="adm-btn primary sm"
                                                        on:click=move |_| active_tab.set("users".to_string())
                                                    >"+ แต่งตั้งแอดมินใหม่"</button>
                                                </div>
                                            </div>

                                            <div class="inf-orders-table-wrap">
                                                <table class="inf-orders-table adm-staff-table">
                                                    <thead>
                                                        <tr>
                                                            <th>"ผู้ใช้งาน"</th>
                                                            <th>"บทบาท / ตำแหน่ง"</th>
                                                            <th>"สิทธิ์ที่ได้รับ"</th>
                                                            <th>"ยอดเงิน / วันที่"</th>
                                                            <th style="text-align:right;">"จัดการ"</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {move || {
                                                            let q = user_search.get().trim().to_lowercase();
                                                            let list: Vec<UserPublic> = users_res.get().unwrap_or_default().into_iter().filter(|u| {
                                                                let matches_q = q.is_empty() || u.username.to_lowercase().contains(&q) || u.id.to_lowercase().contains(&q);
                                                                if staff_only && q.is_empty() { u.role == "admin" } else { matches_q }
                                                            }).collect();
                                                            if list.is_empty() {
                                                                return view! {
                                                                    <tr><td colspan="5" class="adm-empty">"ไม่พบรายชื่อผู้ใช้ที่ตรงกับเงื่อนไข"</td></tr>
                                                                }.into_any();
                                                            }
                                                            list.into_iter().map(|u| {
                                                                let uid_bal = u.id.clone();
                                                                let uid_role = u.id.clone();
                                                                let uid_ban = u.id.clone();
                                                                let is_adm = u.role == "admin";
                                                                let is_banned = u.banned;
                                                                let uname = u.username.clone();
                                                                let initial = uname.chars().next().unwrap_or('U').to_uppercase().to_string();
                                                                view! {
                                                                    <tr>
                                                                        <td>
                                                                            <div style="display:flex;align-items:center;gap:10px;">
                                                                                <div class="adm-side-avatar">{initial}</div>
                                                                                <div>
                                                                                    <strong>{uname.clone()}</strong>
                                                                                    <div style="font-size:11.5px;color:#71717a;">{format!("@{uname} · {}", u.id)}</div>
                                                                                </div>
                                                                            </div>
                                                                        </td>
                                                                        <td>
                                                                            <span class={if is_adm { "inf-status-pill-inline" } else { "inf-status-pill" }}>
                                                                                {if is_adm { "แอดมิน (Admin)" } else { "สมาชิก (User)" }}
                                                                            </span>
                                                                        </td>
                                                                        <td>
                                                                            <span style="font-size:12px;color:#93c5fd;">
                                                                                {if is_adm { "เต็มสิทธิ์ (41/41)" } else { "สมาชิกทั่วไป" }}
                                                                            </span>
                                                                        </td>
                                                                        <td>
                                                                            <div style="font-weight:600;color:#fff;">{format_thb_2(u.balance)}</div>
                                                                            <div style="font-size:11px;color:#71717a;">{u.created_at}</div>
                                                                        </td>
                                                                        <td style="text-align:right;">
                                                                            <div style="display:inline-flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;">
                                                                                <button type="button" class="adm-btn sm" on:click=move |_| {
                                                                                    let k = admin_key.get();
                                                                                    let id_u = uid_bal.clone();
                                                                                    let amt: f64 = bal_input.get().parse().unwrap_or(100.0);
                                                                                    leptos::task::spawn_local(async move {
                                                                                        let _ = api_admin_req::<_, OkResp>("POST", &format!("/api/admin/users/{id_u}/balance"), Some(&AdminBalancePayload { mode: "add".into(), amount: amt }), &k).await;
                                                                                        reload_tick.update(|v| *v += 1);
                                                                                    });
                                                                                }>"+ เติมยอด"</button>
                                                                                <button type="button" class="adm-btn sm primary" on:click=move |_| {
                                                                                    let k = admin_key.get();
                                                                                    let id_u = uid_role.clone();
                                                                                    let next_role = if is_adm { "user" } else { "admin" };
                                                                                    leptos::task::spawn_local(async move {
                                                                                        let _ = api_admin_req::<_, OkResp>("PATCH", &format!("/api/admin/users/{id_u}/role"), Some(&serde_json::json!({ "role": next_role })), &k).await;
                                                                                        reload_tick.update(|v| *v += 1);
                                                                                    });
                                                                                }>{if is_adm { "ลดเป็น User" } else { "แต่งตั้ง Admin" }}</button>
                                                                                <button type="button" class="adm-btn sm danger" on:click=move |_| {
                                                                                    let k = admin_key.get();
                                                                                    let id_u = uid_ban.clone();
                                                                                    leptos::task::spawn_local(async move {
                                                                                        let _ = api_admin_req::<_, OkResp>("PATCH", &format!("/api/admin/users/{id_u}/ban"), Some(&serde_json::json!({ "banned": !is_banned })), &k).await;
                                                                                        reload_tick.update(|v| *v += 1);
                                                                                    });
                                                                                }>{if is_banned { "ปลดแบน" } else { "แบนผู้ใช้" }}</button>
                                                                            </div>
                                                                        </td>
                                                                    </tr>
                                                                }
                                                            }).collect_view().into_any()
                                                        }}
                                                    </tbody>
                                                </table>
                                            </div>
                                            <div style="font-size:12px;color:#71717a;margin-top:12px;">
                                                {move || {
                                                    let q = user_search.get().trim().to_lowercase();
                                                    let cnt = users_res.get().unwrap_or_default().into_iter().filter(|u| {
                                                        let matches_q = q.is_empty() || u.username.to_lowercase().contains(&q) || u.id.to_lowercase().contains(&q);
                                                        if staff_only && q.is_empty() { u.role == "admin" } else { matches_q }
                                                    }).count();
                                                    format!("แสดงทั้งหมด {cnt} รายการ")
                                                }}
                                            </div>
                                        </div>
                                    }.into_any()
                                },
                                _ => ().into_any(),
                            }}
                        </div>
                    </div>
                }.into_any()
            }}
        </div>
    }
}

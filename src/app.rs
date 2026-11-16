use leptos::prelude::*;
use leptos_meta::{Meta, MetaTags, Stylesheet, Title, provide_meta_context};
use leptos_router::{
    StaticSegment,
    components::{Route, Router, Routes},
    path,
};

#[cfg(feature = "hydrate")]
use crate::client_api::api_get;
use crate::components::layout::{AppStateContext, Footer, LivePurchaseToast, Navbar};
#[cfg(feature = "hydrate")]
use crate::models::AuthResponse;
use crate::models::{StoreStatusResponse, StoreSummaryResponse, UserPublic};
use crate::pages::{
    account::AccountPage,
    admin::AdminPage,
    auth::{LoginPage, RegisterPage},
    home::HomePage,
    info::{ContactPage, StatusPage, TosPage},
    products::{ProductSlugPage, ProductsPage},
};

pub fn shell(options: LeptosOptions) -> impl IntoView {
    view! {
        <!DOCTYPE html>
        <html lang="th">
            <head>
                <meta charset="utf-8"/>
                <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/>
                <meta name="theme-color" content="#000000"/>
                <link rel="icon" href="/favicon.ico"/>
                <AutoReload options=options.clone() />
                <HydrationScripts options/>
                <MetaTags/>
            </head>
            <body>
                <App/>
            </body>
        </html>
    }
}

#[component]
pub fn App() -> impl IntoView {
    provide_meta_context();

    let user = RwSignal::new(Option::<UserPublic>::None);
    let status = RwSignal::new(Option::<StoreStatusResponse>::None);
    let summary = RwSignal::new(Option::<StoreSummaryResponse>::None);
    let refresh_tick = RwSignal::new(0u64);

    provide_context(AppStateContext {
        user,
        status,
        summary,
        refresh_tick,
    });

    #[cfg(feature = "hydrate")]
    {
        Effect::new(move |_| {
            let _tick = refresh_tick.get();
            leptos::task::spawn_local(async move {
                if let Ok(me) = api_get::<AuthResponse>("/api/auth/me").await {
                    user.set(me.user);
                }
                if let Ok(st) = api_get::<StoreStatusResponse>("/api/status").await {
                    status.set(Some(st));
                }
                if let Ok(sum) = api_get::<StoreSummaryResponse>("/api/summary").await {
                    summary.set(Some(sum));
                }
            });
        });
    }

    view! {
        <Stylesheet id="leptos" href="/pkg/xenary_store.css"/>
        <Title text="XENARY STORE — 100% Rust Full-Stack Marketplace"/>
        <Meta name="description" content="ร้านค้าจำหน่ายสินค้าดิจิทัล คีย์เกม และซอฟต์แวร์คุณภาพ ขับเคลื่อนด้วย Rust Full-Stack (Axum + Leptos + SQLx)"/>

        <Router>
            <Navbar/>
            <main class="xn-main">
                <Routes fallback=|| view! {
                    <div class="xn-pg" style="text-align:center;">
                        <h1>"404 — ไม่พบหน้าที่ต้องการ"</h1>
                        <p class="lead">"หน้าที่คุณเข้าถึงอาจถูกย้ายหรือไม่มีอยู่ในระบบ"</p>
                        <a href="/" class="xn-btn" style="display:inline-block;text-decoration:none;">"กลับหน้าหลัก"</a>
                    </div>
                }>
                    <Route path=StaticSegment("") view=HomePage/>
                    <Route path=path!("/products") view=ProductsPage/>
                    <Route path=path!("/products/") view=ProductsPage/>
                    <Route path=path!("/product/:slug") view=ProductSlugPage/>
                    <Route path=path!("/account") view=AccountPage/>
                    <Route path=path!("/account/") view=AccountPage/>
                    <Route path=path!("/login") view=LoginPage/>
                    <Route path=path!("/login/") view=LoginPage/>
                    <Route path=path!("/register") view=RegisterPage/>
                    <Route path=path!("/register/") view=RegisterPage/>
                    <Route path=path!("/status") view=StatusPage/>
                    <Route path=path!("/status/") view=StatusPage/>
                    <Route path=path!("/contact") view=ContactPage/>
                    <Route path=path!("/contact/") view=ContactPage/>
                    <Route path=path!("/tos") view=TosPage/>
                    <Route path=path!("/tos/") view=TosPage/>
                    <Route path=path!("/admin") view=AdminPage/>
                    <Route path=path!("/admin/") view=AdminPage/>
                    <Route path=path!("/admin/redeem") view=AdminPage/>
                    <Route path=path!("/admin/staff") view=AdminPage/>
                </Routes>
            </main>
            <Footer/>
            <LivePurchaseToast/>
        </Router>
    }
}

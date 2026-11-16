#[cfg(feature = "ssr")]
#[tokio::main]
async fn main() {
    use std::path::PathBuf;
    use std::sync::Arc;

    use axum::{
        Router,
        http::{HeaderValue, header},
    };
    use leptos::prelude::*;
    use leptos_axum::{LeptosRoutes, generate_route_list};
    use tower_http::{
        compression::CompressionLayer,
        services::{ServeDir, ServeFile},
        set_header::SetResponseHeaderLayer,
    };

    use xenary_store::api::{ApiState, api_router};
    use xenary_store::app::{App, shell};
    use xenary_store::db::StoreRepo;
    use xenary_store::security::BoundedRateLimiter;

    let _ = dotenvy::dotenv();
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "xenary_store=info,tower_http=warn".into()),
        )
        .init();

    let conf = get_configuration(None).expect("Failed to load Leptos configuration");
    let mut leptos_options = conf.leptos_options;

    let port = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse::<u16>().ok())
        .unwrap_or(3000);
    let addr: std::net::SocketAddr = format!("0.0.0.0:{port}")
        .parse()
        .expect("Invalid bind address");
    leptos_options.site_addr = addr;

    let data_dir = PathBuf::from("src/data");
    let repo = StoreRepo::init(data_dir).await;
    let api_state = ApiState {
        repo,
        limiter: Arc::new(BoundedRateLimiter::new(10_000)),
    };

    let routes = generate_route_list(App);

    let leptos_router = Router::new()
        .leptos_routes(&leptos_options, routes, {
            let leptos_options = leptos_options.clone();
            move || shell(leptos_options.clone())
        })
        .fallback(leptos_axum::file_and_error_handler(shell))
        .with_state(leptos_options.clone());

    let app = Router::new()
        .merge(api_router(api_state))
        .nest_service("/assets/img", ServeDir::new("assets/img"))
        .route_service("/favicon.ico", ServeFile::new("favicon.ico"))
        .merge(leptos_router)
        .layer(CompressionLayer::new())
        .layer(SetResponseHeaderLayer::overriding(
            header::X_CONTENT_TYPE_OPTIONS,
            HeaderValue::from_static("nosniff"),
        ))
        .layer(SetResponseHeaderLayer::overriding(
            header::X_FRAME_OPTIONS,
            HeaderValue::from_static("SAMEORIGIN"),
        ));

    tracing::info!("XENARY 100% Rust Full-Stack Server listening on http://{addr}");
    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .expect("Failed to bind TCP listener");
    axum::serve(listener, app.into_make_service())
        .await
        .expect("Axum server failed");
}

#[cfg(not(feature = "ssr"))]
pub fn main() {}

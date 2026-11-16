use std::sync::Arc;

use axum::{
    Json, Router,
    extract::{Path, Query, State},
    http::{HeaderMap, HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
    routing::{delete, get, patch, post},
};
use serde::Deserialize;
use serde_json::json;
use validator::Validate;

use crate::db::StoreRepo;
use crate::error::{AppError, AppResult};
use crate::models::*;
use crate::security::{
    BoundedRateLimiter, build_session_cookie_header, sign_session_jwt, timing_safe_str_equal,
    verify_session_jwt,
};

const COOKIE_NAME: &str = "xn_sid";

#[derive(Clone)]
pub struct ApiState {
    pub repo: StoreRepo,
    pub limiter: Arc<BoundedRateLimiter>,
}

pub fn api_router(state: ApiState) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/api/status", get(get_status))
        .route("/api/summary", get(get_summary))
        .route("/api/products", get(list_products))
        .route("/api/products/{slug}", get(get_product))
        .route("/api/coupons/check", post(check_coupon))
        .route("/api/channels/public", get(list_public_channels))
        .route("/api/support-links", get(list_support_links))
        .route("/api/news", get(list_news))
        // Auth
        .route("/api/auth/me", get(auth_me))
        .route("/api/auth/register", post(auth_register))
        .route("/api/auth/login", post(auth_login))
        .route("/api/auth/logout", post(auth_logout))
        // Orders & Topups (Authenticated)
        .route("/api/orders", get(list_my_orders).post(create_order))
        .route("/api/topup/history", get(list_my_topups))
        .route("/api/topup/promptpay", post(create_promptpay))
        .route("/api/topup/bank-slip", post(submit_bank_slip))
        .route("/api/topup/truemoney", post(submit_truemoney))
        .route("/api/topup/redeem", post(redeem_code))
        // Admin API
        .route("/api/admin/stats", get(admin_stats))
        .route(
            "/api/admin/products",
            get(admin_list_products).post(admin_save_product),
        )
        .route(
            "/api/admin/products/{slug}",
            delete(admin_delete_product),
        )
        .route(
            "/api/admin/keys",
            get(admin_list_keys).post(admin_add_keys),
        )
        .route("/api/admin/keys/{id}", delete(admin_delete_key))
        .route("/api/admin/orders", get(admin_list_orders))
        .route("/api/admin/topups", get(admin_list_topups))
        .route("/api/admin/topups/{id}/approve", post(admin_approve_topup))
        .route("/api/admin/topups/{id}/reject", post(admin_reject_topup))
        .route("/api/admin/users", get(admin_list_users))
        .route("/api/admin/users/{id}/balance", post(admin_adjust_balance))
        .route("/api/admin/users/{id}/role", patch(admin_set_role))
        .route("/api/admin/users/{id}/ban", patch(admin_toggle_ban))
        .route(
            "/api/admin/coupons",
            get(admin_list_coupons).post(admin_create_coupon),
        )
        .route("/api/admin/coupons/{id}", delete(admin_delete_coupon))
        .route(
            "/api/admin/channels",
            get(admin_list_channels).post(admin_create_channel),
        )
        .route("/api/admin/channels/{id}", delete(admin_delete_channel))
        .route(
            "/api/admin/news",
            get(admin_list_news).post(admin_create_news),
        )
        .route("/api/admin/news/{id}", delete(admin_delete_news))
        .route(
            "/api/admin/support-links",
            get(admin_list_support).post(admin_create_support),
        )
        .route("/api/admin/support-links/{id}", delete(admin_delete_support))
        .route(
            "/api/admin/settings",
            get(admin_get_settings).patch(admin_save_settings),
        )
        .with_state(state)
}

fn extract_cookie(headers: &HeaderMap, name: &str) -> Option<String> {
    let raw = headers.get(header::COOKIE)?.to_str().ok()?;
    for pair in raw.split(';') {
        if let Some((k, v)) = pair.split_once('=')
            && k.trim() == name
        {
            return Some(v.trim().to_string());
        }
    }
    None
}

fn is_https(headers: &HeaderMap) -> bool {
    headers
        .get("x-forwarded-proto")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.eq_ignore_ascii_case("https"))
        .unwrap_or(false)
}

async fn current_user(state: &ApiState, headers: &HeaderMap) -> Option<UserPublic> {
    let token = extract_cookie(headers, COOKIE_NAME)?;
    let claims = verify_session_jwt(&token, state.repo.jwt_secret())?;
    state.repo.get_user_by_id(&claims.sub).await
}

async fn require_user(state: &ApiState, headers: &HeaderMap) -> AppResult<UserPublic> {
    current_user(state, headers)
        .await
        .ok_or_else(|| AppError::Unauthorized("กรุณาเข้าสู่ระบบก่อนทำรายการ".into()))
}

async fn require_admin(state: &ApiState, headers: &HeaderMap) -> AppResult<()> {
    if let Some(u) = current_user(state, headers).await
        && u.role == "admin"
    {
        return Ok(());
    }
    let configured = state.repo.admin_key();
    if let Some(hkey) = headers.get("x-admin-key").and_then(|v| v.to_str().ok())
        && !configured.is_empty()
        && timing_safe_str_equal(hkey.trim(), configured)
    {
        return Ok(());
    }
    Err(AppError::Forbidden("ไม่มีสิทธิ์เข้าถึงระบบผู้ดูแล".into()))
}

// --- Public Handlers ---

async fn health(State(state): State<ApiState>) -> impl IntoResponse {
    Json(json!({
        "ok": true,
        "engine": "rust-100-axum-leptos",
        "db_driver": state.repo.db_driver(),
        "postgres_connected": state.repo.has_postgres(),
        "version": "1.0.0",
    }))
}

async fn get_status(State(state): State<ApiState>) -> impl IntoResponse {
    Json(state.repo.get_status().await)
}

async fn get_summary(State(state): State<ApiState>) -> impl IntoResponse {
    Json(state.repo.get_summary().await)
}

async fn list_products(State(state): State<ApiState>) -> impl IntoResponse {
    Json(state.repo.get_catalog_enriched().await)
}

async fn get_product(
    State(state): State<ApiState>,
    Path(slug): Path<String>,
) -> AppResult<Json<Product>> {
    Ok(Json(state.repo.get_product_by_slug(&slug).await?))
}

async fn check_coupon(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Json(payload): Json<CouponValidatePayload>,
) -> AppResult<Json<CouponValidateResponse>> {
    let uid = current_user(&state, &headers).await.map(|u| u.id);
    let res = state
        .repo
        .check_discount_coupon(&payload.code, payload.subtotal, uid.as_deref())
        .await?;
    Ok(Json(res))
}

async fn list_public_channels(State(state): State<ApiState>) -> impl IntoResponse {
    Json(json!({ "ok": true, "channels": state.repo.get_public_channels().await }))
}

async fn list_support_links(State(state): State<ApiState>) -> impl IntoResponse {
    Json(json!({ "ok": true, "links": state.repo.get_public_support_links().await }))
}

async fn list_news(State(state): State<ApiState>) -> impl IntoResponse {
    Json(json!({ "ok": true, "news": state.repo.get_public_news().await }))
}

// --- Auth Handlers ---

async fn auth_me(State(state): State<ApiState>, headers: HeaderMap) -> impl IntoResponse {
    let user = current_user(&state, &headers).await;
    Json(AuthResponse {
        ok: true,
        user,
        message: None,
    })
}

async fn auth_register(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Json(payload): Json<RegisterPayload>,
) -> AppResult<Response> {
    if !payload.website.trim().is_empty() {
        return Err(AppError::BadRequest("Invalid request".into()));
    }
    if !state.limiter.check("reg:global", 30, 60_000) {
        return Err(AppError::TooManyRequests(
            "คำขอสมัครสมาชิกมากเกินไป กรุณารอสักครู่".into(),
        ));
    }
    payload
        .validate()
        .map_err(|e| AppError::BadRequest(e.to_string()))?;

    let user = state
        .repo
        .register_user(&payload.username, &payload.password)
        .await?;
    let ttl = if payload.remember {
        30 * 24 * 3600
    } else {
        24 * 3600
    };
    let sid = format!("s_{:08x}", rand::random::<u32>());
    let jwt = sign_session_jwt(&user.id, &user.role, &sid, ttl, state.repo.jwt_secret())
        .map_err(AppError::Internal)?;
    let cookie = build_session_cookie_header(COOKIE_NAME, &jwt, Some(ttl), is_https(&headers));

    let mut resp = (
        StatusCode::CREATED,
        Json(AuthResponse {
            ok: true,
            user: Some(user),
            message: Some("สมัครสมาชิกสำเร็จ".into()),
        }),
    )
        .into_response();
    if let Ok(hv) = HeaderValue::from_str(&cookie) {
        resp.headers_mut().insert(header::SET_COOKIE, hv);
    }
    Ok(resp)
}

async fn auth_login(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Json(payload): Json<LoginPayload>,
) -> AppResult<Response> {
    if !payload.website.trim().is_empty() {
        return Err(AppError::BadRequest("Invalid request".into()));
    }
    let rl_key = format!("login:{}", payload.username.trim().to_lowercase());
    if !state.limiter.check(&rl_key, 15, 60_000) {
        return Err(AppError::TooManyRequests(
            "พยายามเข้าสู่ระบบบ่อยเกินไป กรุณารอ 1 นาที".into(),
        ));
    }
    payload
        .validate()
        .map_err(|e| AppError::BadRequest(e.to_string()))?;

    let user = state
        .repo
        .authenticate_user(&payload.username, &payload.password)
        .await?;
    let ttl = if payload.remember {
        30 * 24 * 3600
    } else {
        24 * 3600
    };
    let sid = format!("s_{:08x}", rand::random::<u32>());
    let jwt = sign_session_jwt(&user.id, &user.role, &sid, ttl, state.repo.jwt_secret())
        .map_err(AppError::Internal)?;
    let cookie = build_session_cookie_header(COOKIE_NAME, &jwt, Some(ttl), is_https(&headers));

    let mut resp = Json(AuthResponse {
        ok: true,
        user: Some(user),
        message: Some("เข้าสู่ระบบสำเร็จ".into()),
    })
    .into_response();
    if let Ok(hv) = HeaderValue::from_str(&cookie) {
        resp.headers_mut().insert(header::SET_COOKIE, hv);
    }
    Ok(resp)
}

async fn auth_logout(headers: HeaderMap) -> Response {
    let cookie = build_session_cookie_header(COOKIE_NAME, "", None, is_https(&headers));
    let mut resp = Json(json!({ "ok": true })).into_response();
    if let Ok(hv) = HeaderValue::from_str(&cookie) {
        resp.headers_mut().insert(header::SET_COOKIE, hv);
    }
    resp
}

// --- Orders & Topup Handlers ---

async fn list_my_orders(
    State(state): State<ApiState>,
    headers: HeaderMap,
) -> AppResult<Json<serde_json::Value>> {
    let user = require_user(&state, &headers).await?;
    let orders = state.repo.get_user_orders(&user.id).await;
    Ok(Json(json!({ "ok": true, "orders": orders })))
}

async fn create_order(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Json(payload): Json<BuyOrderPayload>,
) -> AppResult<Json<BuyOrderResponse>> {
    let user = require_user(&state, &headers).await?;
    payload
        .validate()
        .map_err(|e| AppError::BadRequest(e.to_string()))?;
    let res = state.repo.place_order(&user.id, &payload).await?;
    Ok(Json(res))
}

async fn list_my_topups(
    State(state): State<ApiState>,
    headers: HeaderMap,
) -> AppResult<Json<serde_json::Value>> {
    let user = require_user(&state, &headers).await?;
    let topups = state.repo.get_user_topups(&user.id).await;
    Ok(Json(json!({ "ok": true, "topups": topups })))
}

async fn create_promptpay(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Json(payload): Json<PromptPayCreatePayload>,
) -> AppResult<Json<serde_json::Value>> {
    let user = require_user(&state, &headers).await?;
    let rec = state
        .repo
        .create_promptpay_topup(&user.id, &user.username, payload.amount)
        .await?;
    Ok(Json(json!({ "ok": true, "topup": rec })))
}

async fn submit_bank_slip(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Json(payload): Json<BankSlipPayload>,
) -> AppResult<Json<serde_json::Value>> {
    let user = require_user(&state, &headers).await?;
    let rec = state
        .repo
        .submit_bank_slip(&user.id, &user.username, &payload)
        .await?;
    Ok(Json(json!({
        "ok": true,
        "topup": rec,
        "message": "ส่งสลิปโอนเงินสำเร็จ รอแอดมินตรวจสอบ",
    })))
}

async fn submit_truemoney(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Json(payload): Json<TrueMoneyPayload>,
) -> AppResult<Json<serde_json::Value>> {
    let user = require_user(&state, &headers).await?;
    let rec = state
        .repo
        .submit_truemoney(&user.id, &user.username, &payload.link)
        .await?;
    Ok(Json(json!({
        "ok": true,
        "topup": rec,
        "message": "ส่งซองอั่งเปาสำเร็จ รอตรวจสอบยอดเงิน",
    })))
}

async fn redeem_code(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Json(payload): Json<RedeemCodePayload>,
) -> AppResult<Json<serde_json::Value>> {
    let user = require_user(&state, &headers).await?;
    let (credited, new_balance) = state
        .repo
        .redeem_credit_code(&user.id, &user.username, &payload.code)
        .await?;
    Ok(Json(json!({
        "ok": true,
        "credited": credited,
        "new_balance": new_balance,
        "message": format!("แลกโค้ดสำเร็จ ได้รับเครดิต ฿{credited:.2}"),
    })))
}

// --- Admin Handlers ---

#[derive(Deserialize)]
struct KeysQuery {
    product_id: Option<String>,
}

#[derive(Deserialize)]
struct ReviewTopupBody {
    amount: Option<f64>,
}

#[derive(Deserialize)]
struct RoleBody {
    role: String,
}

#[derive(Deserialize)]
struct BanBody {
    banned: bool,
}

async fn admin_stats(
    State(state): State<ApiState>,
    headers: HeaderMap,
) -> AppResult<Json<AdminStatsResponse>> {
    require_admin(&state, &headers).await?;
    Ok(Json(state.repo.get_admin_stats().await))
}

async fn admin_list_products(
    State(state): State<ApiState>,
    headers: HeaderMap,
) -> AppResult<Json<CatalogFile>> {
    require_admin(&state, &headers).await?;
    Ok(Json(state.repo.get_catalog_enriched().await))
}

async fn admin_save_product(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Json(payload): Json<AdminCreateProductPayload>,
) -> AppResult<Json<serde_json::Value>> {
    require_admin(&state, &headers).await?;
    let product = state.repo.admin_upsert_product(&payload).await?;
    Ok(Json(json!({ "ok": true, "product": product })))
}

async fn admin_delete_product(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Path(slug): Path<String>,
) -> AppResult<Json<serde_json::Value>> {
    require_admin(&state, &headers).await?;
    state.repo.admin_delete_product(&slug).await?;
    Ok(Json(json!({ "ok": true })))
}

async fn admin_list_keys(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Query(q): Query<KeysQuery>,
) -> AppResult<Json<serde_json::Value>> {
    require_admin(&state, &headers).await?;
    let keys = state
        .repo
        .admin_list_keys(q.product_id.as_deref())
        .await;
    Ok(Json(json!({ "ok": true, "keys": keys })))
}

async fn admin_add_keys(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Json(payload): Json<AdminAddKeysPayload>,
) -> AppResult<Json<serde_json::Value>> {
    require_admin(&state, &headers).await?;
    let added = state.repo.admin_add_keys(&payload).await?;
    Ok(Json(json!({ "ok": true, "added": added })))
}

async fn admin_delete_key(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> AppResult<Json<serde_json::Value>> {
    require_admin(&state, &headers).await?;
    state.repo.admin_delete_key(&id).await?;
    Ok(Json(json!({ "ok": true })))
}

async fn admin_list_orders(
    State(state): State<ApiState>,
    headers: HeaderMap,
) -> AppResult<Json<serde_json::Value>> {
    require_admin(&state, &headers).await?;
    let orders = state.repo.admin_list_orders().await;
    Ok(Json(json!({ "ok": true, "orders": orders })))
}

async fn admin_list_topups(
    State(state): State<ApiState>,
    headers: HeaderMap,
) -> AppResult<Json<serde_json::Value>> {
    require_admin(&state, &headers).await?;
    let topups = state.repo.admin_list_topups().await;
    Ok(Json(json!({ "ok": true, "topups": topups })))
}

async fn admin_approve_topup(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    body: Option<Json<ReviewTopupBody>>,
) -> AppResult<Json<serde_json::Value>> {
    require_admin(&state, &headers).await?;
    let amt = body.and_then(|b| b.amount);
    let topup = state.repo.admin_review_topup(&id, true, amt).await?;
    Ok(Json(json!({ "ok": true, "topup": topup })))
}

async fn admin_reject_topup(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> AppResult<Json<serde_json::Value>> {
    require_admin(&state, &headers).await?;
    let topup = state.repo.admin_review_topup(&id, false, None).await?;
    Ok(Json(json!({ "ok": true, "topup": topup })))
}

async fn admin_list_users(
    State(state): State<ApiState>,
    headers: HeaderMap,
) -> AppResult<Json<serde_json::Value>> {
    require_admin(&state, &headers).await?;
    let users = state.repo.admin_list_users().await;
    Ok(Json(json!({ "ok": true, "users": users })))
}

async fn admin_adjust_balance(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(payload): Json<AdminBalancePayload>,
) -> AppResult<Json<serde_json::Value>> {
    require_admin(&state, &headers).await?;
    let user = state
        .repo
        .admin_adjust_balance(&id, &payload.mode, payload.amount)
        .await?;
    Ok(Json(json!({ "ok": true, "user": user })))
}

async fn admin_set_role(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(payload): Json<RoleBody>,
) -> AppResult<Json<serde_json::Value>> {
    require_admin(&state, &headers).await?;
    let user = state.repo.admin_set_user_role(&id, &payload.role).await?;
    Ok(Json(json!({ "ok": true, "user": user })))
}

async fn admin_toggle_ban(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(payload): Json<BanBody>,
) -> AppResult<Json<serde_json::Value>> {
    require_admin(&state, &headers).await?;
    let user = state.repo.admin_toggle_ban(&id, payload.banned).await?;
    Ok(Json(json!({ "ok": true, "user": user })))
}

async fn admin_list_coupons(
    State(state): State<ApiState>,
    headers: HeaderMap,
) -> AppResult<Json<serde_json::Value>> {
    require_admin(&state, &headers).await?;
    let coupons = state.repo.admin_list_coupons().await;
    Ok(Json(json!({ "ok": true, "coupons": coupons })))
}

async fn admin_create_coupon(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Json(payload): Json<AdminCreateCouponPayload>,
) -> AppResult<Json<serde_json::Value>> {
    require_admin(&state, &headers).await?;
    let coupon = state.repo.admin_create_coupon(&payload).await?;
    Ok(Json(json!({ "ok": true, "coupon": coupon })))
}

async fn admin_delete_coupon(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> AppResult<Json<serde_json::Value>> {
    require_admin(&state, &headers).await?;
    state.repo.admin_delete_coupon(&id).await?;
    Ok(Json(json!({ "ok": true })))
}

async fn admin_list_channels(
    State(state): State<ApiState>,
    headers: HeaderMap,
) -> AppResult<Json<serde_json::Value>> {
    require_admin(&state, &headers).await?;
    let channels = state.repo.admin_list_channels().await;
    Ok(Json(json!({ "ok": true, "channels": channels })))
}

async fn admin_create_channel(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Json(payload): Json<AdminCreateChannelPayload>,
) -> AppResult<Json<serde_json::Value>> {
    require_admin(&state, &headers).await?;
    let channel = state.repo.admin_create_channel(&payload).await?;
    Ok(Json(json!({ "ok": true, "channel": channel })))
}

async fn admin_delete_channel(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> AppResult<Json<serde_json::Value>> {
    require_admin(&state, &headers).await?;
    state.repo.admin_delete_channel(&id).await?;
    Ok(Json(json!({ "ok": true })))
}

async fn admin_list_news(
    State(state): State<ApiState>,
    headers: HeaderMap,
) -> AppResult<Json<serde_json::Value>> {
    require_admin(&state, &headers).await?;
    let news = state.repo.admin_list_news().await;
    Ok(Json(json!({ "ok": true, "news": news })))
}

async fn admin_create_news(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Json(payload): Json<AdminCreateNewsPayload>,
) -> AppResult<Json<serde_json::Value>> {
    require_admin(&state, &headers).await?;
    let item = state.repo.admin_create_news(&payload).await?;
    Ok(Json(json!({ "ok": true, "news": item })))
}

async fn admin_delete_news(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> AppResult<Json<serde_json::Value>> {
    require_admin(&state, &headers).await?;
    state.repo.admin_delete_news(&id).await?;
    Ok(Json(json!({ "ok": true })))
}

async fn admin_list_support(
    State(state): State<ApiState>,
    headers: HeaderMap,
) -> AppResult<Json<serde_json::Value>> {
    require_admin(&state, &headers).await?;
    let links = state.repo.admin_list_support().await;
    Ok(Json(json!({ "ok": true, "links": links })))
}

async fn admin_create_support(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Json(payload): Json<AdminCreateSupportPayload>,
) -> AppResult<Json<serde_json::Value>> {
    require_admin(&state, &headers).await?;
    let link = state.repo.admin_create_support(&payload).await?;
    Ok(Json(json!({ "ok": true, "link": link })))
}

async fn admin_delete_support(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> AppResult<Json<serde_json::Value>> {
    require_admin(&state, &headers).await?;
    state.repo.admin_delete_support(&id).await?;
    Ok(Json(json!({ "ok": true })))
}

async fn admin_get_settings(
    State(state): State<ApiState>,
    headers: HeaderMap,
) -> AppResult<Json<serde_json::Value>> {
    require_admin(&state, &headers).await?;
    let settings = state.repo.get_settings().await;
    Ok(Json(json!({ "ok": true, "settings": settings })))
}

async fn admin_save_settings(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Json(payload): Json<StoreSettings>,
) -> AppResult<Json<serde_json::Value>> {
    require_admin(&state, &headers).await?;
    let settings = state.repo.save_settings(payload).await?;
    Ok(Json(json!({ "ok": true, "settings": settings })))
}

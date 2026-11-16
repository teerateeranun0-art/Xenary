use serde::{Deserialize, Serialize};
use validator::Validate;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ProductPlan {
    pub label: String,
    pub price: f64,
    #[serde(default)]
    pub per: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stock: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub plan_keys: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Product {
    pub slug: String,
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub channel: String,
    pub name: String,
    #[serde(default = "default_tag")]
    pub tag: String,
    #[serde(default, alias = "description")]
    pub desc: String,
    #[serde(default)]
    pub stock: i64,
    #[serde(default)]
    pub sold: i64,
    #[serde(default, rename = "bestSeller")]
    pub best_seller: bool,
    #[serde(default)]
    pub featured: bool,
    #[serde(default = "default_true")]
    pub key_based: bool,
    #[serde(default = "default_hero_img")]
    pub img: String,
    #[serde(default)]
    pub plans: Vec<ProductPlan>,
    #[serde(default)]
    pub download_url: String,
    #[serde(default)]
    pub tutorial_video: String,
    #[serde(default)]
    pub unused_keys: i64,
    #[serde(default)]
    pub from: f64,
    #[serde(default)]
    pub updating: bool,
    #[serde(default = "default_status_mode")]
    pub status_mode: String,
    #[serde(default)]
    pub update_note: String,
    #[serde(default, rename = "updatedAt")]
    pub updated_at: String,
}

fn default_tag() -> String {
    "General".to_string()
}
fn default_true() -> bool {
    true
}
fn default_hero_img() -> String {
    "/assets/img/hero.jpg".to_string()
}
fn default_status_mode() -> String {
    "normal".to_string()
}
fn default_currency() -> String {
    "฿".to_string()
}
fn default_site_name() -> String {
    "XENARY".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CatalogFile {
    #[serde(default = "default_site_name")]
    pub store: String,
    #[serde(default)]
    pub currency: String,
    #[serde(default = "default_currency", rename = "currencySymbol")]
    pub currency_symbol: String,
    #[serde(default, rename = "updatedAt")]
    pub updated_at: String,
    #[serde(default)]
    pub products: Vec<Product>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct UserRecord {
    pub id: String,
    pub username: String,
    #[serde(default)]
    pub pass: String,
    #[serde(default)]
    pub balance: f64,
    #[serde(default = "default_user_role")]
    pub role: String,
    #[serde(default)]
    pub banned: bool,
    #[serde(default)]
    pub ban_reason: Option<String>,
    #[serde(default, rename = "createdAt", alias = "created_at")]
    pub created_at: String,
    #[serde(default, rename = "updatedAt", alias = "updated_at")]
    pub updated_at: String,
}

fn default_user_role() -> String {
    "user".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct UserPublic {
    pub id: String,
    pub username: String,
    pub balance: f64,
    pub role: String,
    #[serde(default)]
    pub banned: bool,
    #[serde(default)]
    pub ban_reason: Option<String>,
    #[serde(default)]
    pub created_at: String,
}

impl From<&UserRecord> for UserPublic {
    fn from(u: &UserRecord) -> Self {
        Self {
            id: u.id.clone(),
            username: u.username.clone(),
            balance: u.balance,
            role: u.role.clone(),
            banned: u.banned,
            ban_reason: u.ban_reason.clone(),
            created_at: u.created_at.clone(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ProductKey {
    pub id: String,
    pub product_id: String,
    #[serde(default)]
    pub plan_label: Option<String>,
    pub key_value: String,
    #[serde(default)]
    pub is_used: bool,
    #[serde(default)]
    pub order_id: Option<String>,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub used_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct OrderProductSnapshot {
    pub slug: String,
    pub name: String,
    #[serde(default)]
    pub tag: String,
    #[serde(default)]
    pub download_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct OrderPlanSnapshot {
    pub label: String,
    #[serde(default)]
    pub per: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct OrderRecord {
    pub id: String,
    pub status: String,
    #[serde(rename = "userId")]
    pub user_id: String,
    pub product: OrderProductSnapshot,
    pub plan: OrderPlanSnapshot,
    #[serde(rename = "unitPrice")]
    pub unit_price: f64,
    pub quantity: u32,
    pub total: f64,
    #[serde(default = "default_currency")]
    pub currency: String,
    #[serde(default)]
    pub contact: Option<String>,
    #[serde(default)]
    pub keys_delivered: Vec<String>,
    #[serde(default)]
    pub download_url: Option<String>,
    #[serde(default)]
    pub coupon_code: Option<String>,
    #[serde(default)]
    pub discount_amount: f64,
    #[serde(default, rename = "createdAt")]
    pub created_at: String,
    #[serde(default, rename = "paidAt")]
    pub paid_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PublicRecentOrder {
    pub id: String,
    pub buyer: String,
    pub product_slug: String,
    pub product_name: String,
    pub product_img: String,
    pub plan_label: String,
    pub total: f64,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CouponRecord {
    pub id: String,
    pub code: String,
    #[serde(default = "default_coupon_type", rename = "type")]
    pub coupon_type: String,
    #[serde(default = "default_discount_mode")]
    pub discount_mode: String,
    #[serde(default)]
    pub value: f64,
    #[serde(default)]
    pub min_spend: f64,
    #[serde(default)]
    pub max_uses: Option<i64>,
    #[serde(default)]
    pub used_count: i64,
    #[serde(default = "default_one")]
    pub per_user_limit: i64,
    #[serde(default)]
    pub expires_at: Option<String>,
    #[serde(default)]
    pub used_by: std::collections::HashMap<String, i64>,
    #[serde(default)]
    pub note: String,
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default)]
    pub created_at: String,
}

fn default_coupon_type() -> String {
    "discount".to_string()
}
fn default_discount_mode() -> String {
    "fixed".to_string()
}
fn default_one() -> i64 {
    1
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TopupRecord {
    pub id: String,
    pub uid: String,
    #[serde(default)]
    pub username: String,
    pub method: String,
    #[serde(default)]
    pub channel_id: String,
    #[serde(default)]
    pub channel_name: String,
    pub amount: f64,
    #[serde(default)]
    pub pay_amount: Option<f64>,
    #[serde(default)]
    pub voucher: Option<String>,
    #[serde(default)]
    pub slip_url: Option<String>,
    #[serde(default)]
    pub qr_payload: Option<String>,
    #[serde(default)]
    pub qr_svg: Option<String>,
    #[serde(default = "default_pending")]
    pub status: String,
    #[serde(default)]
    pub admin_note: Option<String>,
    #[serde(default)]
    pub created_at: String,
}

fn default_pending() -> String {
    "pending".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PaymentChannel {
    pub id: String,
    pub name: String,
    #[serde(default = "default_bank_type", rename = "type")]
    pub channel_type: String,
    #[serde(default)]
    pub account_no: String,
    #[serde(default)]
    pub account_name: String,
    #[serde(default)]
    pub bank_name: String,
    #[serde(default)]
    pub qr_img: String,
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default)]
    pub sort_order: i32,
    #[serde(default)]
    pub created_at: String,
}

fn default_bank_type() -> String {
    "bank".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct NewsItem {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub content: String,
    #[serde(default)]
    pub image_url: String,
    #[serde(default = "default_true")]
    pub published: bool,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SupportLink {
    pub id: String,
    #[serde(default)]
    pub platform: String,
    pub label: String,
    #[serde(default)]
    pub handle: String,
    pub url: String,
    #[serde(default)]
    pub badge: String,
    #[serde(default)]
    pub description: String,
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default)]
    pub sort_order: i32,
    #[serde(default)]
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct StoreSettings {
    #[serde(default = "default_site_name")]
    pub site_name: String,
    #[serde(default)]
    pub truemoney_phone: String,
    #[serde(default)]
    pub promptpay_id: String,
    #[serde(default = "default_direct")]
    pub topup_mode: String,
    #[serde(default = "default_hero_img")]
    pub banner_url: String,
    #[serde(default)]
    pub discord_url: String,
    #[serde(default)]
    pub line_url: String,
    #[serde(default)]
    pub facebook_url: String,
    #[serde(default)]
    pub telegram_url: String,
    #[serde(default)]
    pub youtube_url: String,
    #[serde(default)]
    pub marquee_text: String,
    #[serde(default = "default_true")]
    pub particles_enabled: bool,
    #[serde(default)]
    pub hero_title: String,
    #[serde(default)]
    pub hero_subtitle: String,
    #[serde(default)]
    pub maintenance: bool,
    #[serde(default)]
    pub updated_at: String,
}

fn default_direct() -> String {
    "direct".to_string()
}

impl Default for StoreSettings {
    fn default() -> Self {
        Self {
            site_name: "XENARY".to_string(),
            truemoney_phone: "0812345678".to_string(),
            promptpay_id: "0812345678".to_string(),
            topup_mode: "direct".to_string(),
            banner_url: "/assets/img/hero.jpg".to_string(),
            discord_url: "https://discord.gg/xenary".to_string(),
            line_url: String::new(),
            facebook_url: String::new(),
            telegram_url: String::new(),
            youtube_url: "https://youtube.com/@xenary".to_string(),
            marquee_text: "เติมเงินซื้อสินค้าแล้ว ไม่มีนโยบาย คืนเงินทุกกรณี  •  จัดส่งคีย์อัตโนมัติ 24 ชั่วโมง".to_string(),
            particles_enabled: true,
            hero_title: "XENARY STORE".to_string(),
            hero_subtitle: "ร้านบริการจำหน่ายสินค้าดิจิทัลและโปรแกรมคุณภาพ ราคาถูกและปลอดภัย จัดส่งคีย์อัตโนมัติทันที".to_string(),
            maintenance: false,
            updated_at: String::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct StoreStatusItem {
    pub slug: String,
    pub name: String,
    pub tag: String,
    pub img: String,
    pub stock: i64,
    pub updating: bool,
    pub update_note: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct StoreStatusResponse {
    pub store: String,
    pub online: bool,
    pub maintenance: bool,
    pub marquee_text: String,
    pub particles_enabled: bool,
    pub hero_title: String,
    pub hero_subtitle: String,
    pub banner_url: String,
    pub discord_url: String,
    pub youtube_url: String,
    pub products: usize,
    pub updating_count: usize,
    pub orders: usize,
    pub paid: usize,
    pub items: Vec<StoreStatusItem>,
    #[serde(default)]
    pub recent_orders: Vec<PublicRecentOrder>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct StoreSummaryResponse {
    pub total_users: usize,
    pub total_products: usize,
    pub total_stock: i64,
    pub total_sold: i64,
    pub recent_orders: Vec<PublicRecentOrder>,
    pub recent_restocks: Vec<Product>,
    #[serde(default)]
    pub categories: Vec<CategorySummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CategorySummary {
    pub name: String,
    pub count: usize,
    pub img: String,
}

// --- API Payloads with Input Validation ---

#[derive(Debug, Clone, Serialize, Deserialize, Validate)]
pub struct RegisterPayload {
    #[validate(length(min = 3, max = 20, message = "ชื่อผู้ใช้ต้องยาว 3-20 ตัวอักษร"))]
    pub username: String,
    #[validate(length(min = 8, max = 72, message = "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร"))]
    pub password: String,
    #[serde(default)]
    pub remember: bool,
    #[serde(default)]
    pub website: String, // honeypot
}

#[derive(Debug, Clone, Serialize, Deserialize, Validate)]
pub struct LoginPayload {
    #[validate(length(min = 3, max = 20, message = "กรุณากรอกชื่อผู้ใช้ให้ถูกต้อง"))]
    pub username: String,
    #[validate(length(min = 1, max = 128, message = "กรุณากรอกรหัสผ่าน"))]
    pub password: String,
    #[serde(default)]
    pub remember: bool,
    #[serde(default)]
    pub website: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthResponse {
    pub ok: bool,
    pub user: Option<UserPublic>,
    #[serde(default)]
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Validate)]
pub struct BuyOrderPayload {
    #[validate(length(min = 1, max = 64))]
    pub slug: String,
    #[validate(length(min = 1, max = 64))]
    pub plan_label: String,
    #[validate(range(min = 1, max = 50, message = "จำนวนสั่งซื้อต้องอยู่ระหว่าง 1-50 ชิ้น"))]
    pub quantity: u32,
    #[serde(default)]
    pub coupon_code: String,
    #[serde(default)]
    pub contact: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BuyOrderResponse {
    pub ok: bool,
    pub order: OrderRecord,
    pub new_balance: f64,
    pub keys: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CouponValidatePayload {
    pub code: String,
    pub subtotal: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CouponValidateResponse {
    pub ok: bool,
    pub valid: bool,
    pub code: String,
    pub discount: f64,
    pub final_total: f64,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PromptPayCreatePayload {
    pub amount: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BankSlipPayload {
    pub amount: f64,
    #[serde(default)]
    pub channel_id: String,
    #[serde(default)]
    pub slip_url: String,
    #[serde(default)]
    pub qr_payload: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrueMoneyPayload {
    pub link: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RedeemCodePayload {
    pub code: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AdminStatsResponse {
    pub rev_today: f64,
    pub rev_month: f64,
    pub rev_total: f64,
    pub orders_paid: usize,
    pub total_users: usize,
    pub topups_pending: usize,
    pub keys_remain: usize,
    pub recent_orders: Vec<OrderRecord>,
    pub product_stock: Vec<ProductStockRow>,
    #[serde(default)]
    pub db_driver: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ProductStockRow {
    pub slug: String,
    pub name: String,
    pub stock: i64,
    pub sold: i64,
    pub unused_keys: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdminCreateProductPayload {
    pub slug: String,
    pub name: String,
    pub tag: String,
    pub desc: String,
    pub img: String,
    #[serde(default)]
    pub download_url: String,
    #[serde(default)]
    pub tutorial_video: String,
    #[serde(default = "default_true")]
    pub key_based: bool,
    #[serde(default)]
    pub best_seller: bool,
    #[serde(default)]
    pub featured: bool,
    #[serde(default)]
    pub updating: bool,
    #[serde(default)]
    pub update_note: String,
    pub plans: Vec<ProductPlan>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdminAddKeysPayload {
    pub product_id: String,
    #[serde(default)]
    pub plan_label: String,
    pub keys_text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdminBalancePayload {
    pub mode: String, // "add" | "sub" | "set"
    pub amount: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdminCreateCouponPayload {
    pub code: String,
    #[serde(default = "default_coupon_type")]
    pub coupon_type: String, // "discount" | "credit"
    #[serde(default = "default_discount_mode")]
    pub discount_mode: String, // "fixed" | "percent"
    pub value: f64,
    #[serde(default)]
    pub min_spend: f64,
    #[serde(default)]
    pub max_uses: Option<i64>,
    #[serde(default = "default_one")]
    pub per_user_limit: i64,
    #[serde(default)]
    pub expires_at: Option<String>,
    #[serde(default)]
    pub note: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdminCreateChannelPayload {
    pub name: String,
    #[serde(default = "default_bank_type")]
    pub channel_type: String,
    pub bank_name: String,
    pub account_no: String,
    pub account_name: String,
    #[serde(default)]
    pub qr_img: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdminCreateNewsPayload {
    pub title: String,
    pub content: String,
    #[serde(default)]
    pub image_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdminCreateSupportPayload {
    pub platform: String,
    pub label: String,
    pub handle: String,
    pub url: String,
    #[serde(default)]
    pub badge: String,
    #[serde(default)]
    pub description: String,
}

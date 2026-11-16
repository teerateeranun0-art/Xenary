use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use chrono::{Datelike, FixedOffset, Utc};
use serde::{Serialize, de::DeserializeOwned};
use sqlx::{PgPool, postgres::PgPoolOptions};
use tokio::sync::{Mutex, RwLock};

use crate::error::{AppError, AppResult};
use crate::models::*;
use crate::security::{
    Satang, extract_truemoney_hash, generate_promptpay_payload, generate_promptpay_svg_data_uri,
    hash_password_argon2, is_safe_url, is_valid_product_slug, mask_buyer_name, validate_username,
    verify_password,
};

#[derive(Debug, Clone)]
pub struct StoreRepo {
    data_dir: PathBuf,
    pg_pool: Option<PgPool>,
    db_driver: String,
    io_lock: Arc<RwLock<()>>,
    tx_lock: Arc<Mutex<()>>,
    jwt_secret: String,
    admin_key: String,
}

impl StoreRepo {
    pub async fn init(data_dir: PathBuf) -> Self {
        let jwt_secret = std::env::var("JWT_SECRET")
            .ok()
            .filter(|s| !s.trim().is_empty())
            .unwrap_or_else(|| {
                let fallback = format!("xenary-rust-session-key-{}", std::process::id());
                fallback
            });
        let admin_key = std::env::var("ADMIN_KEY").unwrap_or_default().trim().to_string();

        let pg_url = resolve_postgres_url();
        let (pg_pool, db_driver) = if let Some(url) = pg_url {
            let max_conns = std::env::var("PG_POOL_MAX")
                .ok()
                .and_then(|v| v.parse::<u32>().ok())
                .unwrap_or(10)
                .clamp(1, 50);
            match PgPoolOptions::new()
                .max_connections(max_conns)
                .acquire_timeout(std::time::Duration::from_secs(5))
                .connect(&url)
                .await
            {
                Ok(pool) => {
                    tracing::info!("Connected to PostgreSQL via sqlx::PgPool");
                    if let Err(e) = bootstrap_postgres_schema(&pool).await {
                        tracing::warn!("PostgreSQL schema bootstrap warning: {e}");
                    }
                    (Some(pool), "postgres".to_string())
                }
                Err(e) => {
                    tracing::warn!("PostgreSQL connect failed ({e}); falling back to JSON store");
                    (None, "json".to_string())
                }
            }
        } else {
            tracing::info!("DB_DRIVER=json (no PostgreSQL credentials configured in .env)");
            (None, "json".to_string())
        };

        Self {
            data_dir,
            pg_pool,
            db_driver,
            io_lock: Arc::new(RwLock::new(())),
            tx_lock: Arc::new(Mutex::new(())),
            jwt_secret,
            admin_key,
        }
    }

    pub fn jwt_secret(&self) -> &str {
        &self.jwt_secret
    }

    pub fn admin_key(&self) -> &str {
        &self.admin_key
    }

    pub fn db_driver(&self) -> &str {
        &self.db_driver
    }

    pub fn has_postgres(&self) -> bool {
        self.pg_pool.is_some()
    }

    async fn read_json<T: DeserializeOwned>(&self, filename: &str, default_val: T) -> T {
        let _guard = self.io_lock.read().await;
        let path = self.data_dir.join(filename);
        match tokio::fs::read_to_string(&path).await {
            Ok(raw) => serde_json::from_str(&raw).unwrap_or(default_val),
            Err(_) => default_val,
        }
    }

    async fn write_json<T: Serialize>(&self, filename: &str, data: &T) -> AppResult<()> {
        let _guard = self.io_lock.write().await;
        let path = self.data_dir.join(filename);
        if let Some(parent) = path.parent() {
            tokio::fs::create_dir_all(parent)
                .await
                .map_err(|e| AppError::Internal(e.to_string()))?;
        }
        let json = serde_json::to_string_pretty(data)
            .map_err(|e| AppError::Internal(e.to_string()))?;
        let tmp = self
            .data_dir
            .join(format!(".{}.{}.tmp", filename, rand::random::<u32>()));
        tokio::fs::write(&tmp, json)
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?;
        tokio::fs::rename(&tmp, &path)
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?;
        Ok(())
    }

    pub async fn get_settings(&self) -> StoreSettings {
        self.read_json("settings.json", StoreSettings::default()).await
    }

    pub async fn save_settings(&self, mut next: StoreSettings) -> AppResult<StoreSettings> {
        if next.site_name.trim().is_empty() {
            next.site_name = "XENARY".to_string();
        }
        if !is_safe_url(&next.banner_url) {
            return Err(AppError::BadRequest("URL แบนเนอร์ไม่ถูกต้อง".into()));
        }
        next.updated_at = Utc::now().to_rfc3339();
        self.write_json("settings.json", &next).await?;
        Ok(next)
    }

    pub async fn get_catalog_enriched(&self) -> CatalogFile {
        let mut cat: CatalogFile = self
            .read_json(
                "products.json",
                CatalogFile {
                    store: "XENARY".into(),
                    currency: "THB".into(),
                    currency_symbol: "฿".into(),
                    updated_at: String::new(),
                    products: vec![],
                },
            )
            .await;
        let keys: Vec<ProductKey> = self.read_json("keys.json", vec![]).await;
        enrich_products_with_keys(&mut cat.products, &keys);
        cat
    }

    pub async fn get_product_by_slug(&self, slug: &str) -> AppResult<Product> {
        let cat = self.get_catalog_enriched().await;
        cat.products
            .into_iter()
            .find(|p| p.slug == slug)
            .ok_or_else(|| AppError::NotFound("ไม่พบสินค้านี้".into()))
    }

    pub async fn get_status(&self) -> StoreStatusResponse {
        let (cat, orders, settings, users) = tokio::join!(
            self.get_catalog_enriched(),
            self.read_json::<Vec<OrderRecord>>("orders.json", vec![]),
            self.get_settings(),
            self.read_json::<Vec<UserRecord>>("users.json", vec![]),
        );
        let updating_count = cat
            .products
            .iter()
            .filter(|p| p.updating || p.status_mode == "updating")
            .count();
        let paid = orders
            .iter()
            .filter(|o| o.status == "paid" || o.status == "delivered")
            .count();
        let items = cat
            .products
            .iter()
            .map(|p| StoreStatusItem {
                slug: p.slug.clone(),
                name: p.name.clone(),
                tag: p.tag.clone(),
                img: p.img.clone(),
                stock: p.stock,
                updating: p.updating || p.status_mode == "updating",
                update_note: p.update_note.clone(),
                updated_at: if p.updated_at.is_empty() {
                    "2026-11-16".to_string()
                } else {
                    p.updated_at.clone()
                },
            })
            .collect();

        let recent_orders = build_recent_orders(&orders, &cat.products, &users, 10);

        StoreStatusResponse {
            store: if settings.site_name.is_empty() {
                "XENARY".to_string()
            } else {
                settings.site_name
            },
            online: !settings.maintenance,
            maintenance: settings.maintenance,
            marquee_text: settings.marquee_text,
            particles_enabled: settings.particles_enabled,
            hero_title: settings.hero_title,
            hero_subtitle: settings.hero_subtitle,
            banner_url: settings.banner_url,
            discord_url: settings.discord_url,
            youtube_url: settings.youtube_url,
            products: cat.products.len(),
            updating_count,
            orders: orders.len(),
            paid,
            items,
            recent_orders,
        }
    }

    pub async fn get_summary(&self) -> StoreSummaryResponse {
        let (cat, orders, users) = tokio::join!(
            self.get_catalog_enriched(),
            self.read_json::<Vec<OrderRecord>>("orders.json", vec![]),
            self.read_json::<Vec<UserRecord>>("users.json", vec![]),
        );

        let total_stock: i64 = cat.products.iter().map(|p| p.stock.max(0)).sum();
        let total_sold: i64 = cat.products.iter().map(|p| p.sold.max(0)).sum();
        let recent_orders = build_recent_orders(&orders, &cat.products, &users, 12);

        let mut restocks = cat.products.clone();
        restocks.retain(|p| p.stock > 0);
        restocks.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
        restocks.truncate(8);

        let mut cat_map: HashMap<String, (usize, String)> = HashMap::new();
        for p in &cat.products {
            let entry = cat_map
                .entry(p.tag.clone())
                .or_insert_with(|| (0, p.img.clone()));
            entry.0 += 1;
        }
        let mut categories: Vec<CategorySummary> = cat_map
            .into_iter()
            .map(|(name, (count, img))| CategorySummary { name, count, img })
            .collect();
        categories.sort_by(|a, b| b.count.cmp(&a.count).then(a.name.cmp(&b.name)));

        StoreSummaryResponse {
            total_users: users.len(),
            total_products: cat.products.len(),
            total_stock,
            total_sold,
            recent_orders,
            recent_restocks: restocks,
            categories,
        }
    }

    // --- Authentication ---

    pub async fn register_user(&self, username: &str, password: &str) -> AppResult<UserPublic> {
        let clean_name = username.trim();
        if !validate_username(clean_name) {
            return Err(AppError::BadRequest(
                "ชื่อผู้ใช้ต้องยาว 3-20 ตัวอักษร และใช้ได้เฉพาะ A-Z a-z 0-9 _".into(),
            ));
        }
        if password.len() < 8 || password.len() > 72 {
            return Err(AppError::BadRequest(
                "รหัสผ่านต้องมีความยาวอย่างน้อย 8-72 ตัวอักษร".into(),
            ));
        }
        let _tx = self.tx_lock.lock().await;
        let mut users: Vec<UserRecord> = self.read_json("users.json", vec![]).await;
        if users
            .iter()
            .any(|u| u.username.eq_ignore_ascii_case(clean_name))
        {
            return Err(AppError::Conflict("ชื่อผู้ใช้นี้ถูกใช้งานแล้ว".into()));
        }
        let pass_hash =
            hash_password_argon2(password).map_err(|e| AppError::Internal(e))?;
        let now = Utc::now().to_rfc3339();
        let uid = format!("U{}", uuid_hex_12());
        let user = UserRecord {
            id: uid,
            username: clean_name.to_string(),
            pass: pass_hash,
            balance: 0.0,
            role: "user".to_string(),
            banned: false,
            ban_reason: None,
            created_at: now.clone(),
            updated_at: now,
        };
        let pub_user = UserPublic::from(&user);
        users.push(user);
        self.write_json("users.json", &users).await?;
        Ok(pub_user)
    }

    pub async fn authenticate_user(&self, username: &str, password: &str) -> AppResult<UserPublic> {
        let clean_name = username.trim();
        let users: Vec<UserRecord> = self.read_json("users.json", vec![]).await;
        let Some(user) = users
            .iter()
            .find(|u| u.username.eq_ignore_ascii_case(clean_name))
        else {
            return Err(AppError::Unauthorized("ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง".into()));
        };
        if user.banned {
            let reason = user
                .ban_reason
                .as_deref()
                .filter(|r| !r.is_empty())
                .unwrap_or("บัญชีถูกระงับการใช้งาน");
            return Err(AppError::Forbidden(reason.to_string()));
        }
        if !verify_password(password, &user.pass) {
            return Err(AppError::Unauthorized("ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง".into()));
        }
        Ok(UserPublic::from(user))
    }

    pub async fn get_user_by_id(&self, uid: &str) -> Option<UserPublic> {
        let users: Vec<UserRecord> = self.read_json("users.json", vec![]).await;
        users
            .iter()
            .find(|u| u.id == uid && !u.banned)
            .map(UserPublic::from)
    }

    // --- Coupons & Discounts (Pure Server Satang Calculation) ---

    pub async fn check_discount_coupon(
        &self,
        code: &str,
        subtotal_thb: f64,
        uid: Option<&str>,
    ) -> AppResult<CouponValidateResponse> {
        let clean_code = code.trim().to_uppercase();
        if clean_code.is_empty() {
            return Err(AppError::BadRequest("กรุณากรอกโค้ดส่วนลด".into()));
        }
        let coupons: Vec<CouponRecord> = self.read_json("coupons.json", vec![]).await;
        let sub_sat = Satang::from_thb(subtotal_thb.max(0.0))
            .map_err(|_| AppError::BadRequest("ยอดสั่งซื้อไม่ถูกต้อง".into()))?;

        let eval = evaluate_coupon(&coupons, &clean_code, sub_sat, uid)?;
        let final_sat = sub_sat.checked_sub(eval).unwrap_or(Satang::ZERO);

        Ok(CouponValidateResponse {
            ok: true,
            valid: true,
            code: clean_code,
            discount: eval.to_thb(),
            final_total: final_sat.to_thb(),
            message: format!("ใช้โค้ดส่วนลดสำเร็จ ลดไป ฿{:.2}", eval.to_thb()),
        })
    }

    // --- Atomic Zero-Trust Checkout ---

    pub async fn place_order(
        &self,
        uid: &str,
        payload: &BuyOrderPayload,
    ) -> AppResult<BuyOrderResponse> {
        if payload.quantity == 0 || payload.quantity > 50 {
            return Err(AppError::BadRequest("จำนวนสั่งซื้อต้องอยู่ระหว่าง 1-50 ชิ้น".into()));
        }
        if !is_valid_product_slug(&payload.slug) {
            return Err(AppError::BadRequest("รหัสสินค้าไม่ถูกต้อง".into()));
        }

        let _tx = self.tx_lock.lock().await;

        let mut users: Vec<UserRecord> = self.read_json("users.json", vec![]).await;
        let user_idx = users
            .iter()
            .position(|u| u.id == uid)
            .ok_or_else(|| AppError::Unauthorized("ไม่พบบัญชีผู้ใช้".into()))?;
        if users[user_idx].banned {
            return Err(AppError::Forbidden("บัญชีถูกระงับการใช้งาน".into()));
        }

        let mut cat: CatalogFile = self
            .read_json(
                "products.json",
                CatalogFile {
                    store: "XENARY".into(),
                    currency: "THB".into(),
                    currency_symbol: "฿".into(),
                    updated_at: String::new(),
                    products: vec![],
                },
            )
            .await;

        let prod_idx = cat
            .products
            .iter()
            .position(|p| p.slug == payload.slug)
            .ok_or_else(|| AppError::NotFound("ไม่พบสินค้านี้".into()))?;

        if cat.products[prod_idx].updating || cat.products[prod_idx].status_mode == "updating" {
            return Err(AppError::Conflict("สินค้าอยู่ระหว่างอัปเดต ชั่วคราว".into()));
        }

        // Server-side authoritative unit price from matched plan
        let plan = cat.products[prod_idx]
            .plans
            .iter()
            .find(|pl| pl.label.trim() == payload.plan_label.trim())
            .cloned()
            .ok_or_else(|| AppError::BadRequest("ไม่พบแพ็กเกจสินค้าที่เลือก".into()))?;

        let unit_sat = Satang::from_thb(plan.price)
            .map_err(|_| AppError::Internal("ราคาแพ็กเกจไม่ถูกต้อง".into()))?;
        let subtotal_sat = unit_sat
            .checked_mul_qty(payload.quantity)
            .ok_or_else(|| AppError::BadRequest("ยอดรวมเกินขีดจำกัด".into()))?;

        let mut coupons: Vec<CouponRecord> = self.read_json("coupons.json", vec![]).await;
        let clean_coupon = payload.coupon_code.trim().to_uppercase();
        let discount_sat = if !clean_coupon.is_empty() {
            evaluate_coupon(&coupons, &clean_coupon, subtotal_sat, Some(uid))?
        } else {
            Satang::ZERO
        };

        let final_sat = subtotal_sat.checked_sub(discount_sat).unwrap_or(Satang::ZERO);
        let bal_sat = Satang::from_thb(users[user_idx].balance)
            .map_err(|_| AppError::Internal("ยอดเงินในบัญชีไม่ถูกต้อง".into()))?;

        if bal_sat < final_sat {
            return Err(AppError::BadRequest(format!(
                "ยอดเงินคงเหลือไม่พอ (ต้องการ ฿{:.2}, มีอยู่ ฿{:.2})",
                final_sat.to_thb(),
                bal_sat.to_thb()
            )));
        }

        // Reserve keys atomically
        let mut keys: Vec<ProductKey> = self.read_json("keys.json", vec![]).await;
        let pid = cat.products[prod_idx].id.clone();
        let pslug = cat.products[prod_idx].slug.clone();

        let key_based = cat.products[prod_idx].key_based;
        let mut matched_indices = Vec::new();
        if key_based {
            for (i, k) in keys.iter().enumerate() {
                if !k.is_used && (k.product_id == pslug || k.product_id == pid) {
                    let plan_match = match &k.plan_label {
                        Some(lbl) if !lbl.trim().is_empty() => lbl.trim() == plan.label.trim(),
                        _ => true,
                    };
                    if plan_match {
                        matched_indices.push(i);
                        if matched_indices.len() == payload.quantity as usize {
                            break;
                        }
                    }
                }
            }
            if matched_indices.len() < payload.quantity as usize {
                return Err(AppError::Conflict(format!(
                    "สต็อกคีย์แพ็กเกจ \"{}\" คงเหลือไม่พอ (เหลือ {} ชิ้น)",
                    plan.label,
                    matched_indices.len()
                )));
            }
        } else if cat.products[prod_idx].stock < payload.quantity as i64 {
            return Err(AppError::Conflict("สินค้าคงเหลือไม่เพียงพอ".into()));
        }

        let now = Utc::now().to_rfc3339();
        let order_id = format!(
            "ORD-{}-{}",
            Utc::now().format("%Y%m%d"),
            uuid_hex_8().to_uppercase()
        );

        let mut delivered_keys = Vec::new();
        if key_based {
            for idx in matched_indices {
                keys[idx].is_used = true;
                keys[idx].order_id = Some(order_id.clone());
                keys[idx].used_at = Some(now.clone());
                delivered_keys.push(keys[idx].key_value.clone());
            }
        } else {
            cat.products[prod_idx].stock -= payload.quantity as i64;
        }

        // Deduct user balance in Satang
        let new_bal_sat = bal_sat
            .checked_sub(final_sat)
            .ok_or_else(|| AppError::BadRequest("ยอดเงินคงเหลือไม่เพียงพอ".into()))?;
        users[user_idx].balance = new_bal_sat.to_thb();
        users[user_idx].updated_at = now.clone();

        // Mark coupon usage if used
        if !clean_coupon.is_empty()
            && let Some(cp) = coupons
                .iter_mut()
                .find(|c| c.code.eq_ignore_ascii_case(&clean_coupon))
        {
            cp.used_count += 1;
            *cp.used_by.entry(uid.to_string()).or_insert(0) += 1;
        }

        cat.products[prod_idx].sold += payload.quantity as i64;
        cat.products[prod_idx].updated_at = now.clone();
        enrich_products_with_keys(&mut cat.products, &keys);

        let dl_url = if cat.products[prod_idx].download_url.is_empty() {
            None
        } else {
            Some(cat.products[prod_idx].download_url.clone())
        };

        let order = OrderRecord {
            id: order_id,
            status: "delivered".to_string(),
            user_id: uid.to_string(),
            product: OrderProductSnapshot {
                slug: cat.products[prod_idx].slug.clone(),
                name: cat.products[prod_idx].name.clone(),
                tag: cat.products[prod_idx].tag.clone(),
                download_url: dl_url.clone(),
            },
            plan: OrderPlanSnapshot {
                label: plan.label.clone(),
                per: plan.per.clone(),
            },
            unit_price: unit_sat.to_thb(),
            quantity: payload.quantity,
            total: final_sat.to_thb(),
            currency: "฿".to_string(),
            contact: Some(if payload.contact.trim().is_empty() {
                users[user_idx].username.clone()
            } else {
                payload.contact.trim().to_string()
            }),
            keys_delivered: delivered_keys.clone(),
            download_url: dl_url,
            coupon_code: if clean_coupon.is_empty() {
                None
            } else {
                Some(clean_coupon)
            },
            discount_amount: discount_sat.to_thb(),
            created_at: now.clone(),
            paid_at: Some(now),
        };

        let mut orders: Vec<OrderRecord> = self.read_json("orders.json", vec![]).await;
        orders.push(order.clone());

        self.write_json("users.json", &users).await?;
        self.write_json("keys.json", &keys).await?;
        self.write_json("products.json", &cat).await?;
        self.write_json("orders.json", &orders).await?;
        self.write_json("coupons.json", &coupons).await?;

        Ok(BuyOrderResponse {
            ok: true,
            order,
            new_balance: new_bal_sat.to_thb(),
            keys: delivered_keys,
        })
    }

    pub async fn get_user_orders(&self, uid: &str) -> Vec<OrderRecord> {
        let mut orders: Vec<OrderRecord> = self.read_json("orders.json", vec![]).await;
        orders.retain(|o| o.user_id == uid);
        orders.reverse();
        orders
    }

    // --- Topup & Redeem Flows ---

    pub async fn get_user_topups(&self, uid: &str) -> Vec<TopupRecord> {
        let mut items: Vec<TopupRecord> = self.read_json("topups.json", vec![]).await;
        items.retain(|t| t.uid == uid);
        items.reverse();
        items
    }

    pub async fn create_promptpay_topup(
        &self,
        uid: &str,
        username: &str,
        amount_thb: f64,
    ) -> AppResult<TopupRecord> {
        if !amount_thb.is_finite() || amount_thb < 1.0 || amount_thb > 100_000.0 {
            return Err(AppError::BadRequest(
                "จำนวนเงินต้องอยู่ระหว่าง 1 - 100,000 บาท".into(),
            ));
        }
        let settings = self.get_settings().await;
        let pp_id = if settings.promptpay_id.trim().is_empty() {
            "0812345678".to_string()
        } else {
            settings.promptpay_id.trim().to_string()
        };

        // Add subtle unique satang (e.g. .01..0.99) when whole THB, clamped cleanly
        let cents_offset = (rand::random::<u8>() % 89 + 10) as f64 / 100.0;
        let pay_amount = (amount_thb.floor() + cents_offset * 1.0).min(100_000.99);
        let sat = Satang::from_thb(pay_amount)
            .map_err(|_| AppError::BadRequest("จำนวนเงินไม่ถูกต้อง".into()))?;
        let payload = generate_promptpay_payload(&pp_id, Some(sat));
        let qr_svg = generate_promptpay_svg_data_uri(&payload);

        let _tx = self.tx_lock.lock().await;
        let mut topups: Vec<TopupRecord> = self.read_json("topups.json", vec![]).await;
        let rec = TopupRecord {
            id: format!("TOP-PP-{}", uuid_hex_8().to_uppercase()),
            uid: uid.to_string(),
            username: username.to_string(),
            method: "promptpay".to_string(),
            channel_id: "promptpay".to_string(),
            channel_name: "PromptPay QR".to_string(),
            amount: amount_thb.floor(),
            pay_amount: Some(sat.to_thb()),
            voucher: None,
            slip_url: None,
            qr_payload: Some(payload),
            qr_svg,
            status: "pending".to_string(),
            admin_note: None,
            created_at: Utc::now().to_rfc3339(),
        };
        topups.push(rec.clone());
        self.write_json("topups.json", &topups).await?;
        Ok(rec)
    }

    pub async fn submit_bank_slip(
        &self,
        uid: &str,
        username: &str,
        payload: &BankSlipPayload,
    ) -> AppResult<TopupRecord> {
        if !payload.amount.is_finite() || payload.amount < 1.0 || payload.amount > 200_000.0 {
            return Err(AppError::BadRequest("จำนวนเงินต้องอยู่ระหว่าง 1 - 200,000 บาท".into()));
        }
        if payload.slip_url.trim().is_empty() && payload.qr_payload.trim().is_empty() {
            return Err(AppError::BadRequest(
                "กรุณาอัปโหลดรูปภาพสลิปหรือวาง QR Payload".into(),
            ));
        }
        if !is_safe_url(&payload.slip_url) {
            return Err(AppError::BadRequest("รูปแบบรูปภาพสลิปไม่ปลอดภัย".into()));
        }

        let channels: Vec<PaymentChannel> = self.read_json("payment_channels.json", vec![]).await;
        let ch_name = channels
            .iter()
            .find(|c| c.id == payload.channel_id)
            .map(|c| c.name.clone())
            .unwrap_or_else(|| "โอนผ่านธนาคาร".to_string());

        let _tx = self.tx_lock.lock().await;
        let mut topups: Vec<TopupRecord> = self.read_json("topups.json", vec![]).await;
        let rec = TopupRecord {
            id: format!("TOP-BK-{}", uuid_hex_8().to_uppercase()),
            uid: uid.to_string(),
            username: username.to_string(),
            method: "bank_slip".to_string(),
            channel_id: payload.channel_id.clone(),
            channel_name: ch_name,
            amount: payload.amount,
            pay_amount: Some(payload.amount),
            voucher: None,
            slip_url: if payload.slip_url.trim().is_empty() {
                None
            } else {
                Some(payload.slip_url.trim().to_string())
            },
            qr_payload: if payload.qr_payload.trim().is_empty() {
                None
            } else {
                Some(payload.qr_payload.trim().to_string())
            },
            qr_svg: None,
            status: "pending".to_string(),
            admin_note: None,
            created_at: Utc::now().to_rfc3339(),
        };
        topups.push(rec.clone());
        self.write_json("topups.json", &topups).await?;
        Ok(rec)
    }

    pub async fn submit_truemoney(
        &self,
        uid: &str,
        username: &str,
        link: &str,
    ) -> AppResult<TopupRecord> {
        let code = extract_truemoney_hash(link).ok_or_else(|| {
            AppError::BadRequest("ลิงก์ซองอั่งเปา TrueMoney ไม่ถูกต้อง".into())
        })?;

        let _tx = self.tx_lock.lock().await;
        let mut topups: Vec<TopupRecord> = self.read_json("topups.json", vec![]).await;
        if topups
            .iter()
            .any(|t| t.voucher.as_deref() == Some(&code))
        {
            return Err(AppError::Conflict("ซองอั่งเปานี้ถูกส่งเข้ามาแล้ว".into()));
        }

        let rec = TopupRecord {
            id: format!("TOP-TM-{}", uuid_hex_8().to_uppercase()),
            uid: uid.to_string(),
            username: username.to_string(),
            method: "truemoney".to_string(),
            channel_id: "truemoney".to_string(),
            channel_name: "ซองอั่งเปา TrueMoney".to_string(),
            amount: 0.0,
            pay_amount: None,
            voucher: Some(code),
            slip_url: None,
            qr_payload: None,
            qr_svg: None,
            status: "pending".to_string(),
            admin_note: Some("รอตรวจสอบซองอั่งเปาโดยแอดมิน".to_string()),
            created_at: Utc::now().to_rfc3339(),
        };
        topups.push(rec.clone());
        self.write_json("topups.json", &topups).await?;
        Ok(rec)
    }

    pub async fn redeem_credit_code(
        &self,
        uid: &str,
        username: &str,
        code: &str,
    ) -> AppResult<(f64, f64)> {
        let clean_code = code.trim().to_uppercase();
        if clean_code.is_empty() {
            return Err(AppError::BadRequest("กรุณากรอกโค้ดเติมเงิน".into()));
        }

        let _tx = self.tx_lock.lock().await;
        let mut coupons: Vec<CouponRecord> = self.read_json("coupons.json", vec![]).await;
        let cp_idx = coupons
            .iter()
            .position(|c| c.code.eq_ignore_ascii_case(&clean_code))
            .ok_or_else(|| AppError::NotFound("ไม่พบโค้ดเติมเงินนี้".into()))?;

        if coupons[cp_idx].coupon_type != "credit" {
            return Err(AppError::BadRequest("โค้ดนี้เป็นโค้ดส่วนลดหน้าสินค้า ไม่ใช่โค้ดเติมเครดิต".into()));
        }
        if !coupons[cp_idx].enabled {
            return Err(AppError::BadRequest("โค้ดนี้ถูกปิดใช้งานแล้ว".into()));
        }
        if let Some(max_u) = coupons[cp_idx].max_uses
            && coupons[cp_idx].used_count >= max_u
        {
            return Err(AppError::BadRequest("โค้ดนี้ถูกใช้งานครบสิทธิ์แล้ว".into()));
        }
        let user_uses = coupons[cp_idx].used_by.get(uid).copied().unwrap_or(0);
        if user_uses >= coupons[cp_idx].per_user_limit.max(1) {
            return Err(AppError::BadRequest("คุณใช้โค้ดนี้ครบสิทธิ์ต่อบัญชีแล้ว".into()));
        }
        if let Some(exp) = &coupons[cp_idx].expires_at
            && !exp.is_empty()
            && let Ok(dt) = chrono::DateTime::parse_from_rfc3339(exp)
            && dt < Utc::now()
        {
            return Err(AppError::BadRequest("โค้ดนี้หมดอายุแล้ว".into()));
        }

        let credit_sat = Satang::from_thb(coupons[cp_idx].value)
            .map_err(|_| AppError::Internal("มูลค่าโค้ดไม่ถูกต้อง".into()))?;
        if credit_sat <= Satang::ZERO {
            return Err(AppError::BadRequest("โค้ดไม่มีมูลค่าเครดิต".into()));
        }

        let mut users: Vec<UserRecord> = self.read_json("users.json", vec![]).await;
        let u_idx = users
            .iter()
            .position(|u| u.id == uid)
            .ok_or_else(|| AppError::NotFound("ไม่พบผู้ใช้".into()))?;
        let bal_sat = Satang::from_thb(users[u_idx].balance).unwrap_or(Satang::ZERO);
        let next_bal = bal_sat
            .checked_add(credit_sat)
            .ok_or_else(|| AppError::BadRequest("ยอดเงินเกินขีดจำกัด".into()))?;

        let now = Utc::now().to_rfc3339();
        users[u_idx].balance = next_bal.to_thb();
        users[u_idx].updated_at = now.clone();

        coupons[cp_idx].used_count += 1;
        *coupons[cp_idx].used_by.entry(uid.to_string()).or_insert(0) += 1;

        let mut topups: Vec<TopupRecord> = self.read_json("topups.json", vec![]).await;
        topups.push(TopupRecord {
            id: format!("TOP-CODE-{}", uuid_hex_8().to_uppercase()),
            uid: uid.to_string(),
            username: username.to_string(),
            method: "redeem_code".to_string(),
            channel_id: "coupon".to_string(),
            channel_name: format!("โค้ดอั่งเปา ({clean_code})"),
            amount: credit_sat.to_thb(),
            pay_amount: Some(credit_sat.to_thb()),
            voucher: Some(clean_code),
            slip_url: None,
            qr_payload: None,
            qr_svg: None,
            status: "approved".to_string(),
            admin_note: None,
            created_at: now,
        });

        self.write_json("users.json", &users).await?;
        self.write_json("coupons.json", &coupons).await?;
        self.write_json("topups.json", &topups).await?;
        Ok((credit_sat.to_thb(), next_bal.to_thb()))
    }

    pub async fn get_public_channels(&self) -> Vec<PaymentChannel> {
        let mut ch: Vec<PaymentChannel> = self.read_json("payment_channels.json", vec![]).await;
        ch.retain(|c| c.enabled);
        ch.sort_by_key(|c| c.sort_order);
        ch
    }

    pub async fn get_public_support_links(&self) -> Vec<SupportLink> {
        let mut links: Vec<SupportLink> = self.read_json("support_links.json", vec![]).await;
        links.retain(|l| l.enabled);
        links.sort_by_key(|l| l.sort_order);
        links
    }

    pub async fn get_public_news(&self) -> Vec<NewsItem> {
        let mut items: Vec<NewsItem> = self.read_json("news.json", vec![]).await;
        items.retain(|n| n.published);
        items.reverse();
        items
    }

    // --- Admin API Operations ---

    pub async fn get_admin_stats(&self) -> AdminStatsResponse {
        let (cat, orders, users, topups, keys) = tokio::join!(
            self.get_catalog_enriched(),
            self.read_json::<Vec<OrderRecord>>("orders.json", vec![]),
            self.read_json::<Vec<UserRecord>>("users.json", vec![]),
            self.read_json::<Vec<TopupRecord>>("topups.json", vec![]),
            self.read_json::<Vec<ProductKey>>("keys.json", vec![]),
        );

        let bkk = FixedOffset::east_opt(7 * 3600).unwrap();
        let now_bkk = Utc::now().with_timezone(&bkk);
        let today_str = now_bkk.format("%Y-%m-%d").to_string();
        let month_str = format!("{:04}-{:02}", now_bkk.year(), now_bkk.month());

        let mut rev_today = Satang::ZERO;
        let mut rev_month = Satang::ZERO;
        let mut rev_total = Satang::ZERO;
        let mut paid_count = 0usize;

        for o in &orders {
            if o.status == "paid" || o.status == "delivered" {
                paid_count += 1;
                let amt = Satang::from_thb(o.total).unwrap_or(Satang::ZERO);
                rev_total = rev_total.checked_add(amt).unwrap_or(rev_total);
                if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(&o.created_at) {
                    let b = dt.with_timezone(&bkk);
                    let d = b.format("%Y-%m-%d").to_string();
                    let m = format!("{:04}-{:02}", b.year(), b.month());
                    if d == today_str {
                        rev_today = rev_today.checked_add(amt).unwrap_or(rev_today);
                    }
                    if m == month_str {
                        rev_month = rev_month.checked_add(amt).unwrap_or(rev_month);
                    }
                }
            }
        }

        let topups_pending = topups.iter().filter(|t| t.status == "pending").count();
        let keys_remain = keys.iter().filter(|k| !k.is_used).count();

        let mut recent_orders = orders;
        recent_orders.reverse();
        recent_orders.truncate(10);

        let product_stock = cat
            .products
            .iter()
            .map(|p| {
                let unused = keys
                    .iter()
                    .filter(|k| !k.is_used && (k.product_id == p.slug || k.product_id == p.id))
                    .count();
                ProductStockRow {
                    slug: p.slug.clone(),
                    name: p.name.clone(),
                    stock: p.stock,
                    sold: p.sold,
                    unused_keys: unused,
                }
            })
            .collect();

        AdminStatsResponse {
            rev_today: rev_today.to_thb(),
            rev_month: rev_month.to_thb(),
            rev_total: rev_total.to_thb(),
            orders_paid: paid_count,
            total_users: users.len(),
            topups_pending,
            keys_remain,
            recent_orders,
            product_stock,
            db_driver: self.db_driver.clone(),
        }
    }

    pub async fn admin_upsert_product(
        &self,
        payload: &AdminCreateProductPayload,
    ) -> AppResult<Product> {
        let slug = payload.slug.trim().to_lowercase();
        if !is_valid_product_slug(&slug) {
            return Err(AppError::BadRequest("Slug สินค้าไม่ถูกต้อง (a-z, 0-9, -, _)".into()));
        }
        if payload.name.trim().is_empty() {
            return Err(AppError::BadRequest("กรุณาระบุชื่อสินค้า".into()));
        }
        if payload.plans.is_empty() {
            return Err(AppError::BadRequest("ต้องมีอย่างน้อย 1 แพ็กเกจราคา".into()));
        }
        if !is_safe_url(&payload.img) || !is_safe_url(&payload.download_url) {
            return Err(AppError::BadRequest("URL รูปภาพหรือดาวน์โหลดไม่ปลอดภัย".into()));
        }

        let min_price = payload
            .plans
            .iter()
            .map(|p| p.price.max(0.0))
            .fold(f64::INFINITY, f64::min);

        let _tx = self.tx_lock.lock().await;
        let mut cat: CatalogFile = self
            .read_json(
                "products.json",
                CatalogFile {
                    store: "XENARY".into(),
                    currency: "THB".into(),
                    currency_symbol: "฿".into(),
                    updated_at: String::new(),
                    products: vec![],
                },
            )
            .await;

        let now = Utc::now().to_rfc3339();
        let existing_sold = cat
            .products
            .iter()
            .find(|p| p.slug == slug)
            .map(|p| p.sold)
            .unwrap_or(0);

        let prod = Product {
            slug: slug.clone(),
            id: slug.clone(),
            channel: slug.clone(),
            name: payload.name.trim().to_string(),
            tag: if payload.tag.trim().is_empty() {
                "General".to_string()
            } else {
                payload.tag.trim().to_string()
            },
            desc: payload.desc.trim().to_string(),
            stock: 0,
            sold: existing_sold,
            best_seller: payload.best_seller,
            featured: payload.featured,
            key_based: payload.key_based,
            img: if payload.img.trim().is_empty() {
                "/assets/img/hero.jpg".to_string()
            } else {
                payload.img.trim().to_string()
            },
            plans: payload.plans.clone(),
            download_url: payload.download_url.trim().to_string(),
            tutorial_video: payload.tutorial_video.trim().to_string(),
            unused_keys: 0,
            from: if min_price.is_finite() { min_price } else { 0.0 },
            updating: payload.updating,
            status_mode: if payload.updating {
                "updating".to_string()
            } else {
                "normal".to_string()
            },
            update_note: payload.update_note.trim().to_string(),
            updated_at: now.clone(),
        };

        if let Some(idx) = cat.products.iter().position(|p| p.slug == slug) {
            cat.products[idx] = prod;
        } else {
            cat.products.push(prod);
        }
        let keys: Vec<ProductKey> = self.read_json("keys.json", vec![]).await;
        enrich_products_with_keys(&mut cat.products, &keys);
        cat.updated_at = now;
        self.write_json("products.json", &cat).await?;

        cat.products
            .into_iter()
            .find(|p| p.slug == slug)
            .ok_or_else(|| AppError::Internal("บันทึกสินค้าไม่สำเร็จ".into()))
    }

    pub async fn admin_delete_product(&self, slug: &str) -> AppResult<()> {
        let _tx = self.tx_lock.lock().await;
        let mut cat: CatalogFile = self
            .read_json(
                "products.json",
                CatalogFile {
                    store: "XENARY".into(),
                    currency: "THB".into(),
                    currency_symbol: "฿".into(),
                    updated_at: String::new(),
                    products: vec![],
                },
            )
            .await;
        let before = cat.products.len();
        cat.products.retain(|p| p.slug != slug);
        if cat.products.len() == before {
            return Err(AppError::NotFound("ไม่พบสินค้านี้".into()));
        }
        self.write_json("products.json", &cat).await?;
        Ok(())
    }

    pub async fn admin_list_keys(&self, product_id: Option<&str>) -> Vec<ProductKey> {
        let mut keys: Vec<ProductKey> = self.read_json("keys.json", vec![]).await;
        if let Some(pid) = product_id.filter(|s| !s.trim().is_empty()) {
            keys.retain(|k| k.product_id == pid);
        }
        keys.reverse();
        keys
    }

    pub async fn admin_add_keys(&self, payload: &AdminAddKeysPayload) -> AppResult<usize> {
        let pid = payload.product_id.trim();
        if pid.is_empty() {
            return Err(AppError::BadRequest("กรุณาเลือกสินค้า".into()));
        }
        let lines: Vec<String> = payload
            .keys_text
            .lines()
            .map(|l| l.trim().to_string())
            .filter(|l| !l.is_empty())
            .collect();
        if lines.is_empty() {
            return Err(AppError::BadRequest("กรุณากรอกคีย์อย่างน้อย 1 บรรทัด".into()));
        }

        let _tx = self.tx_lock.lock().await;
        let mut keys: Vec<ProductKey> = self.read_json("keys.json", vec![]).await;
        let now = Utc::now().to_rfc3339();
        let plan_opt = if payload.plan_label.trim().is_empty() {
            None
        } else {
            Some(payload.plan_label.trim().to_string())
        };
        let count = lines.len();
        for kv in lines {
            keys.push(ProductKey {
                id: format!("key_{}", uuid_hex_8()),
                product_id: pid.to_string(),
                plan_label: plan_opt.clone(),
                key_value: kv,
                is_used: false,
                order_id: None,
                created_at: now.clone(),
                used_at: None,
            });
        }
        self.write_json("keys.json", &keys).await?;

        let mut cat: CatalogFile = self
            .read_json(
                "products.json",
                CatalogFile {
                    store: "XENARY".into(),
                    currency: "THB".into(),
                    currency_symbol: "฿".into(),
                    updated_at: String::new(),
                    products: vec![],
                },
            )
            .await;
        enrich_products_with_keys(&mut cat.products, &keys);
        cat.updated_at = now;
        self.write_json("products.json", &cat).await?;

        Ok(count)
    }

    pub async fn admin_delete_key(&self, key_id: &str) -> AppResult<()> {
        let _tx = self.tx_lock.lock().await;
        let mut keys: Vec<ProductKey> = self.read_json("keys.json", vec![]).await;
        let before = keys.len();
        keys.retain(|k| !(k.id == key_id && !k.is_used));
        if keys.len() == before {
            return Err(AppError::BadRequest(
                "ไม่พบคีย์หรือคีย์ถูกใช้งานแล้ว (ลบไม่ได้)".into(),
            ));
        }
        self.write_json("keys.json", &keys).await?;
        Ok(())
    }

    pub async fn admin_list_orders(&self) -> Vec<OrderRecord> {
        let mut orders: Vec<OrderRecord> = self.read_json("orders.json", vec![]).await;
        orders.reverse();
        orders
    }

    pub async fn admin_list_topups(&self) -> Vec<TopupRecord> {
        let mut topups: Vec<TopupRecord> = self.read_json("topups.json", vec![]).await;
        topups.reverse();
        topups
    }

    pub async fn admin_review_topup(
        &self,
        topup_id: &str,
        approve: bool,
        credit_amount: Option<f64>,
    ) -> AppResult<TopupRecord> {
        let _tx = self.tx_lock.lock().await;
        let mut topups: Vec<TopupRecord> = self.read_json("topups.json", vec![]).await;
        let idx = topups
            .iter()
            .position(|t| t.id == topup_id)
            .ok_or_else(|| AppError::NotFound("ไม่พบรายการเติมเงิน".into()))?;
        if topups[idx].status != "pending" {
            return Err(AppError::Conflict("รายการนี้ถูกดำเนินการไปแล้ว".into()));
        }

        if approve {
            let amt = credit_amount.unwrap_or(topups[idx].amount);
            let add_sat = Satang::from_thb(amt)
                .map_err(|_| AppError::BadRequest("จำนวนเงินไม่ถูกต้อง".into()))?;
            if add_sat <= Satang::ZERO {
                return Err(AppError::BadRequest("กรุณาระบุยอดเงินอนุมัติ > 0".into()));
            }
            let mut users: Vec<UserRecord> = self.read_json("users.json", vec![]).await;
            let u_idx = users
                .iter()
                .position(|u| u.id == topups[idx].uid)
                .ok_or_else(|| AppError::NotFound("ไม่พบเจ้าของรายการ".into()))?;
            let bal_sat = Satang::from_thb(users[u_idx].balance).unwrap_or(Satang::ZERO);
            let next_bal = bal_sat
                .checked_add(add_sat)
                .ok_or_else(|| AppError::BadRequest("ยอดเงินเกินขีดจำกัด".into()))?;
            users[u_idx].balance = next_bal.to_thb();
            users[u_idx].updated_at = Utc::now().to_rfc3339();
            self.write_json("users.json", &users).await?;

            topups[idx].amount = add_sat.to_thb();
            topups[idx].status = "approved".to_string();
        } else {
            topups[idx].status = "rejected".to_string();
        }

        let updated = topups[idx].clone();
        self.write_json("topups.json", &topups).await?;
        Ok(updated)
    }

    pub async fn admin_list_users(&self) -> Vec<UserPublic> {
        let users: Vec<UserRecord> = self.read_json("users.json", vec![]).await;
        users.iter().map(UserPublic::from).collect()
    }

    pub async fn admin_adjust_balance(
        &self,
        uid: &str,
        mode: &str,
        amount: f64,
    ) -> AppResult<UserPublic> {
        let amt_sat = Satang::from_thb(amount)
            .map_err(|_| AppError::BadRequest("จำนวนเงินไม่ถูกต้อง".into()))?;
        let _tx = self.tx_lock.lock().await;
        let mut users: Vec<UserRecord> = self.read_json("users.json", vec![]).await;
        let u = users
            .iter_mut()
            .find(|u| u.id == uid)
            .ok_or_else(|| AppError::NotFound("ไม่พบผู้ใช้".into()))?;

        let cur = Satang::from_thb(u.balance).unwrap_or(Satang::ZERO);
        let next = match mode {
            "add" => cur
                .checked_add(amt_sat)
                .ok_or_else(|| AppError::BadRequest("ยอดเงินเกินขีดจำกัด".into()))?,
            "sub" => cur.checked_sub(amt_sat).unwrap_or(Satang::ZERO),
            "set" => amt_sat,
            _ => return Err(AppError::BadRequest("โหมดปรับยอดเงินไม่ถูกต้อง".into())),
        };
        u.balance = next.to_thb();
        u.updated_at = Utc::now().to_rfc3339();
        let pub_u = UserPublic::from(&*u);
        self.write_json("users.json", &users).await?;
        Ok(pub_u)
    }

    pub async fn admin_set_user_role(&self, uid: &str, role: &str) -> AppResult<UserPublic> {
        if role != "admin" && role != "user" {
            return Err(AppError::BadRequest("บทบาทต้องเป็น admin หรือ user".into()));
        }
        let _tx = self.tx_lock.lock().await;
        let mut users: Vec<UserRecord> = self.read_json("users.json", vec![]).await;
        let u = users
            .iter_mut()
            .find(|u| u.id == uid)
            .ok_or_else(|| AppError::NotFound("ไม่พบผู้ใช้".into()))?;
        u.role = role.to_string();
        u.updated_at = Utc::now().to_rfc3339();
        let pub_u = UserPublic::from(&*u);
        self.write_json("users.json", &users).await?;
        Ok(pub_u)
    }

    pub async fn admin_toggle_ban(&self, uid: &str, banned: bool) -> AppResult<UserPublic> {
        let _tx = self.tx_lock.lock().await;
        let mut users: Vec<UserRecord> = self.read_json("users.json", vec![]).await;
        let u = users
            .iter_mut()
            .find(|u| u.id == uid)
            .ok_or_else(|| AppError::NotFound("ไม่พบผู้ใช้".into()))?;
        u.banned = banned;
        u.ban_reason = if banned {
            Some("ระงับโดยผู้ดูแลระบบ".to_string())
        } else {
            None
        };
        u.updated_at = Utc::now().to_rfc3339();
        let pub_u = UserPublic::from(&*u);
        self.write_json("users.json", &users).await?;
        Ok(pub_u)
    }

    pub async fn admin_list_coupons(&self) -> Vec<CouponRecord> {
        let mut items: Vec<CouponRecord> = self.read_json("coupons.json", vec![]).await;
        items.reverse();
        items
    }

    pub async fn admin_create_coupon(
        &self,
        payload: &AdminCreateCouponPayload,
    ) -> AppResult<CouponRecord> {
        let code = payload.code.trim().to_uppercase();
        if code.len() < 2 || code.len() > 40 {
            return Err(AppError::BadRequest("รหัสคูปองต้องยาว 2-40 ตัวอักษร".into()));
        }
        if !payload.value.is_finite() || payload.value <= 0.0 {
            return Err(AppError::BadRequest("มูลค่าคูปองต้องมากกว่า 0".into()));
        }

        let _tx = self.tx_lock.lock().await;
        let mut items: Vec<CouponRecord> = self.read_json("coupons.json", vec![]).await;
        if items.iter().any(|c| c.code.eq_ignore_ascii_case(&code)) {
            return Err(AppError::Conflict("มีโค้ดคูปองนี้อยู่แล้ว".into()));
        }

        let rec = CouponRecord {
            id: format!("cp_{}", uuid_hex_8()),
            code,
            coupon_type: if payload.coupon_type == "credit" {
                "credit".to_string()
            } else {
                "discount".to_string()
            },
            discount_mode: if payload.discount_mode == "percent" {
                "percent".to_string()
            } else {
                "fixed".to_string()
            },
            value: payload.value,
            min_spend: payload.min_spend.max(0.0),
            max_uses: payload.max_uses.filter(|v| *v > 0),
            used_count: 0,
            per_user_limit: payload.per_user_limit.max(1),
            expires_at: payload.expires_at.clone().filter(|s| !s.trim().is_empty()),
            used_by: HashMap::new(),
            note: payload.note.trim().to_string(),
            enabled: true,
            created_at: Utc::now().to_rfc3339(),
        };
        items.push(rec.clone());
        self.write_json("coupons.json", &items).await?;
        Ok(rec)
    }

    pub async fn admin_delete_coupon(&self, id: &str) -> AppResult<()> {
        let _tx = self.tx_lock.lock().await;
        let mut items: Vec<CouponRecord> = self.read_json("coupons.json", vec![]).await;
        items.retain(|c| c.id != id);
        self.write_json("coupons.json", &items).await?;
        Ok(())
    }

    pub async fn admin_list_channels(&self) -> Vec<PaymentChannel> {
        self.read_json("payment_channels.json", vec![]).await
    }

    pub async fn admin_create_channel(
        &self,
        payload: &AdminCreateChannelPayload,
    ) -> AppResult<PaymentChannel> {
        if payload.name.trim().is_empty() || payload.account_no.trim().is_empty() {
            return Err(AppError::BadRequest("กรุณากรอกชื่อช่องทางและเลขบัญชี".into()));
        }
        let _tx = self.tx_lock.lock().await;
        let mut items: Vec<PaymentChannel> = self.read_json("payment_channels.json", vec![]).await;
        let rec = PaymentChannel {
            id: format!("ch_{}", uuid_hex_8()),
            name: payload.name.trim().to_string(),
            channel_type: payload.channel_type.clone(),
            account_no: payload.account_no.trim().to_string(),
            account_name: payload.account_name.trim().to_string(),
            bank_name: payload.bank_name.trim().to_string(),
            qr_img: payload.qr_img.trim().to_string(),
            enabled: true,
            sort_order: (items.len() as i32) + 1,
            created_at: Utc::now().to_rfc3339(),
        };
        items.push(rec.clone());
        self.write_json("payment_channels.json", &items).await?;
        Ok(rec)
    }

    pub async fn admin_delete_channel(&self, id: &str) -> AppResult<()> {
        let _tx = self.tx_lock.lock().await;
        let mut items: Vec<PaymentChannel> = self.read_json("payment_channels.json", vec![]).await;
        items.retain(|c| c.id != id);
        self.write_json("payment_channels.json", &items).await?;
        Ok(())
    }

    pub async fn admin_list_news(&self) -> Vec<NewsItem> {
        let mut items: Vec<NewsItem> = self.read_json("news.json", vec![]).await;
        items.reverse();
        items
    }

    pub async fn admin_create_news(&self, payload: &AdminCreateNewsPayload) -> AppResult<NewsItem> {
        if payload.title.trim().is_empty() {
            return Err(AppError::BadRequest("กรุณาระบุหัวข้อข่าว".into()));
        }
        if !is_safe_url(&payload.image_url) {
            return Err(AppError::BadRequest("URL รูปภาพไม่ปลอดภัย".into()));
        }
        let _tx = self.tx_lock.lock().await;
        let mut items: Vec<NewsItem> = self.read_json("news.json", vec![]).await;
        let now = Utc::now().to_rfc3339();
        let rec = NewsItem {
            id: format!("news_{}", uuid_hex_8()),
            title: payload.title.trim().to_string(),
            content: payload.content.trim().to_string(),
            image_url: payload.image_url.trim().to_string(),
            published: true,
            created_at: now.clone(),
            updated_at: now,
        };
        items.push(rec.clone());
        self.write_json("news.json", &items).await?;
        Ok(rec)
    }

    pub async fn admin_delete_news(&self, id: &str) -> AppResult<()> {
        let _tx = self.tx_lock.lock().await;
        let mut items: Vec<NewsItem> = self.read_json("news.json", vec![]).await;
        items.retain(|n| n.id != id);
        self.write_json("news.json", &items).await?;
        Ok(())
    }

    pub async fn admin_list_support(&self) -> Vec<SupportLink> {
        self.read_json("support_links.json", vec![]).await
    }

    pub async fn admin_create_support(
        &self,
        payload: &AdminCreateSupportPayload,
    ) -> AppResult<SupportLink> {
        if payload.label.trim().is_empty() || payload.url.trim().is_empty() {
            return Err(AppError::BadRequest("กรุณาระบุชื่อช่องทางและลิงก์".into()));
        }
        if !is_safe_url(&payload.url) {
            return Err(AppError::BadRequest("ลิงก์ไม่ปลอดภัย".into()));
        }
        let _tx = self.tx_lock.lock().await;
        let mut items: Vec<SupportLink> = self.read_json("support_links.json", vec![]).await;
        let rec = SupportLink {
            id: format!("sup_{}", uuid_hex_8()),
            platform: payload.platform.trim().to_string(),
            label: payload.label.trim().to_string(),
            handle: payload.handle.trim().to_string(),
            url: payload.url.trim().to_string(),
            badge: if payload.badge.trim().is_empty() {
                "ออนไลน์ 24 ชม.".to_string()
            } else {
                payload.badge.trim().to_string()
            },
            description: payload.description.trim().to_string(),
            enabled: true,
            sort_order: (items.len() as i32) + 1,
            created_at: Utc::now().to_rfc3339(),
        };
        items.push(rec.clone());
        self.write_json("support_links.json", &items).await?;
        Ok(rec)
    }

    pub async fn admin_delete_support(&self, id: &str) -> AppResult<()> {
        let _tx = self.tx_lock.lock().await;
        let mut items: Vec<SupportLink> = self.read_json("support_links.json", vec![]).await;
        items.retain(|s| s.id != id);
        self.write_json("support_links.json", &items).await?;
        Ok(())
    }
}

pub fn evaluate_coupon(
    coupons: &[CouponRecord],
    code: &str,
    subtotal: Satang,
    uid: Option<&str>,
) -> AppResult<Satang> {
    let cp = coupons
        .iter()
        .find(|c| c.code.eq_ignore_ascii_case(code))
        .ok_or_else(|| AppError::NotFound("ไม่พบโค้ดส่วนลดนี้".into()))?;
    if cp.coupon_type != "discount" {
        return Err(AppError::BadRequest("โค้ดนี้เป็นโค้ดเติมเครดิต กรุณาใช้ที่หน้าเติมเงิน".into()));
    }
    if !cp.enabled {
        return Err(AppError::BadRequest("โค้ดส่วนลดนี้ถูกปิดใช้งานแล้ว".into()));
    }
    if let Some(max_u) = cp.max_uses
        && cp.used_count >= max_u
    {
        return Err(AppError::BadRequest("โค้ดส่วนลดถูกใช้ครบจำนวนแล้ว".into()));
    }
    if let Some(u) = uid {
        let used_by_u = cp.used_by.get(u).copied().unwrap_or(0);
        if used_by_u >= cp.per_user_limit.max(1) {
            return Err(AppError::BadRequest("คุณใช้โค้ดส่วนลดนี้ครบสิทธิ์แล้ว".into()));
        }
    }
    if let Some(exp) = &cp.expires_at
        && !exp.is_empty()
        && let Ok(dt) = chrono::DateTime::parse_from_rfc3339(exp)
        && dt < Utc::now()
    {
        return Err(AppError::BadRequest("โค้ดส่วนลดหมดอายุแล้ว".into()));
    }
    let min_sat = Satang::from_thb(cp.min_spend).unwrap_or(Satang::ZERO);
    if subtotal < min_sat {
        return Err(AppError::BadRequest(format!(
            "ต้องมียอดสั่งซื้อขั้นต่ำ ฿{:.2}",
            min_sat.to_thb()
        )));
    }

    let discount_sat = if cp.discount_mode == "percent" {
        let pct = cp.value.clamp(0.0, 100.0);
        let d = ((subtotal.0 as f64) * (pct / 100.0)).round() as i64;
        Satang(d.min(subtotal.0))
    } else {
        let raw = Satang::from_thb(cp.value).unwrap_or(Satang::ZERO);
        Satang(raw.0.min(subtotal.0))
    };

    Ok(discount_sat)
}

pub fn enrich_products_with_keys(products: &mut [Product], keys: &[ProductKey]) {
    for p in products.iter_mut() {
        let mut min_price = f64::INFINITY;
        for pl in &p.plans {
            if pl.price < min_price {
                min_price = pl.price;
            }
        }
        if min_price.is_finite() {
            p.from = min_price;
        }
        if !p.key_based {
            continue;
        }
        let unused_for_product: Vec<&ProductKey> = keys
            .iter()
            .filter(|k| !k.is_used && (k.product_id == p.slug || k.product_id == p.id))
            .collect();
        let total_unused = unused_for_product.len() as i64;
        let wildcards = unused_for_product
            .iter()
            .filter(|k| k.plan_label.as_deref().unwrap_or("").trim().is_empty())
            .count() as i64;

        for pl in &mut p.plans {
            let exact = unused_for_product
                .iter()
                .filter(|k| k.plan_label.as_deref().unwrap_or("").trim() == pl.label.trim())
                .count() as i64;
            let count = exact + wildcards;
            pl.stock = Some(count);
            pl.plan_keys = Some(count);
        }

        p.unused_keys = total_unused;
        p.stock = total_unused;
    }
}

fn build_recent_orders(
    orders: &[OrderRecord],
    products: &[Product],
    users: &[UserRecord],
    limit: usize,
) -> Vec<PublicRecentOrder> {
    let img_map: HashMap<&str, &str> = products
        .iter()
        .map(|p| (p.slug.as_str(), p.img.as_str()))
        .collect();
    let user_map: HashMap<&str, &str> = users
        .iter()
        .map(|u| (u.id.as_str(), u.username.as_str()))
        .collect();

    orders
        .iter()
        .rev()
        .filter(|o| o.status == "delivered" || o.status == "paid")
        .take(limit)
        .map(|o| {
            let raw_buyer = o
                .contact
                .as_deref()
                .filter(|s| !s.trim().is_empty())
                .or_else(|| user_map.get(o.user_id.as_str()).copied())
                .unwrap_or("guest");
            let img = img_map
                .get(o.product.slug.as_str())
                .copied()
                .unwrap_or("/assets/img/hero.jpg");
            PublicRecentOrder {
                id: o.id.clone(),
                buyer: mask_buyer_name(raw_buyer),
                product_slug: o.product.slug.clone(),
                product_name: o.product.name.clone(),
                product_img: img.to_string(),
                plan_label: o.plan.label.clone(),
                total: o.total,
                created_at: o.created_at.clone(),
            }
        })
        .collect()
}

fn resolve_postgres_url() -> Option<String> {
    let driver = std::env::var("DB_DRIVER")
        .unwrap_or_default()
        .trim()
        .to_lowercase();
    if driver == "json" {
        return None;
    }
    if let Ok(url) = std::env::var("DATABASE_URL") {
        let u = url.trim().to_string();
        if !u.is_empty() {
            return Some(u);
        }
    }
    let host = std::env::var("PGHOST").unwrap_or_default().trim().to_string();
    let user = std::env::var("PGUSER").unwrap_or_default().trim().to_string();
    let db = std::env::var("PGDATABASE").unwrap_or_default().trim().to_string();
    let pass = std::env::var("PGPASSWORD").unwrap_or_default().trim().to_string();
    let port = std::env::var("PGPORT")
        .ok()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| "5432".to_string());

    if !host.is_empty() && !user.is_empty() && !db.is_empty() {
        return Some(format!("postgres://{user}:{pass}@{host}:{port}/{db}"));
    }
    None
}

async fn bootstrap_postgres_schema(pool: &PgPool) -> Result<(), sqlx::Error> {
    let schema_path = Path::new("supabase/schema.sql");
    if let Ok(sql) = tokio::fs::read_to_string(schema_path).await {
        sqlx::raw_sql(&sql).execute(pool).await?;
    }
    Ok(())
}

fn uuid_hex_8() -> String {
    format!("{:08x}", rand::random::<u32>())
}

fn uuid_hex_12() -> String {
    format!("{:08x}{:04x}", rand::random::<u32>(), rand::random::<u16>())
}

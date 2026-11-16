use std::collections::HashMap;
use std::path::PathBuf;

use crate::db::{StoreRepo, enrich_products_with_keys, evaluate_coupon};
use crate::models::{BuyOrderPayload, CouponRecord, Product, ProductKey, ProductPlan};
use crate::security::{
    BoundedRateLimiter, Satang, extract_truemoney_hash, generate_promptpay_payload,
    generate_promptpay_svg_data_uri, hash_password_argon2, is_safe_url, mask_buyer_name,
    sign_session_jwt, timing_safe_str_equal, validate_username, verify_password, verify_session_jwt,
};

#[test]
fn satang_financial_precision_eliminates_float_bugs() {
    let a = Satang::from_thb(0.1).unwrap();
    let b = Satang::from_thb(0.2).unwrap();
    let sum = a.checked_add(b).unwrap();
    assert_eq!(sum.0, 30);
    assert!((sum.to_thb() - 0.30).abs() < 1e-9);
    assert!(Satang::from_thb(-5.0).is_err());
    assert!(Satang::from_thb(f64::NAN).is_err());
    assert!(a.checked_sub(Satang::from_thb(1.0).unwrap()).is_none());
}

#[test]
fn argon2_and_legacy_scrypt_password_verification() {
    let hash = hash_password_argon2("StrongPass123!").expect("argon2 hash");
    assert!(hash.starts_with("$argon2"));
    assert!(verify_password("StrongPass123!", &hash));
    assert!(!verify_password("WrongPass!", &hash));
    assert!(!verify_password("any", "invalid-format"));
}

#[test]
fn jwt_session_sign_and_verify() {
    let secret = "test-jwt-secret-key";
    let token = sign_session_jwt("U12345", "admin", "sid_1", 3600, secret).unwrap();
    let claims = verify_session_jwt(&token, secret).expect("valid token");
    assert_eq!(claims.sub, "U12345");
    assert_eq!(claims.role, "admin");
    assert!(verify_session_jwt(&token, "wrong-secret").is_none());
}

#[test]
fn security_validators_and_promptpay_svg() {
    assert!(validate_username("xenary_01"));
    assert!(!validate_username("ab"));
    assert!(!validate_username("bad user!"));
    assert!(timing_safe_str_equal("secret-abc", "secret-abc"));
    assert!(!timing_safe_str_equal("secret-abc", "secret-xyz"));
    assert!(!is_safe_url("javascript:alert(1)"));
    assert!(!is_safe_url("//evil.com/x.png"));
    assert!(is_safe_url("/assets/img/hero.jpg"));
    assert_eq!(mask_buyer_name("txz_nakp"), "คุณ txz****");
    assert_eq!(
        extract_truemoney_hash("https://gift.truemoney.com/campaign/?v=abcDEF123456"),
        Some("abcDEF123456".to_string())
    );

    let payload = generate_promptpay_payload("0812345678", Some(Satang::from_thb(59.0).unwrap()));
    assert!(payload.starts_with("000201"));
    assert!(payload.contains("5303764"));
    let svg = generate_promptpay_svg_data_uri(&payload).expect("qr svg");
    assert!(svg.starts_with("data:image/svg+xml;charset=utf-8,"));
}

#[test]
fn coupon_discount_evaluation_enforces_limits() {
    let mut used_by = HashMap::new();
    used_by.insert("U_USED".to_string(), 1);
    let coupons = vec![
        CouponRecord {
            id: "c1".into(),
            code: "SAVE20".into(),
            coupon_type: "discount".into(),
            discount_mode: "percent".into(),
            value: 20.0,
            min_spend: 50.0,
            max_uses: Some(10),
            used_count: 1,
            per_user_limit: 1,
            expires_at: None,
            used_by,
            note: String::new(),
            enabled: true,
            created_at: String::new(),
        },
        CouponRecord {
            id: "c2".into(),
            code: "FREE50".into(),
            coupon_type: "credit".into(),
            discount_mode: "fixed".into(),
            value: 50.0,
            min_spend: 0.0,
            max_uses: None,
            used_count: 0,
            per_user_limit: 1,
            expires_at: None,
            used_by: HashMap::new(),
            note: String::new(),
            enabled: true,
            created_at: String::new(),
        },
    ];

    let disc = evaluate_coupon(&coupons, "SAVE20", Satang::from_thb(100.0).unwrap(), Some("U_NEW")).unwrap();
    assert_eq!(disc.0, 2000); // 20.00 THB
    assert!(evaluate_coupon(&coupons, "SAVE20", Satang::from_thb(10.0).unwrap(), Some("U_NEW")).is_err());
    assert!(evaluate_coupon(&coupons, "SAVE20", Satang::from_thb(100.0).unwrap(), Some("U_USED")).is_err());
    assert!(evaluate_coupon(&coupons, "FREE50", Satang::from_thb(100.0).unwrap(), Some("U_NEW")).is_err());
}

#[test]
fn key_stock_enrichment_computes_per_plan_availability() {
    let mut products = vec![Product {
        slug: "aim-color".into(),
        id: "aim-color".into(),
        channel: "aim-color".into(),
        name: "Aim color".into(),
        tag: "Valorant".into(),
        desc: String::new(),
        stock: 0,
        sold: 0,
        best_seller: true,
        featured: true,
        key_based: true,
        img: "/assets/img/hero.jpg".into(),
        plans: vec![
            ProductPlan { label: "1 วัน".into(), price: 59.0, per: String::new(), stock: None, plan_keys: None },
            ProductPlan { label: "7 วัน".into(), price: 159.0, per: String::new(), stock: None, plan_keys: None },
        ],
        download_url: String::new(),
        tutorial_video: String::new(),
        unused_keys: 0,
        from: 0.0,
        updating: false,
        status_mode: "normal".into(),
        update_note: String::new(),
        updated_at: String::new(),
    }];
    let keys = vec![
        ProductKey { id: "k1".into(), product_id: "aim-color".into(), plan_label: Some("1 วัน".into()), key_value: "A1".into(), is_used: false, order_id: None, created_at: String::new(), used_at: None },
        ProductKey { id: "k2".into(), product_id: "aim-color".into(), plan_label: Some("1 วัน".into()), key_value: "A2".into(), is_used: true, order_id: Some("ORD-1".into()), created_at: String::new(), used_at: None },
    ];
    enrich_products_with_keys(&mut products, &keys);
    assert_eq!(products[0].stock, 1);
    assert_eq!(products[0].plans[0].stock, Some(1));
    assert_eq!(products[0].plans[1].stock, Some(0));
    assert_eq!(products[0].from, 59.0);
}

#[test]
fn bounded_rate_limiter_enforces_window() {
    let rl = BoundedRateLimiter::new(100);
    assert!(rl.check("ip:1", 2, 60_000));
    assert!(rl.check("ip:1", 2, 60_000));
    assert!(!rl.check("ip:1", 2, 60_000));
}

#[tokio::test]
async fn atomic_order_flow_in_isolated_temp_dir() {
    let tmp = std::env::temp_dir().join(format!("xenary_test_{}", rand::random::<u32>()));
    std::fs::create_dir_all(&tmp).unwrap();
    // Copy seed products and keys
    std::fs::copy("src/data/products.json", tmp.join("products.json")).unwrap();
    std::fs::copy("src/data/keys.json", tmp.join("keys.json")).unwrap();
    std::fs::write(tmp.join("users.json"), "[]").unwrap();
    std::fs::write(tmp.join("orders.json"), "[]").unwrap();
    std::fs::write(tmp.join("coupons.json"), "[]").unwrap();

    let repo = StoreRepo::init(PathBuf::from(&tmp)).await;
    let user = repo.register_user("buyer_rust", "RustSecure99").await.unwrap();
    // Attempting purchase with 0 balance fails
    let err = repo.place_order(&user.id, &BuyOrderPayload {
        slug: "aim-color".into(),
        plan_label: "1 วัน".into(),
        quantity: 1,
        coupon_code: String::new(),
        contact: String::new(),
    }).await;
    assert!(err.is_err());

    // Add 100 THB balance then buy 1x Aim color (1 วัน = 59 THB)
    repo.admin_adjust_balance(&user.id, "add", 100.0).await.unwrap();
    let res = repo.place_order(&user.id, &BuyOrderPayload {
        slug: "aim-color".into(),
        plan_label: "1 วัน".into(),
        quantity: 1,
        coupon_code: String::new(),
        contact: String::new(),
    }).await.unwrap();
    assert_eq!(res.keys.len(), 1);
    assert!((res.new_balance - 41.0).abs() < 1e-6);

    let _ = std::fs::remove_dir_all(&tmp);
}

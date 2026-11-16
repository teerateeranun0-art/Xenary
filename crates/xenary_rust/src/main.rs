use xenary_rust::{generate_promptpay_payload, Satang, XenaryEngine, UserAccount};

fn main() {
    println!("=== XENARY STORE - Rust Core Engine v1.0.0 ===");
    let engine = XenaryEngine::new();
    let sample_user = UserAccount {
        id: "U_ADMIN_01".to_string(),
        username: "system_admin".to_string(),
        balance: Satang::from_thb(10000.0).unwrap(),
        is_banned: false,
        role: "admin".to_string(),
    };
    engine.insert_user(sample_user);
    println!("Safe memory engine initialized. Balance: ฿{:.2}", engine.get_user_balance("U_ADMIN_01").unwrap().to_thb());

    let payload = generate_promptpay_payload("0812345678", Some(Satang::from_thb(150.0).unwrap()));
    println!("PromptPay EMVCo Test Payload: {}", payload);
}

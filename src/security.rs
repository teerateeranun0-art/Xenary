use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use argon2::{
    Argon2,
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString, rand_core::OsRng},
};
use jsonwebtoken::{Algorithm, DecodingKey, EncodingKey, Header, Validation, decode, encode};
use qrcode::{QrCode, render::svg};
use scrypt::{Params as ScryptParams, scrypt};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

pub use xenary_rust::{
    Satang, escape_html, generate_promptpay_payload, is_safe_public_path, timing_safe_str_equal,
    validate_username,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionClaims {
    pub sub: String,
    pub role: String,
    pub sid: String,
    pub exp: usize,
}

pub fn hash_password_argon2(password: &str) -> Result<String, String> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|h| h.to_string())
        .map_err(|e| format!("password hash failed: {e}"))
}

/// Verifies either modern Argon2id hashes (`$argon2...`) or legacy Node `salt_hex:scrypt_hex` hashes.
pub fn verify_password(password: &str, stored: &str) -> bool {
    if stored.starts_with("$argon2") {
        let Ok(parsed) = PasswordHash::new(stored) else {
            return false;
        };
        return Argon2::default()
            .verify_password(password.as_bytes(), &parsed)
            .is_ok();
    }
    if let Some((salt_hex, hash_hex)) = stored.split_once(':') {
        let Ok(salt_bytes) = hex::decode(salt_hex) else {
            return false;
        };
        let Ok(expected_bytes) = hex::decode(hash_hex) else {
            return false;
        };
        if expected_bytes.is_empty() {
            return false;
        }
        // Node crypto.scryptSync default parameters: N=16384 (log_n=14), r=8, p=1
        let Ok(params) = ScryptParams::new(14, 8, 1, expected_bytes.len()) else {
            return false;
        };
        let mut derived = vec![0u8; expected_bytes.len()];
        if scrypt(password.as_bytes(), &salt_bytes, &params, &mut derived).is_err() {
            return false;
        }
        return xenary_rust::timing_safe_equal(&derived, &expected_bytes);
    }
    false
}

pub fn sha256_hex(input: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(input.as_bytes());
    hex::encode(hasher.finalize())
}

pub fn sign_session_jwt(
    uid: &str,
    role: &str,
    sid: &str,
    ttl_secs: u64,
    secret: &str,
) -> Result<String, String> {
    let exp = chrono::Utc::now().timestamp() as usize + ttl_secs as usize;
    let claims = SessionClaims {
        sub: uid.to_string(),
        role: role.to_string(),
        sid: sid.to_string(),
        exp,
    };
    encode(
        &Header::new(Algorithm::HS256),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
    .map_err(|e| format!("jwt sign failed: {e}"))
}

pub fn verify_session_jwt(token: &str, secret: &str) -> Option<SessionClaims> {
    let mut val = Validation::new(Algorithm::HS256);
    val.validate_exp = true;
    decode::<SessionClaims>(token, &DecodingKey::from_secret(secret.as_bytes()), &val)
        .ok()
        .map(|d| d.claims)
}

pub fn build_session_cookie_header(
    name: &str,
    value: &str,
    max_age_secs: Option<u64>,
    is_https: bool,
) -> String {
    let mut parts = vec![
        format!("{name}={value}"),
        "Path=/".to_string(),
        "HttpOnly".to_string(),
        "SameSite=Lax".to_string(),
    ];
    if let Some(secs) = max_age_secs {
        parts.push(format!("Max-Age={secs}"));
    } else {
        parts.push("Max-Age=0".to_string());
    }
    if is_https {
        parts.push("Secure".to_string());
    }
    parts.join("; ")
}

pub fn is_valid_product_slug(slug: &str) -> bool {
    !slug.is_empty()
        && slug.len() <= 64
        && slug
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

pub fn is_safe_url(raw: &str) -> bool {
    let s = raw.trim();
    if s.is_empty() {
        return true;
    }
    if s.starts_with("//") {
        return false;
    }
    s.starts_with('/')
        || s.starts_with("https://")
        || s.starts_with("http://")
        || s.starts_with("data:image/png;base64,")
        || s.starts_with("data:image/jpeg;base64,")
        || s.starts_with("data:image/webp;base64,")
}

pub fn mask_buyer_name(name: &str) -> String {
    let clean = name.trim();
    if clean.is_empty() {
        return "คุณ ***".to_string();
    }
    let prefix: String = clean.chars().take(3).collect();
    format!("คุณ {prefix}****")
}

pub fn extract_truemoney_hash(link: &str) -> Option<String> {
    let s = link.trim();
    if let Some(idx) = s.find("?v=").or_else(|| s.find("&v=")) {
        let rest = &s[idx + 3..];
        let code: String = rest
            .chars()
            .take_while(|c| c.is_ascii_alphanumeric())
            .collect();
        if code.len() >= 10 && code.len() <= 64 {
            return Some(code);
        }
    }
    if s.len() >= 12 && s.len() <= 64 && s.chars().all(|c| c.is_ascii_alphanumeric()) {
        return Some(s.to_string());
    }
    None
}

pub fn generate_promptpay_svg_data_uri(payload: &str) -> Option<String> {
    let code = QrCode::new(payload.as_bytes()).ok()?;
    let svg_str = code
        .render::<svg::Color<'_>>()
        .min_dimensions(210, 210)
        .dark_color(svg::Color("#09090b"))
        .light_color(svg::Color("#ffffff"))
        .build();
    // Encode cleanly as percent-encoded SVG data URI (no base64 crate needed)
    let mut encoded = String::with_capacity(svg_str.len() + 32);
    for b in svg_str.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                encoded.push(b as char);
            }
            _ => encoded.push_str(&format!("%{:02X}", b)),
        }
    }
    Some(format!("data:image/svg+xml;charset=utf-8,{encoded}"))
}

pub struct BoundedRateLimiter {
    max_entries: usize,
    buckets: Mutex<HashMap<String, Vec<Instant>>>,
}

impl BoundedRateLimiter {
    pub fn new(max_entries: usize) -> Self {
        Self {
            max_entries,
            buckets: Mutex::new(HashMap::new()),
        }
    }

    pub fn check(&self, key: &str, max_attempts: usize, window_ms: u64) -> bool {
        let now = Instant::now();
        let window = Duration::from_millis(window_ms);
        let mut map = self.buckets.lock().unwrap_or_else(|p| p.into_inner());
        if map.len() >= self.max_entries && !map.contains_key(key) {
            map.retain(|_, v| {
                v.retain(|t| now.duration_since(*t) < window);
                !v.is_empty()
            });
        }
        let entries = map.entry(key.to_string()).or_default();
        entries.retain(|t| now.duration_since(*t) < window);
        if entries.len() >= max_attempts {
            return false;
        }
        entries.push(now);
        true
    }
}

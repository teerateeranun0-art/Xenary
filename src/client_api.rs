use serde::{Serialize, de::DeserializeOwned};

#[cfg(feature = "hydrate")]
use wasm_bindgen::JsCast;
#[cfg(feature = "hydrate")]
use wasm_bindgen_futures::JsFuture;
#[cfg(feature = "hydrate")]
use web_sys::{Headers, Request, RequestCredentials, RequestInit, Response};

#[cfg(feature = "hydrate")]
pub async fn api_request<B: Serialize, T: DeserializeOwned>(
    method: &str,
    url: &str,
    body: Option<&B>,
    admin_key: Option<&str>,
) -> Result<T, String> {
    let opts = RequestInit::new();
    opts.set_method(method);
    opts.set_credentials(RequestCredentials::Include);

    let headers = Headers::new().map_err(|e| format!("{e:?}"))?;
    headers
        .set("Accept", "application/json")
        .map_err(|e| format!("{e:?}"))?;
    if let Some(k) = admin_key
        && !k.trim().is_empty()
    {
        headers
            .set("x-admin-key", k.trim())
            .map_err(|e| format!("{e:?}"))?;
    }
    if let Some(payload) = body {
        let json_str = serde_json::to_string(payload).map_err(|e| e.to_string())?;
        headers
            .set("Content-Type", "application/json")
            .map_err(|e| format!("{e:?}"))?;
        opts.set_body(&wasm_bindgen::JsValue::from_str(&json_str));
    }
    opts.set_headers(&headers);

    let request = Request::new_with_str_and_init(url, &opts).map_err(|e| format!("{e:?}"))?;
    let win = web_sys::window().ok_or_else(|| "no browser window".to_string())?;
    let resp_val = JsFuture::from(win.fetch_with_request(&request))
        .await
        .map_err(|e| format!("Network error: {e:?}"))?;
    let resp: Response = resp_val
        .dyn_into()
        .map_err(|_| "Invalid Response object".to_string())?;
    let text_val = JsFuture::from(resp.text().map_err(|e| format!("{e:?}"))?)
        .await
        .map_err(|e| format!("{e:?}"))?;
    let text = text_val.as_string().unwrap_or_default();

    if !resp.ok() {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&text)
            && let Some(msg) = v.get("message").and_then(|m| m.as_str())
        {
            return Err(msg.to_string());
        }
        return Err(format!("HTTP {}", resp.status()));
    }

    serde_json::from_str::<T>(&text).map_err(|e| format!("Decode error: {e}"))
}

#[cfg(not(feature = "hydrate"))]
pub async fn api_request<B: Serialize, T: DeserializeOwned>(
    _method: &str,
    _url: &str,
    _body: Option<&B>,
    _admin_key: Option<&str>,
) -> Result<T, String> {
    Err("SSR stub".to_string())
}

pub async fn api_get<T: DeserializeOwned>(url: &str) -> Result<T, String> {
    api_request::<(), T>("GET", url, None, None).await
}

pub async fn api_get_admin<T: DeserializeOwned>(url: &str, admin_key: &str) -> Result<T, String> {
    api_request::<(), T>("GET", url, None, Some(admin_key)).await
}

pub async fn api_post<B: Serialize, T: DeserializeOwned>(
    url: &str,
    body: &B,
) -> Result<T, String> {
    api_request("POST", url, Some(body), None).await
}

pub async fn api_admin_req<B: Serialize, T: DeserializeOwned>(
    method: &str,
    url: &str,
    body: Option<&B>,
    admin_key: &str,
) -> Result<T, String> {
    api_request(method, url, body, Some(admin_key)).await
}

pub fn session_get(key: &str) -> String {
    #[cfg(feature = "hydrate")]
    {
        if let Some(win) = web_sys::window()
            && let Ok(Some(st)) = win.session_storage()
            && let Ok(Some(v)) = st.get_item(key)
        {
            return v;
        }
    }
    let _ = key;
    String::new()
}

pub fn session_set(key: &str, val: &str) {
    #[cfg(feature = "hydrate")]
    {
        if let Some(win) = web_sys::window()
            && let Ok(Some(st)) = win.session_storage()
        {
            if val.is_empty() {
                let _ = st.remove_item(key);
            } else {
                let _ = st.set_item(key, val);
            }
        }
    }
    let _ = (key, val);
}

pub fn copy_text(text: &str) {
    #[cfg(feature = "hydrate")]
    {
        if let Some(win) = web_sys::window() {
            let clip = win.navigator().clipboard();
            let _ = clip.write_text(text);
        }
    }
    let _ = text;
}

pub fn scroll_to_top() {
    #[cfg(feature = "hydrate")]
    {
        if let Some(win) = web_sys::window() {
            win.scroll_to_with_x_and_y(0.0, 0.0);
        }
    }
}

pub fn format_thb(v: f64) -> String {
    let rounded = (v * 100.0).round() / 100.0;
    if (rounded.fract()).abs() < 0.005 {
        format!("฿{}", format_commas(rounded.round() as i64))
    } else {
        let whole = rounded.trunc() as i64;
        let frac = ((rounded.abs().fract()) * 100.0).round() as i64;
        format!("฿{}.{:02}", format_commas(whole), frac)
    }
}

pub fn format_thb_2(v: f64) -> String {
    let rounded = (v * 100.0).round() / 100.0;
    let whole = rounded.trunc() as i64;
    let frac = ((rounded.abs().fract()) * 100.0).round() as i64;
    format!("฿{}.{:02}", format_commas(whole), frac)
}

pub fn format_commas(n: i64) -> String {
    let neg = n < 0;
    let s = n.abs().to_string();
    let mut out = String::with_capacity(s.len() + s.len() / 3);
    for (i, ch) in s.chars().rev().enumerate() {
        if i > 0 && i % 3 == 0 {
            out.push(',');
        }
        out.push(ch);
    }
    if neg {
        out.push('-');
    }
    out.chars().rev().collect()
}

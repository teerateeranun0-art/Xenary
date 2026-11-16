use leptos::prelude::*;
use leptos_router::components::A;
use leptos_router::hooks::use_navigate;

use crate::client_api::api_post;
use crate::components::layout::AppStateContext;
use crate::models::{AuthResponse, LoginPayload, RegisterPayload};

#[component]
pub fn LoginPage() -> impl IntoView {
    let ctx = expect_context::<AppStateContext>();
    let navigate = use_navigate();
    let username = RwSignal::new(String::new());
    let password = RwSignal::new(String::new());
    let remember = RwSignal::new(true);
    let error_msg = RwSignal::new(String::new());
    let busy = RwSignal::new(false);

    let on_submit = move |ev: leptos::ev::SubmitEvent| {
        ev.prevent_default();
        error_msg.set(String::new());
        let u = username.get().trim().to_string();
        let p = password.get();
        let rem = remember.get();
        if u.len() < 3 || p.is_empty() {
            error_msg.set("กรุณากรอกชื่อผู้ใช้และรหัสผ่านให้ครบถ้วน".to_string());
            return;
        }
        busy.set(true);
        let user_sig = ctx.user;
        let nav = navigate.clone();
        leptos::task::spawn_local(async move {
            let payload = LoginPayload {
                username: u,
                password: p,
                remember: rem,
                website: String::new(),
            };
            match api_post::<LoginPayload, AuthResponse>("/api/auth/login", &payload).await {
                Ok(res) => {
                    user_sig.set(res.user);
                    nav("/", Default::default());
                }
                Err(e) => {
                    error_msg.set(e);
                }
            }
            busy.set(false);
        });
    };

    view! {
        <div class="xn-pg xn-narrow">
            <h1>"เข้าสู่ระบบ"</h1>
            <p class="lead">"ยังไม่มีบัญชี? " <A href="/register">"สมัครสมาชิก"</A></p>

            <form class="xn-card xn-form" on:submit=on_submit>
                <label>
                    <span>"ชื่อผู้ใช้"</span>
                    <input
                        name="username"
                        autocomplete="username"
                        required
                        prop:value=username
                        on:input=move |ev| username.set(event_target_value(&ev))
                    />
                </label>
                <label>
                    <span>"รหัสผ่าน"</span>
                    <input
                        name="password"
                        type="password"
                        autocomplete="current-password"
                        required
                        prop:value=password
                        on:input=move |ev| password.set(event_target_value(&ev))
                    />
                </label>
                <label class="xn-chk">
                    <input
                        type="checkbox"
                        prop:checked=remember
                        on:change=move |ev| remember.set(event_target_checked(&ev))
                    />
                    <span>"จดจำฉันไว้ในเครื่องนี้ (30 วัน)"</span>
                </label>

                {move || {
                    let msg = error_msg.get();
                    if msg.is_empty() {
                        ().into_any()
                    } else {
                        view! { <p class="xn-msg" role="alert">{msg}</p> }.into_any()
                    }
                }}

                <button class="xn-btn" type="submit" disabled=move || busy.get()>
                    {move || if busy.get() { "กำลังเข้าสู่ระบบ..." } else { "เข้าสู่ระบบ" }}
                </button>
            </form>
        </div>
    }
}

#[component]
pub fn RegisterPage() -> impl IntoView {
    let ctx = expect_context::<AppStateContext>();
    let navigate = use_navigate();
    let username = RwSignal::new(String::new());
    let password = RwSignal::new(String::new());
    let confirm = RwSignal::new(String::new());
    let remember = RwSignal::new(true);
    let error_msg = RwSignal::new(String::new());
    let busy = RwSignal::new(false);

    let on_submit = move |ev: leptos::ev::SubmitEvent| {
        ev.prevent_default();
        error_msg.set(String::new());
        let u = username.get().trim().to_string();
        let p = password.get();
        let c = confirm.get();
        let rem = remember.get();

        if u.len() < 3 || u.len() > 20 || !u.chars().all(|ch| ch.is_ascii_alphanumeric() || ch == '_') {
            error_msg.set("ชื่อผู้ใช้ต้องยาว 3-20 ตัว และใช้ได้เฉพาะ a-z, 0-9, _".to_string());
            return;
        }
        if p.len() < 8 {
            error_msg.set("รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร".to_string());
            return;
        }
        if p != c {
            error_msg.set("รหัสผ่านและการยืนยันรหัสผ่านไม่ตรงกัน".to_string());
            return;
        }

        busy.set(true);
        let user_sig = ctx.user;
        let nav = navigate.clone();
        leptos::task::spawn_local(async move {
            let payload = RegisterPayload {
                username: u,
                password: p,
                remember: rem,
                website: String::new(),
            };
            match api_post::<RegisterPayload, AuthResponse>("/api/auth/register", &payload).await {
                Ok(res) => {
                    user_sig.set(res.user);
                    nav("/", Default::default());
                }
                Err(e) => {
                    error_msg.set(e);
                }
            }
            busy.set(false);
        });
    };

    view! {
        <div class="xn-pg xn-narrow">
            <h1>"สมัครสมาชิก"</h1>
            <p class="lead">"มีบัญชีอยู่แล้ว? " <A href="/login">"เข้าสู่ระบบ"</A></p>

            <form class="xn-card xn-form" on:submit=on_submit>
                <label>
                    <span>"ชื่อผู้ใช้"</span>
                    <input
                        name="username"
                        autocomplete="username"
                        required
                        prop:value=username
                        on:input=move |ev| username.set(event_target_value(&ev))
                    />
                    <small>"3-20 ตัว ใช้ a-z 0-9 _"</small>
                </label>
                <label>
                    <span>"รหัสผ่าน"</span>
                    <input
                        name="password"
                        type="password"
                        autocomplete="new-password"
                        required
                        prop:value=password
                        on:input=move |ev| password.set(event_target_value(&ev))
                    />
                    <small>"อย่างน้อย 8 ตัวอักษร"</small>
                </label>
                <label>
                    <span>"ยืนยันรหัสผ่าน"</span>
                    <input
                        name="confirm"
                        type="password"
                        autocomplete="new-password"
                        required
                        prop:value=confirm
                        on:input=move |ev| confirm.set(event_target_value(&ev))
                    />
                </label>
                <label class="xn-chk">
                    <input
                        type="checkbox"
                        prop:checked=remember
                        on:change=move |ev| remember.set(event_target_checked(&ev))
                    />
                    <span>"จดจำฉันไว้ในเครื่องนี้ (30 วัน)"</span>
                </label>

                {move || {
                    let msg = error_msg.get();
                    if msg.is_empty() {
                        ().into_any()
                    } else {
                        view! { <p class="xn-msg" role="alert">{msg}</p> }.into_any()
                    }
                }}

                <button class="xn-btn" type="submit" disabled=move || busy.get()>
                    {move || if busy.get() { "กำลังสมัครสมาชิก..." } else { "สมัครสมาชิก" }}
                </button>
            </form>
        </div>
    }
}

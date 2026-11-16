use leptos::prelude::*;
use leptos_router::components::A;
use serde::Deserialize;

use crate::client_api::{api_get, copy_text};
use crate::components::layout::AppStateContext;
use crate::models::{SupportLink};

#[derive(Debug, Clone, Deserialize)]
struct SupportResp {
    links: Vec<SupportLink>,
}

#[component]
pub fn StatusPage() -> impl IntoView {
    let ctx = expect_context::<AppStateContext>();

    view! {
        <div class="xn-pg">
            <h1>"สถานะระบบและสินค้า"</h1>
            <p class="lead">"ตรวจสอบสถานะการทำงานของระบบและสถานะอัปเดตของสินค้าแต่ละรายการแบบเรียลไทม์"</p>

            {move || match ctx.status.get() {
                None => view! { <div class="xn-card xn-tile"><span>"กำลังโหลดสถานะ..."</span></div> }.into_any(),
                Some(st) => view! {
                    <div class="xn-tiles">
                        <div class="xn-card xn-tile">
                            <span class="lbl">"สถานะระบบ"</span>
                            <b class={if st.online { "xn-on" } else { "xn-off" }}>
                                {if st.online { "ออนไลน์ (พร้อมให้บริการ)" } else { "ปิดปรับปรุงชั่วคราว" }}
                            </b>
                        </div>
                        <div class="xn-card xn-tile">
                            <span class="lbl">"จำนวนสินค้า"</span>
                            <b>{format!("{} รายการ", st.products)}</b>
                        </div>
                        <div class="xn-card xn-tile">
                            <span class="lbl">"กำลังอัปเดต"</span>
                            <b class={if st.updating_count > 0 { "yellow" } else { "xn-on" }}>
                                {format!("{} รายการ", st.updating_count)}
                            </b>
                        </div>
                        <div class="xn-card xn-tile">
                            <span class="lbl">"คำสั่งซื้อสำเร็จ"</span>
                            <b>{format!("{} ออเดอร์", st.paid)}</b>
                        </div>
                    </div>

                    <div style="display:flex;flex-direction:column;gap:10px;margin-top:20px;">
                        {st.items.into_iter().map(|it| {
                            let href = format!("/product/{}", it.slug);
                            let nm = it.name.clone();
                            let tg = it.tag.clone();
                            view! {
                                <A href=href attr:class="xn-status-card">
                                    <div class="xn-status-left">
                                        <span class="xn-status-tag">{tg}</span>
                                        <span class="xn-status-title">{nm}</span>
                                    </div>
                                    <div class="xn-status-right">
                                        <span class="xn-status-stock">{format!("คงเหลือ {} ชิ้น", it.stock)}</span>
                                        {if it.updating {
                                            view! { <span class="xn-status-pill updating">"กำลังอัปเดต"</span> }.into_any()
                                        } else if it.stock > 0 {
                                            view! { <span class="xn-status-pill ok">"พร้อมใช้งาน"</span> }.into_any()
                                        } else {
                                            view! { <span class="xn-status-pill out">"สต็อกหมด"</span> }.into_any()
                                        }}
                                    </div>
                                </A>
                            }
                        }).collect_view()}
                    </div>
                }.into_any(),
            }}
        </div>
    }
}

#[component]
pub fn ContactPage() -> impl IntoView {
    let links_res = LocalResource::new(|| async move {
        api_get::<SupportResp>("/api/support-links")
            .await
            .map(|r| r.links)
            .unwrap_or_default()
    });

    view! {
        <div class="inf-acc-wrap">
            <div class="inf-topup-subbar">
                <A href="/products" attr:class="inf-back-pill">"← กลับหน้าร้านค้า"</A>
                <div class="inf-topup-bal-right">
                    <strong>"ศูนย์ช่วยเหลือ & ติดต่อทีมงาน"</strong>
                    <span>"ซัพพอร์ตตลอด 24 ชั่วโมง"</span>
                </div>
            </div>

            <div class="inf-topup-hero">
                <span class="inf-topup-kicker">"SUPPORT & COMMUNITY"</span>
                <h1>"เลือกช่องทาง " <span>"ติดต่อเรา"</span></h1>
                <p>"สอบถามข้อมูลสินค้า แจ้งปัญหาการใช้งาน หรือติดตามข่าวสารอัปเดตได้ทุกช่องทางด้านล่าง"</p>
            </div>

            <div class="inf-pay-grid">
                {move || {
                    let links = links_res.get().unwrap_or_default();
                    links.into_iter().map(|s| {
                        let h_copy = s.handle.clone();
                        view! {
                            <article class="inf-pay-card">
                                <div class="inf-pay-card-top">
                                    <span class="inf-pay-code">{s.platform.to_uppercase()}</span>
                                    <span class="inf-pay-badge">{s.badge}</span>
                                </div>
                                <h3 class="inf-pay-title">{s.label}</h3>
                                <p class="inf-pay-sub">{s.description}</p>
                                <div class="inf-pay-min">
                                    <button type="button" class="adm-btn sm" on:click=move |_| copy_text(&h_copy)>
                                        {format!("คัดลอกไอดี: {}", s.handle)}
                                    </button>
                                </div>
                                <a href=s.url target="_blank" rel="noopener noreferrer" class="inf-pay-action-btn" style="text-decoration:none;justify-content:center;">
                                    "เปิดช่องทางติดต่อ ↗"
                                </a>
                            </article>
                        }
                    }).collect_view()
                }}
            </div>

            <div class="inf-contact-guide-grid">
                <div class="xn-card xn-s4">
                    <h2>"ขั้นตอนการสั่งซื้อและรับสินค้าอัตโนมัติ"</h2>
                    <ol>
                        <li>"เลือกสินค้าและระยะเวลาแพ็กเกจที่ต้องการในหน้า " <A href="/products">"ร้านค้า"</A></li>
                        <li>"เติมเครดิตเข้าบัญชีที่หน้า " <A href="/account">"เติมเงิน"</A> " (PromptPay QR, โอนธนาคารแนบสลิป, TrueMoney และโค้ดอั่งเปา)"</li>
                        <li>"กดปุ่มชำระเงิน ระบบจะส่งมอบคีย์พร้อมลิงก์ดาวน์โหลดทันทีที่หน้า " <A href="/account?tab=orders">"ประวัติการสั่งซื้อ"</A></li>
                    </ol>
                </div>
                <div class="xn-card xn-s4">
                    <h2>"การแจ้งปัญหา / ติดต่อแอดมิน"</h2>
                    <ol>
                        <li>"เตรียมรหัสคำสั่งซื้อ (เช่น ORD-...) หรือชื่อบัญชีผู้ใช้ของคุณ"</li>
                        <li>"คลิกเลือกช่องทางติดต่อที่สะดวกด้านบน (แนะนำ Discord เพื่อความรวดเร็ว)"</li>
                        <li>"สามารถคลิกที่ปุ่มไอดีบนการ์ดเพื่อคัดลอกไอดีได้ทันที"</li>
                    </ol>
                </div>
            </div>
        </div>
    }
}

#[component]
pub fn TosPage() -> impl IntoView {
    view! {
        <div class="xn-pg">
            <h1>"เงื่อนไขการใช้งาน"</h1>
            <p class="lead">"กรุณาอ่านก่อนสั่งซื้อสินค้ากับ XENARY"</p>
            <div class="xn-card"><h2>"1. สินค้าดิจิทัล"</h2><p>"สินค้าทั้งหมดเป็นสินค้าดิจิทัล ส่งมอบหลังชำระเงินและยืนยันออเดอร์แล้วผ่านช่องทางที่ร้านกำหนด"</p></div>
            <div class="xn-card"><h2>"2. การคืนเงิน"</h2><p>"ไม่รับคืนเงินหลังส่งมอบสินค้าแล้ว ยกเว้นสินค้าใช้งานไม่ได้จากฝั่งร้าน ให้แจ้งทีมงานผ่าน Discord พร้อมหลักฐาน"</p></div>
            <div class="xn-card"><h2>"3. ความรับผิดชอบของผู้ซื้อ"</h2><p>"ผู้ซื้อรับผิดชอบการใช้งานและความเสี่ยงที่เกิดขึ้นกับบัญชีของตนเอง รวมถึงการปฏิบัติตามกฎของเกมหรือแพลตฟอร์มที่ใช้งาน"</p></div>
            <div class="xn-card"><h2>"4. การแชร์และจำหน่ายต่อ"</h2><p>"ห้ามแชร์ แจกจ่าย หรือขายต่อสินค้าและคีย์ที่ซื้อไป หากพบ ทางร้านขอยกเลิกสิทธิ์โดยไม่คืนเงิน"</p></div>
            <div class="xn-card"><h2>"5. การติดต่อ"</h2><p>"ปัญหาเกี่ยวกับออเดอร์ทั้งหมดแจ้งผ่านหน้า " <A href="/contact" attr:class="xn-s3">"ติดต่อ"</A></p></div>
        </div>
    }
}

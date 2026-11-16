use leptos::prelude::*;
use leptos_router::components::A;
use leptos_router::hooks::use_query_map;
use serde::Deserialize;

use crate::client_api::{api_get, api_post, copy_text, format_thb_2};
use crate::components::layout::AppStateContext;
use crate::models::{
    BankSlipPayload, OrderRecord, PaymentChannel, PromptPayCreatePayload, RedeemCodePayload,
    TopupRecord, TrueMoneyPayload,
};

#[derive(Debug, Clone, Deserialize)]
struct OrdersResp {
    orders: Vec<OrderRecord>,
}

#[derive(Debug, Clone, Deserialize)]
struct TopupsResp {
    topups: Vec<TopupRecord>,
}

#[derive(Debug, Clone, Deserialize)]
struct ChannelsResp {
    channels: Vec<PaymentChannel>,
}

#[derive(Debug, Clone, Deserialize)]
struct PpResp {
    topup: TopupRecord,
}

#[derive(Debug, Clone, Deserialize)]
struct MsgResp {
    message: Option<String>,
    new_balance: Option<f64>,
}

#[component]
pub fn AccountPage() -> impl IntoView {
    let ctx = expect_context::<AppStateContext>();
    let query = use_query_map();
    let is_orders_tab = move || query.with(|q| q.get("tab").as_deref() == Some("orders"));

    let active_modal = RwSignal::new(Option::<&'static str>::None);
    let reload_acc = RwSignal::new(0u64);

    // Form signals
    let pp_amount = RwSignal::new("100".to_string());
    let pp_result = RwSignal::new(Option::<TopupRecord>::None);
    let bank_amount = RwSignal::new("100".to_string());
    let bank_channel_id = RwSignal::new(String::new());
    let bank_slip_data = RwSignal::new(String::new());
    let bank_qr_payload = RwSignal::new(String::new());
    let tm_link = RwSignal::new(String::new());
    let redeem_input = RwSignal::new(String::new());
    let modal_msg = RwSignal::new(Option::<(bool, String)>::None);
    let busy = RwSignal::new(false);

    let orders_res = LocalResource::new(move || {
        let _u = ctx.user.get();
        let _r = reload_acc.get();
        async move {
            api_get::<OrdersResp>("/api/orders")
                .await
                .map(|r| r.orders)
                .unwrap_or_default()
        }
    });

    let topups_res = LocalResource::new(move || {
        let _u = ctx.user.get();
        let _r = reload_acc.get();
        async move {
            api_get::<TopupsResp>("/api/topup/history")
                .await
                .map(|r| r.topups)
                .unwrap_or_default()
        }
    });

    let channels_res = LocalResource::new(|| async move {
        api_get::<ChannelsResp>("/api/channels/public")
            .await
            .map(|r| r.channels)
            .unwrap_or_default()
    });

    let open_pay = move |kind: &'static str| {
        modal_msg.set(None);
        pp_result.set(None);
        active_modal.set(Some(kind));
    };

    let on_pp_submit = move |ev: leptos::ev::SubmitEvent| {
        ev.prevent_default();
        modal_msg.set(None);
        let amt: f64 = pp_amount.get().trim().parse().unwrap_or(0.0);
        if amt < 1.0 {
            modal_msg.set(Some((false, "กรุณาระบุจำนวนเงินตั้งแต่ 1 บาทขึ้นไป".into())));
            return;
        }
        busy.set(true);
        leptos::task::spawn_local(async move {
            match api_post::<PromptPayCreatePayload, PpResp>(
                "/api/topup/promptpay",
                &PromptPayCreatePayload { amount: amt },
            )
            .await
            {
                Ok(r) => {
                    pp_result.set(Some(r.topup));
                    reload_acc.update(|v| *v += 1);
                }
                Err(e) => modal_msg.set(Some((false, e))),
            }
            busy.set(false);
        });
    };

    let on_bank_submit = move |ev: leptos::ev::SubmitEvent| {
        ev.prevent_default();
        modal_msg.set(None);
        let amt: f64 = bank_amount.get().trim().parse().unwrap_or(0.0);
        let payload = BankSlipPayload {
            amount: amt,
            channel_id: bank_channel_id.get(),
            slip_url: bank_slip_data.get(),
            qr_payload: bank_qr_payload.get(),
        };
        busy.set(true);
        leptos::task::spawn_local(async move {
            match api_post::<BankSlipPayload, MsgResp>("/api/topup/bank-slip", &payload).await {
                Ok(r) => {
                    modal_msg.set(Some((
                        true,
                        r.message.unwrap_or_else(|| "ส่งสลิปเรียบร้อยแล้ว".into()),
                    )));
                    reload_acc.update(|v| *v += 1);
                }
                Err(e) => modal_msg.set(Some((false, e))),
            }
            busy.set(false);
        });
    };

    let on_tm_submit = move |ev: leptos::ev::SubmitEvent| {
        ev.prevent_default();
        modal_msg.set(None);
        let link = tm_link.get().trim().to_string();
        busy.set(true);
        leptos::task::spawn_local(async move {
            match api_post::<TrueMoneyPayload, MsgResp>(
                "/api/topup/truemoney",
                &TrueMoneyPayload { link },
            )
            .await
            {
                Ok(r) => {
                    modal_msg.set(Some((
                        true,
                        r.message.unwrap_or_else(|| "ส่งซองอั่งเปาเรียบร้อยแล้ว".into()),
                    )));
                    tm_link.set(String::new());
                    reload_acc.update(|v| *v += 1);
                }
                Err(e) => modal_msg.set(Some((false, e))),
            }
            busy.set(false);
        });
    };

    let on_redeem_submit = move |ev: leptos::ev::SubmitEvent| {
        ev.prevent_default();
        modal_msg.set(None);
        let code = redeem_input.get().trim().to_string();
        let user_sig = ctx.user;
        busy.set(true);
        leptos::task::spawn_local(async move {
            match api_post::<RedeemCodePayload, MsgResp>(
                "/api/topup/redeem",
                &RedeemCodePayload { code },
            )
            .await
            {
                Ok(r) => {
                    if let Some(nb) = r.new_balance {
                        user_sig.update(|u| {
                            if let Some(acc) = u {
                                acc.balance = nb;
                            }
                        });
                    }
                    modal_msg.set(Some((
                        true,
                        r.message.unwrap_or_else(|| "แลกโค้ดสำเร็จ".into()),
                    )));
                    redeem_input.set(String::new());
                    reload_acc.update(|v| *v += 1);
                }
                Err(e) => modal_msg.set(Some((false, e))),
            }
            busy.set(false);
        });
    };

    view! {
        <div class="inf-acc-wrap">
            {move || match ctx.user.get() {
                None => view! {
                    <div class="xn-card" style="padding:36px;text-align:center;max-width:520px;margin:24px auto;">
                        <h2>"กรุณาเข้าสู่ระบบ"</h2>
                        <p class="lead">"เข้าสู่ระบบเพื่อเติมเครดิต ดูประวัติคำสั่งซื้อ และคัดลอกคีย์สินค้า"</p>
                        <div style="display:flex;gap:10px;justify-content:center;margin-top:16px;">
                            <A href="/login" attr:class="xn-btn" attr:style="text-decoration:none;">"เข้าสู่ระบบ"</A>
                            <A href="/register" attr:class="inf-btn-cancel" attr:style="text-decoration:none;">"สมัครสมาชิก"</A>
                        </div>
                    </div>
                }.into_any(),
                Some(u) => {
                    let bal_str = format_thb_2(u.balance);
                    view! {
                        <div class="inf-acc-tab-bar">
                            <A href="/account" attr:class=move || if !is_orders_tab() { "inf-acc-tab-btn on" } else { "inf-acc-tab-btn" }>
                                <span>"เติมเงินเครดิต"</span>
                            </A>
                            <A href="/account?tab=orders" attr:class=move || if is_orders_tab() { "inf-acc-tab-btn on" } else { "inf-acc-tab-btn" }>
                                <span>"ประวัติคำสั่งซื้อ"</span>
                            </A>
                        </div>

                        {move || if !is_orders_tab() {
                            view! {
                                <section id="inf-view-topup">
                                    <div class="inf-topup-subbar">
                                        <A href="/products" attr:class="inf-back-pill">"← กลับหน้าร้านค้า"</A>
                                        <div class="inf-topup-bal-right">
                                            <strong>"เติมเงิน"</strong>
                                            <span>"ยอดเงินปัจจุบัน: " <b id="acc-bal">{bal_str.clone()}</b></span>
                                        </div>
                                    </div>

                                    <div class="inf-topup-hero">
                                        <span class="inf-topup-kicker">"เติมเครดิต"</span>
                                        <h1>"เลือกช่องทาง " <span>"ชำระเงิน"</span></h1>
                                        <p>"กรุณาตรวจสอบสินค้าหรือราคาก่อนเติมเงิน"</p>
                                    </div>

                                    <div class="inf-pay-grid">
                                        <article class="inf-pay-card">
                                            <div class="inf-pay-card-top">
                                                <span class="inf-pay-code">"PROMPTPAY QR"</span>
                                                <span class="inf-pay-badge">"อัตโนมัติ"</span>
                                            </div>
                                            <div class="inf-pay-logo pp"><div class="inf-pp-emblem"><span>"THAI QR"</span><strong>"PromptPay"</strong></div></div>
                                            <h3 class="inf-pay-title">"PromptPay QR"</h3>
                                            <p class="inf-pay-sub">"สแกนจ่ายผ่าน App ธนาคาร (EMVCo SVG)"</p>
                                            <div class="inf-pay-min">"ยอดเงินขั้นต่ำ 1 บาท"</div>
                                            <button type="button" class="inf-pay-action-btn" on:click=move |_| open_pay("promptpay")>"กดเพื่อชำระเงิน"</button>
                                        </article>

                                        <article class="inf-pay-card">
                                            <div class="inf-pay-card-top">
                                                <span class="inf-pay-code">"BANK TRANSFER"</span>
                                                <span class="inf-pay-badge">"ตรวจสอบสลิป"</span>
                                            </div>
                                            <div class="inf-pay-logo bank"><span style="font-weight:800;font-size:20px;">"BANK"</span></div>
                                            <h3 class="inf-pay-title">"โอนผ่านธนาคาร"</h3>
                                            <p class="inf-pay-sub">"แนบสลิปหรือวาง QR Payload"</p>
                                            <div class="inf-pay-min">"ยอดเงินขั้นต่ำ 1 บาท"</div>
                                            <button type="button" class="inf-pay-action-btn" on:click=move |_| open_pay("bank")>"กดเพื่อชำระเงิน"</button>
                                        </article>

                                        <article class="inf-pay-card">
                                            <div class="inf-pay-card-top">
                                                <span class="inf-pay-code">"TRUEMONEY WALLET"</span>
                                                <span class="inf-pay-badge">"ซองอั่งเปา"</span>
                                            </div>
                                            <div class="inf-pay-logo tm"><div class="inf-tm-emblem"><strong>"W"</strong><span>"TrueMoney"</span></div></div>
                                            <h3 class="inf-pay-title">"ซองอั่งเปา TrueMoney"</h3>
                                            <p class="inf-pay-sub">"วางลิงก์ซองจาก TrueMoney Wallet"</p>
                                            <div class="inf-pay-min">"ยอดเงินขั้นต่ำ 10 บาท"</div>
                                            <button type="button" class="inf-pay-action-btn" on:click=move |_| open_pay("truemoney")>"กดเพื่อกรอกลิงก์อั่งเปา"</button>
                                        </article>

                                        <article class="inf-pay-card">
                                            <div class="inf-pay-card-top">
                                                <span class="inf-pay-code">"GIFT.CODE"</span>
                                                <span class="inf-pay-badge">"แลกทันที"</span>
                                            </div>
                                            <div class="inf-pay-logo gift"><span style="font-weight:800;font-size:18px;color:#f59e0b;">"REDEEM"</span></div>
                                            <h3 class="inf-pay-title">"โค้ดอั่งเปา (ร้าน)"</h3>
                                            <p class="inf-pay-sub">"กรอกโค้ดเติมเงินจากทางร้านรับเครดิตทันที"</p>
                                            <div class="inf-pay-min">"ยอดเงินขั้นต่ำ 1 บาท"</div>
                                            <button type="button" class="inf-pay-action-btn" on:click=move |_| open_pay("coupon")>"กดเพื่อกรอกโค้ด"</button>
                                        </article>
                                    </div>

                                    <div class="inf-topup-hist-sec">
                                        <div class="inf-topup-hist-head">
                                            <h2>"ประวัติเติมเงิน"</h2>
                                        </div>
                                        <div class="inf-topup-hist-list">
                                            {move || {
                                                let list = topups_res.get().unwrap_or_default();
                                                if list.is_empty() {
                                                    return view! { <div class="inf-orders-empty">"ยังไม่มีประวัติการเติมเงิน"</div> }.into_any();
                                                }
                                                list.into_iter().map(|t| view! {
                                                    <div class="inf-topup-hist-row">
                                                        <div class="inf-th-left">
                                                            <strong>{t.channel_name}</strong>
                                                            <small>{format!("{} · {}", t.id, t.created_at)}</small>
                                                        </div>
                                                        <div class="inf-th-right">
                                                            <span class="inf-th-amt">{format_thb_2(t.amount)}</span>
                                                            <span class="inf-status-pill ok">{t.status}</span>
                                                        </div>
                                                    </div>
                                                }).collect_view().into_any()
                                            }}
                                        </div>
                                    </div>
                                </section>
                            }.into_any()
                        } else {
                            view! {
                                <section id="inf-view-orders">
                                    <div class="inf-orders-head">
                                        <div>
                                            <h1>"ประวัติคำสั่งซื้อ"</h1>
                                            <p>{move || format!("{} รายการ", orders_res.get().map(|v| v.len()).unwrap_or(0))}</p>
                                        </div>
                                    </div>

                                    <div class="inf-orders-table-wrap">
                                        <table class="inf-orders-table">
                                            <thead>
                                                <tr>
                                                    <th>"ID"</th>
                                                    <th>"สินค้า"</th>
                                                    <th>"ตัวเลือก"</th>
                                                    <th>"ราคา"</th>
                                                    <th>"สถานะ"</th>
                                                    <th>"คีย์ที่ได้รับ"</th>
                                                    <th>"ดาวน์โหลด"</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {move || {
                                                    let list = orders_res.get().unwrap_or_default();
                                                    if list.is_empty() {
                                                        return view! { <tr><td colspan="7" class="inf-orders-empty">"ยังไม่มีคำสั่งซื้อ"</td></tr> }.into_any();
                                                    }
                                                    list.into_iter().map(|ord| {
                                                        let keys_joined = ord.keys_delivered.join("\n");
                                                        let keys_cp = keys_joined.clone();
                                                        let dl = ord.download_url.clone();
                                                        view! {
                                                            <tr>
                                                                <td><code>{ord.id}</code></td>
                                                                <td>{ord.product.name}</td>
                                                                <td>{ord.plan.label}</td>
                                                                <td>{format_thb_2(ord.total)}</td>
                                                                <td><span class="inf-status-pill ok">{ord.status}</span></td>
                                                                <td>
                                                                    {if keys_joined.is_empty() {
                                                                        view! { <span>"-"</span> }.into_any()
                                                                    } else {
                                                                        view! {
                                                                            <div style="display:flex;align-items:center;gap:6px;">
                                                                                <code>{keys_joined}</code>
                                                                                <button type="button" class="adm-btn sm" on:click=move |_| copy_text(&keys_cp)>"คัดลอก"</button>
                                                                            </div>
                                                                        }.into_any()
                                                                    }}
                                                                </td>
                                                                <td>
                                                                    {match dl {
                                                                        Some(u) if !u.is_empty() => view! {
                                                                            <a href=u target="_blank" rel="noopener noreferrer" class="adm-btn sm">"โหลดไฟล์"</a>
                                                                        }.into_any(),
                                                                        _ => view! { <span>"-"</span> }.into_any(),
                                                                    }}
                                                                </td>
                                                            </tr>
                                                        }
                                                    }).collect_view().into_any()
                                                }}
                                            </tbody>
                                        </table>
                                    </div>
                                </section>
                            }.into_any()
                        }}
                    }.into_any()
                }
            }}

            {move || match active_modal.get() {
                Some("promptpay") => view! {
                    <div class="inf-pay-modal-backdrop">
                        <div class="inf-pay-modal-box">
                            <div class="inf-pay-modal-head">
                                <div><h3>"PromptPay QR"</h3><p>"สร้างรหัส QR EMVCo ด้วย Rust"</p></div>
                            </div>
                            {move || match pp_result.get() {
                                None => view! {
                                    <form class="inf-pay-form" on:submit=on_pp_submit>
                                        <label class="inf-pay-label">
                                            <span>"จำนวนเงินที่ต้องการเติม (บาท)"</span>
                                            <input type="number" min="1" max="100000" step="1" required prop:value=pp_amount on:input=move |ev| pp_amount.set(event_target_value(&ev))/>
                                        </label>
                                        <div class="inf-pay-chips">
                                            {["20", "50", "100", "300", "500", "1000"].into_iter().map(|v| view! {
                                                <button type="button" on:click=move |_| pp_amount.set(v.to_string())>{format!("฿{v}")}</button>
                                            }).collect_view()}
                                        </div>
                                        {move || modal_msg.get().map(|(ok, m)| view! { <p class={if ok { "xn-msg ok" } else { "xn-msg" }}>{m}</p> })}
                                        <div class="inf-pay-modal-actions">
                                            <button type="button" class="inf-btn-cancel" on:click=move |_| active_modal.set(None)>"ยกเลิก"</button>
                                            <button type="submit" class="inf-btn-submit" disabled=move || busy.get()>"สร้าง QR Code"</button>
                                        </div>
                                    </form>
                                }.into_any(),
                                Some(rec) => view! {
                                    <div class="inf-pp-result">
                                        <div class="inf-pp-amt-box">
                                            <span class="lbl">"ยอดที่ต้องชำระ"</span>
                                            <strong>{format_thb_2(rec.pay_amount.unwrap_or(rec.amount))}</strong>
                                            <small>{format!("(ยอดเติมจริง ฿{:.0})", rec.amount)}</small>
                                        </div>
                                        {rec.qr_svg.map(|svg| view! {
                                            <div class="inf-pp-qr-frame"><img src=svg alt="PromptPay QR" width="210" height="210"/></div>
                                        })}
                                        <p class="xn-msg ok">"สร้างรายการสำเร็จ! รอการตรวจสอบหรือให้แอดมินอนุมัติในหลังบ้าน"</p>
                                        <div class="inf-pay-modal-actions">
                                            <button type="button" class="inf-btn-cancel" on:click=move |_| active_modal.set(None)>"ปิด"</button>
                                        </div>
                                    </div>
                                }.into_any(),
                            }}
                        </div>
                    </div>
                }.into_any(),
                Some("bank") => view! {
                    <div class="inf-pay-modal-backdrop">
                        <div class="inf-pay-modal-box">
                            <div class="inf-pay-modal-head"><div><h3>"โอนผ่านธนาคาร"</h3><p>"เลือกบัญชีและวางสลิป / QR Payload"</p></div></div>
                            <form class="inf-pay-form" on:submit=on_bank_submit>
                                <label class="inf-pay-label">
                                    <span>"บัญชีธนาคารปลายทาง"</span>
                                    <select prop:value=bank_channel_id on:change=move |ev| bank_channel_id.set(event_target_value(&ev))>
                                        <option value="">"เลือกบัญชี..."</option>
                                        {move || channels_res.get().unwrap_or_default().into_iter().map(|c| view! {
                                            <option value=c.id>{format!("{} · {} ({})", c.name, c.account_no, c.account_name)}</option>
                                        }).collect_view()}
                                    </select>
                                </label>
                                <label class="inf-pay-label">
                                    <span>"จำนวนเงินที่โอน (บาท)"</span>
                                    <input type="number" min="1" step="0.01" required prop:value=bank_amount on:input=move |ev| bank_amount.set(event_target_value(&ev))/>
                                </label>
                                <label class="inf-pay-label">
                                    <span>"ลิงก์รูปภาพสลิป หรือ QR Payload"</span>
                                    <input placeholder="000201... หรือ URL รูปสลิป" prop:value=bank_qr_payload on:input=move |ev| bank_qr_payload.set(event_target_value(&ev))/>
                                </label>
                                {move || modal_msg.get().map(|(ok, m)| view! { <p class={if ok { "xn-msg ok" } else { "xn-msg" }}>{m}</p> })}
                                <div class="inf-pay-modal-actions">
                                    <button type="button" class="inf-btn-cancel" on:click=move |_| active_modal.set(None)>"ยกเลิก"</button>
                                    <button type="submit" class="inf-btn-submit" disabled=move || busy.get()>"ส่งข้อมูลยืนยัน"</button>
                                </div>
                            </form>
                        </div>
                    </div>
                }.into_any(),
                Some("truemoney") => view! {
                    <div class="inf-pay-modal-backdrop">
                        <div class="inf-pay-modal-box">
                            <div class="inf-pay-modal-head"><div><h3>"ซองอั่งเปา TrueMoney"</h3><p>"วางลิงก์ซองของขวัญ TrueMoney Wallet"</p></div></div>
                            <form class="inf-pay-form" on:submit=on_tm_submit>
                                <label class="inf-pay-label">
                                    <span>"ลิงก์ซองอั่งเปา TrueMoney"</span>
                                    <input placeholder="https://gift.truemoney.com/campaign/?v=..." required prop:value=tm_link on:input=move |ev| tm_link.set(event_target_value(&ev))/>
                                </label>
                                {move || modal_msg.get().map(|(ok, m)| view! { <p class={if ok { "xn-msg ok" } else { "xn-msg" }}>{m}</p> })}
                                <div class="inf-pay-modal-actions">
                                    <button type="button" class="inf-btn-cancel" on:click=move |_| active_modal.set(None)>"ยกเลิก"</button>
                                    <button type="submit" class="inf-btn-submit" disabled=move || busy.get()>"ส่งซองอั่งเปา"</button>
                                </div>
                            </form>
                        </div>
                    </div>
                }.into_any(),
                Some("coupon") => view! {
                    <div class="inf-pay-modal-backdrop">
                        <div class="inf-pay-modal-box">
                            <div class="inf-pay-modal-head"><div><h3>"โค้ดอั่งเปา (ร้าน)"</h3><p>"แลกโค้ดเครดิตเข้ากระเป๋าทันที"</p></div></div>
                            <form class="inf-pay-form" on:submit=on_redeem_submit>
                                <label class="inf-pay-label">
                                    <span>"รหัสโค้ดอั่งเปา / คูปองเครดิต"</span>
                                    <input placeholder="เช่น FREE50" required prop:value=redeem_input on:input=move |ev| redeem_input.set(event_target_value(&ev))/>
                                </label>
                                {move || modal_msg.get().map(|(ok, m)| view! { <p class={if ok { "xn-msg ok" } else { "xn-msg" }}>{m}</p> })}
                                <div class="inf-pay-modal-actions">
                                    <button type="button" class="inf-btn-cancel" on:click=move |_| active_modal.set(None)>"ยกเลิก"</button>
                                    <button type="submit" class="inf-btn-submit" disabled=move || busy.get()>"ยืนยันแลกโค้ด"</button>
                                </div>
                            </form>
                        </div>
                    </div>
                }.into_any(),
                _ => ().into_any(),
            }}
        </div>
    }
}

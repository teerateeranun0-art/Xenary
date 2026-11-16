pub mod app;
pub mod client_api;
pub mod components;
pub mod error;
pub mod models;
pub mod pages;

#[cfg(feature = "ssr")]
pub mod api;
#[cfg(feature = "ssr")]
pub mod db;
#[cfg(feature = "ssr")]
pub mod security;

#[cfg(all(test, feature = "ssr"))]
mod tests;

#[cfg(feature = "hydrate")]
#[wasm_bindgen::prelude::wasm_bindgen]
pub fn hydrate() {
    console_error_panic_hook::set_once();
    leptos::mount::hydrate_body(app::App);
}

//! Crate entry for the charting engine.
//!
//! This file only declares module boundaries so domain logic stays distributed
//! in focused files instead of accumulating here.

pub mod api;
pub mod chart;
pub mod drawings;
pub mod indicators;
pub mod layout;
pub mod plots;
pub mod render;
pub mod scale;
pub mod types;
pub mod viewport;

pub use api::wasm::WasmChart;

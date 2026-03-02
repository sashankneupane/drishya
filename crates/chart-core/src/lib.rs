//! Crate entry for the charting engine.
//!
//! This file only declares module boundaries so domain logic stays distributed
//! in focused files instead of accumulating here.

pub mod api;
pub mod chart;
pub mod drawings;
pub mod events;
pub mod indicators;
pub mod layout;
pub mod plots;
pub mod render;
pub mod replay;
pub mod runtime;
pub mod scale;
pub mod types;
pub mod viewport;

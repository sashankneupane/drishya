//! Chart domain module.
//!
//! This module owns chart state and composes behavior from focused submodules:
//! - `state`: data lifecycle and viewport slicing
//! - `interaction`: pan/zoom and user-driven drawing placement
//! - `scene`: translation from chart state to render commands
//!
//! Keeping the public `Chart` type here provides a stable surface for callers
//! while allowing internals to evolve without creating a monolithic file.

pub mod interaction;
pub mod scene;
pub mod state;

use crate::{
    drawings::store::DrawingStore,
    types::{Candle, Size},
    viewport::Viewport,
};

pub struct Chart {
    pub size: Size,
    pub candles: Vec<Candle>,
    pub viewport: Option<Viewport>,
    // Drawings are intentionally private so all changes can flow through the
    // command layer (`drawings::commands`) instead of ad-hoc mutations.
    drawings: DrawingStore,
}

impl Chart {
    pub fn new(width: f32, height: f32) -> Self {
        Self {
            size: Size { width, height },
            candles: Vec::new(),
            viewport: None,
            drawings: DrawingStore::new(),
        }
    }
}
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
pub mod plots;
pub mod scene;
pub mod state;

use crate::{
    drawings::store::DrawingStore,
    plots::provider::PlotDataProvider,
    types::{Candle, Size},
    viewport::Viewport,
};
use std::collections::{HashMap, HashSet};

pub struct Chart {
    pub size: Size,
    pub candles: Vec<Candle>,
    pub viewport: Option<Viewport>,
    plot_providers: Vec<Box<dyn PlotDataProvider>>,
    pane_weights: HashMap<String, f32>,
    pane_order: Vec<String>,
    hidden_panes: HashSet<String>,
    collapsed_panes: HashSet<String>,
    pane_y_axis_visible: HashMap<String, bool>,
    pane_min_heights: HashMap<String, f32>,
    pane_max_heights: HashMap<String, f32>,
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
            plot_providers: Vec::new(),
            pane_weights: HashMap::new(),
            pane_order: Vec::new(),
            hidden_panes: HashSet::new(),
            collapsed_panes: HashSet::new(),
            pane_y_axis_visible: HashMap::new(),
            pane_min_heights: HashMap::new(),
            pane_max_heights: HashMap::new(),
            drawings: DrawingStore::new(),
        }
    }
}

//! Chart domain module.
//!
//! This module owns chart state and composes behavior from focused submodules:
//! - `state`: data lifecycle and viewport slicing
//! - `interaction`: pan/zoom and user-driven drawing placement
//! - `scene`: translation from chart state to render commands
//!
//! Keeping the public `Chart` type here provides a stable surface for callers
//! while allowing internals to evolve without creating a monolithic file.

pub mod hit_test;
pub mod interaction;
pub mod plots;
pub mod scene;
pub mod state;
pub mod tools;

use self::tools::{DrawingInteractionState, DrawingToolMode};
use crate::{
    drawings::store::DrawingStore,
    plots::model::PaneId,
    plots::provider::PlotDataProvider,
    render::candles::CandleBodyStyle,
    render::styles::ThemeId,
    types::{Candle, Point, Size},
    viewport::Viewport,
};
use std::collections::{HashMap, HashSet};

pub struct Chart {
    pub size: Size,
    pub candles: Vec<Candle>,
    pub viewport: Option<Viewport>,
    plot_providers: Vec<Box<dyn PlotDataProvider>>,
    pane_registry: Vec<String>,
    pane_weights: HashMap<String, f32>,
    pane_order: Vec<String>,
    hidden_panes: HashSet<String>,
    hidden_series: HashSet<String>,
    deleted_series: HashSet<String>,
    collapsed_panes: HashSet<String>,
    pane_y_axis_visible: HashMap<String, bool>,
    pane_min_heights: HashMap<String, f32>,
    pane_max_heights: HashMap<String, f32>,
    pane_y_zoom_factors: HashMap<String, f32>,
    pane_y_pan_factors: HashMap<String, f32>,
    crosshair: Option<Point>,
    theme: ThemeId,
    candle_body_style: CandleBodyStyle,
    drawing_tool_mode: DrawingToolMode,
    drawing_interaction: DrawingInteractionState,
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
            pane_registry: Vec::new(),
            pane_weights: HashMap::new(),
            pane_order: Vec::new(),
            hidden_panes: HashSet::new(),
            hidden_series: HashSet::new(),
            deleted_series: HashSet::new(),
            collapsed_panes: HashSet::new(),
            pane_y_axis_visible: HashMap::new(),
            pane_min_heights: HashMap::new(),
            pane_max_heights: HashMap::new(),
            pane_y_zoom_factors: HashMap::new(),
            pane_y_pan_factors: HashMap::new(),
            crosshair: None,
            theme: ThemeId::Dark,
            candle_body_style: CandleBodyStyle::Solid,
            drawing_tool_mode: DrawingToolMode::Select,
            drawing_interaction: DrawingInteractionState::default(),
            drawings: DrawingStore::new(),
        }
    }

    pub fn set_theme(&mut self, theme: ThemeId) {
        self.theme = theme;
    }

    pub fn theme(&self) -> ThemeId {
        self.theme
    }

    pub fn set_candle_body_style(&mut self, style: CandleBodyStyle) {
        self.candle_body_style = style;
    }

    pub fn candle_body_style(&self) -> CandleBodyStyle {
        self.candle_body_style
    }

    pub(crate) fn pane_y_zoom_factor(&self, pane_id: &PaneId) -> f32 {
        let key = pane_zoom_key(pane_id);
        self.pane_y_zoom_factors.get(key).copied().unwrap_or(1.0)
    }

    pub(crate) fn set_pane_y_zoom_factor(&mut self, pane_id: &PaneId, factor: f32) {
        let key = pane_zoom_key(pane_id).to_string();
        self.pane_y_zoom_factors
            .insert(key, factor.clamp(0.2, 10.0));
    }

    pub(crate) fn pane_y_pan_factor(&self, pane_id: &PaneId) -> f32 {
        let key = pane_zoom_key(pane_id);
        self.pane_y_pan_factors.get(key).copied().unwrap_or(0.0)
    }

    pub(crate) fn set_pane_y_pan_factor(&mut self, pane_id: &PaneId, factor: f32) {
        let key = pane_zoom_key(pane_id).to_string();
        self.pane_y_pan_factors
            .insert(key, factor.clamp(-20.0, 20.0));
    }
}

fn pane_zoom_key(pane_id: &PaneId) -> &str {
    match pane_id {
        PaneId::Price => "price",
        PaneId::Named(name) => name.as_str(),
    }
}

//! Chart domain module.
//!
//! This module owns chart state and composes behavior from focused submodules:
//! - `state`: data lifecycle and viewport slicing
//! - `interaction`: pan/zoom and user-driven drawing placement
//! - `scene`: translation from chart state to render commands
//!
//! Keeping the public `Chart` type here provides a stable surface for callers
//! while allowing internals to evolve without creating a monolithic file.

pub mod anchors;
pub mod appearance;
pub mod compare;
pub mod compare_alignment;
pub mod hit_test;
pub mod interaction;
pub mod panes;
pub mod persistence;
pub mod plots;
pub mod scene;
pub mod state;
pub mod tools;

use self::appearance::ChartAppearanceConfig;
use self::compare::CompareRegistry;
use self::tools::{DrawingInteractionState, DrawingToolMode};
use crate::{
    drawings::store::DrawingStore,
    plots::model::PaneId,
    plots::provider::PlotDataProvider,
    render::candles::CandleBodyStyle,
    render::styles::ThemeId,
    types::{Candle, CursorMode, Point, Size},
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
    cursor_mode: CursorMode,
    theme: ThemeId,
    candle_body_style: CandleBodyStyle,
    drawing_tool_mode: DrawingToolMode,
    drawing_interaction: DrawingInteractionState,
    selected_drawing_id: Option<u64>,
    selected_series_id: Option<String>,
    appearance_config: ChartAppearanceConfig,
    pub price_axis_mode: crate::scale::PriceAxisMode,
    pub percent_baseline_policy: crate::scale::PercentBaselinePolicy,
    pub(crate) derived_percent_baseline_price: std::cell::RefCell<Option<f64>>,
    // Drawings are intentionally private so all changes can flow through the
    // command layer (`drawings::commands`) instead of ad-hoc mutations.
    drawings: DrawingStore,
    compare_registry: CompareRegistry,
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
            cursor_mode: CursorMode::Crosshair,
            theme: ThemeId::Dark,
            candle_body_style: CandleBodyStyle::Solid,
            drawing_tool_mode: DrawingToolMode::Select,
            drawing_interaction: DrawingInteractionState::default(),
            selected_drawing_id: None,
            selected_series_id: None,
            appearance_config: ChartAppearanceConfig::default(),
            price_axis_mode: crate::scale::PriceAxisMode::Linear,
            percent_baseline_policy: crate::scale::PercentBaselinePolicy::default(),
            derived_percent_baseline_price: std::cell::RefCell::new(None),
            drawings: DrawingStore::new(),
            compare_registry: CompareRegistry::new(),
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

    pub fn set_cursor_mode(&mut self, mode: CursorMode) {
        self.cursor_mode = mode;
    }

    pub fn cursor_mode(&self) -> CursorMode {
        self.cursor_mode
    }

    pub fn set_appearance_config(&mut self, config: ChartAppearanceConfig) {
        if config.validate().is_ok() {
            self.appearance_config = config;
        }
    }

    pub fn appearance_config(&self) -> &ChartAppearanceConfig {
        &self.appearance_config
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

    pub fn drawings(&self) -> &DrawingStore {
        &self.drawings
    }

    pub fn price_axis_mode(&self) -> crate::scale::PriceAxisMode {
        self.price_axis_mode
    }

    pub fn set_price_axis_mode(&mut self, mode: crate::scale::PriceAxisMode) {
        self.price_axis_mode = mode;
    }

    pub fn percent_baseline_policy(&self) -> crate::scale::PercentBaselinePolicy {
        self.percent_baseline_policy
    }

    pub fn set_percent_baseline_policy(&mut self, policy: crate::scale::PercentBaselinePolicy) {
        self.percent_baseline_policy = policy;
    }

    pub fn derived_percent_baseline_price(&self) -> Option<f64> {
        *self.derived_percent_baseline_price.borrow()
    }

    pub fn register_compare_series(&mut self, symbol: &str, name: &str, color: &str) -> String {
        self.compare_registry.register(symbol, name, color)
    }

    pub fn remove_compare_series(&mut self, id: &str) -> bool {
        self.compare_registry.remove(id)
    }

    pub fn set_compare_series_candles(&mut self, id: &str, candles: Vec<Candle>) -> bool {
        self.compare_registry.set_candles(id, candles)
    }

    pub fn set_compare_series_visible(&mut self, id: &str, visible: bool) -> bool {
        self.compare_registry.set_visible(id, visible)
    }

    pub(crate) fn compare_registry(&self) -> &CompareRegistry {
        &self.compare_registry
    }
}

fn pane_zoom_key(pane_id: &PaneId) -> &str {
    match pane_id {
        PaneId::Price => "price",
        PaneId::Named(name) => name.as_str(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::Candle;

    #[test]
    fn chart_percent_baseline_derivation() {
        let mut chart = Chart::new(1000.0, 500.0);
        chart.candles = vec![
            Candle {
                ts: 100,
                open: 10.0,
                high: 12.0,
                low: 9.0,
                close: 11.0,
                volume: 100.0,
            },
            Candle {
                ts: 200,
                open: 11.0,
                high: 15.0,
                low: 10.0,
                close: 14.0,
                volume: 100.0,
            },
            Candle {
                ts: 300,
                open: 14.0,
                high: 20.0,
                low: 13.0,
                close: 18.0,
                volume: 100.0,
            },
        ];

        // Initial state: Linear, no baseline
        assert_eq!(chart.derived_percent_baseline_price(), None);

        // Switch to Percent mode
        chart.set_price_axis_mode(crate::scale::PriceAxisMode::Percent);

        // Setup viewport to see all candles
        chart.set_viewport_world_range(0.0, 10.0); // very wide to see all

        // Trigger build_draw_commands (this is where baseline is calculated in scene/mod.rs)
        let _ = chart.build_draw_commands();

        // First candle close is 11.0
        assert_eq!(chart.derived_percent_baseline_price(), Some(11.0));

        // Pan viewport so first visible candle is the second one
        chart.set_viewport_world_range(1.0, 10.0);
        let _ = chart.build_draw_commands();

        // Second candle close is 14.0
        assert_eq!(chart.derived_percent_baseline_price(), Some(14.0));
    }
}

//! WASM adapter for web usage.
//!
//! `WasmChart` is intentionally a thin bridge that:
//! 1) marshals browser/JS inputs into chart-domain calls
//! 2) asks the domain to build a scene (`DrawCommand`s)
//! 3) delegates painting to a render backend
//!
//! This keeps chart logic testable in Rust without browser dependencies.

use wasm_bindgen::prelude::*;
use web_sys::{CanvasRenderingContext2d, HtmlCanvasElement};

use crate::{
    chart::plots::PaneLayoutState,
    chart::Chart,
    indicators::api as indicator_api,
    plots::model::PaneId,
    render::{backends::canvas2d::paint_canvas2d, styles::ThemeId},
    types::Candle,
};

#[wasm_bindgen]
pub struct WasmChart {
    chart: Chart,
    canvas: HtmlCanvasElement,
    ctx: CanvasRenderingContext2d,
}

#[wasm_bindgen]
impl WasmChart {
    #[wasm_bindgen(constructor)]
    pub fn new(canvas_id: &str, width: u32, height: u32) -> Result<WasmChart, JsValue> {
        // Validate browser handles eagerly so JS gets immediate constructor
        // errors instead of delayed failures during the first draw.
        let window = web_sys::window().ok_or_else(|| JsValue::from_str("No window"))?;
        let document = window
            .document()
            .ok_or_else(|| JsValue::from_str("No document"))?;

        let el = document
            .get_element_by_id(canvas_id)
            .ok_or_else(|| JsValue::from_str("Canvas not found"))?;

        let canvas: HtmlCanvasElement = el.dyn_into::<HtmlCanvasElement>()?;

        let ctx = canvas
            .get_context("2d")?
            .ok_or_else(|| JsValue::from_str("2D context missing"))?
            .dyn_into::<CanvasRenderingContext2d>()?;

        let chart = Self {
            chart: Chart::new(width as f32, height as f32),
            canvas,
            ctx,
        };

        chart.set_cursor_select();
        Ok(chart)
    }

    pub fn resize(&mut self, width: u32, height: u32) {
        self.chart.set_size(width as f32, height as f32);
    }

    /// Pass JSON array of candles:
    /// [{"ts":1,"open":100.0,"high":101.0,"low":99.5,"close":100.5,"volume":1200.0}, ...]
    pub fn set_ohlcv_json(&mut self, json: &str) -> Result<(), JsValue> {
        let data: Vec<Candle> = serde_json::from_str(json)
            .map_err(|e| JsValue::from_str(&format!("Invalid OHLCV JSON: {e}")))?;
        self.chart.set_data(data);
        Ok(())
    }

    pub fn pan_pixels(&mut self, dx: f32) {
        self.chart.pan_pixels(dx);
    }

    pub fn pan_pixels_2d(&mut self, dx: f32, dy: f32, anchor_y: f32) {
        self.chart.pan_pixels_2d(dx, dy, anchor_y);
    }

    /// zoom_factor < 1.0 => zoom in, > 1.0 => zoom out
    pub fn zoom_at_x(&mut self, x: f32, zoom_factor: f32) {
        self.chart.zoom_at_x(x, zoom_factor);
    }

    /// zoom_factor < 1.0 => zoom in, > 1.0 => zoom out for the pane under `y`.
    pub fn zoom_y_axis_at(&mut self, y: f32, zoom_factor: f32) {
        self.chart.zoom_y_axis_at(y, zoom_factor);
    }

    /// Resets y-axis zoom factor for a pane id (`price`, `rsi`, etc.).
    pub fn reset_y_axis_zoom(&mut self, pane_id: &str) {
        self.chart.reset_y_axis_zoom(pane_id);
    }

    pub fn set_theme(&mut self, theme: &str) {
        match theme.to_ascii_lowercase().as_str() {
            "light" => self.chart.set_theme(ThemeId::Light),
            _ => self.chart.set_theme(ThemeId::Dark),
        }
    }

    // -------- Drawing tools --------

    /// Add a horizontal line at the clicked Y position (CSS pixel space).
    pub fn add_horizontal_line_at_y(&mut self, y: f32) {
        self.chart.add_horizontal_line_at_y(y);
    }

    /// Add a vertical line at the clicked X position (CSS pixel space).
    pub fn add_vertical_line_at_x(&mut self, x: f32) {
        self.chart.add_vertical_line_at_x(x);
    }

    /// Optional helpers you can use later from JS
    pub fn clear_drawings(&mut self) {
        self.chart.clear_drawings();
    }

    /// Sets crosshair position in CSS pixel space.
    pub fn set_crosshair_at(&mut self, x: f32, y: f32) {
        self.chart.set_crosshair_at(x, y);
    }

    /// Clears crosshair overlay.
    pub fn clear_crosshair(&mut self) {
        self.chart.clear_crosshair();
    }

    pub fn set_cursor_select(&self) {
        self.set_canvas_cursor("crosshair");
    }

    pub fn set_cursor_default(&self) {
        self.set_canvas_cursor("default");
    }

    pub fn set_cursor_grabbing(&self) {
        self.set_canvas_cursor("grabbing");
    }

    pub fn set_cursor_row_resize(&self) {
        self.set_canvas_cursor("row-resize");
    }

    pub fn set_cursor_ns_resize(&self) {
        self.set_canvas_cursor("ns-resize");
    }

    pub fn set_cursor_ew_resize(&self) {
        self.set_canvas_cursor("ew-resize");
    }

    /// Adds a Simple Moving Average overlay.
    pub fn add_sma_overlay(&mut self, period: u32) {
        indicator_api::add_sma(&mut self.chart, period as usize);
    }

    /// Adds Bollinger Bands overlay.
    pub fn add_bbands_overlay(&mut self, period: u32, std_mult: f64) {
        indicator_api::add_bbands(&mut self.chart, period as usize, std_mult);
    }

    /// Adds a momentum histogram overlay.
    pub fn add_momentum_histogram_overlay(&mut self) {
        indicator_api::add_momentum_histogram(&mut self.chart);
    }

    /// Adds RSI on a separate bottom pane.
    pub fn add_rsi_pane_indicator(&mut self, period: u32) {
        indicator_api::add_rsi(&mut self.chart, period as usize);
    }

    /// Clears all active indicator overlays.
    pub fn clear_indicator_overlays(&mut self) {
        indicator_api::clear_builtins(&mut self.chart);
    }

    /// Sets pane size ratio weight for layout. Use `price` for the main pane,
    /// or the named pane id such as `rsi` / `momentum`.
    pub fn set_pane_weight(&mut self, pane_id: &str, ratio: f32) {
        self.chart.set_pane_weight(pane_id, ratio);
    }

    /// Sets many pane weight ratios in one call from a JSON object map.
    /// Example: {"price": 3.0, "rsi": 1.0, "momentum": 1.0}
    pub fn set_pane_weights_json(&mut self, json: &str) -> Result<(), JsValue> {
        let weights: std::collections::BTreeMap<String, f32> = serde_json::from_str(json)
            .map_err(|e| JsValue::from_str(&format!("Invalid pane-weights JSON: {e}")))?;
        self.chart.set_pane_weights(weights);
        Ok(())
    }

    /// Restores default pane sizing ratios.
    pub fn reset_pane_weights(&mut self) {
        self.chart.clear_pane_weights();
    }

    /// Sets pane visibility (`true` visible, `false` hidden). Price pane cannot be hidden.
    pub fn set_pane_visible(&mut self, pane_id: &str, visible: bool) {
        self.chart.set_pane_visibility(pane_id, visible);
    }

    /// Explicitly registers a named pane in the engine registry.
    pub fn register_pane(&mut self, pane_id: &str) {
        self.chart.register_named_pane(pane_id);
    }

    /// Unregisters a named pane from the engine registry.
    pub fn unregister_pane(&mut self, pane_id: &str) {
        self.chart.unregister_named_pane(pane_id);
    }

    /// Returns registered named panes as JSON array.
    pub fn registered_panes_json(&self) -> Result<String, JsValue> {
        serde_json::to_string(&self.chart.registered_named_panes())
            .map_err(|e| JsValue::from_str(&format!("Failed to serialize registered panes: {e}")))
    }

    /// Collapses/expands a pane. Collapsed panes keep a small fixed height.
    pub fn set_pane_collapsed(&mut self, pane_id: &str, collapsed: bool) {
        self.chart.set_pane_collapsed(pane_id, collapsed);
    }

    /// Toggles y-axis labels per pane.
    pub fn set_pane_y_axis_visible(&mut self, pane_id: &str, visible: bool) {
        self.chart.set_pane_y_axis_visible(pane_id, visible);
    }

    /// Sets pane min/max height constraints in pixels. Pass <= 0 to clear a bound.
    pub fn set_pane_height_constraints(
        &mut self,
        pane_id: &str,
        min_height_px: f32,
        max_height_px: f32,
    ) {
        let min_bound = if min_height_px > 0.0 {
            Some(min_height_px)
        } else {
            None
        };
        let max_bound = if max_height_px > 0.0 {
            Some(max_height_px)
        } else {
            None
        };
        self.chart
            .set_pane_height_constraints(pane_id, min_bound, max_bound);
    }

    /// Moves a named pane up in display order.
    pub fn move_pane_up(&mut self, pane_id: &str) -> bool {
        self.chart.move_named_pane_up(pane_id)
    }

    /// Moves a named pane down in display order.
    pub fn move_pane_down(&mut self, pane_id: &str) -> bool {
        self.chart.move_named_pane_down(pane_id)
    }

    /// Sets full named-pane order from JSON array. `price` is ignored and stays first.
    pub fn set_pane_order_json(&mut self, json: &str) -> Result<(), JsValue> {
        let order: Vec<String> = serde_json::from_str(json)
            .map_err(|e| JsValue::from_str(&format!("Invalid pane-order JSON: {e}")))?;
        self.chart.set_pane_order(order);
        Ok(())
    }

    /// Exports pane layout state for persistence.
    pub fn pane_state_json(&self) -> Result<String, JsValue> {
        let state = self.chart.export_pane_layout_state();
        serde_json::to_string(&state)
            .map_err(|e| JsValue::from_str(&format!("Failed to serialize pane state: {e}")))
    }

    /// Restores pane layout state from JSON.
    pub fn restore_pane_state_json(&mut self, json: &str) -> Result<(), JsValue> {
        let state: PaneLayoutState = serde_json::from_str(json)
            .map_err(|e| JsValue::from_str(&format!("Invalid pane-state JSON: {e}")))?;
        self.chart.restore_pane_layout_state(state);
        Ok(())
    }

    /// Clears all pane customization and reverts to defaults.
    pub fn reset_pane_layout_state(&mut self) {
        self.chart.clear_pane_layout_state();
    }

    /// Returns current pane layout geometry as JSON for interaction overlays.
    pub fn pane_layouts_json(&self) -> Result<String, JsValue> {
        let layout = self.chart.current_layout();
        let panes = layout
            .panes
            .iter()
            .map(|pane| {
                serde_json::json!({
                    "id": pane_id_label(&pane.id),
                    "x": pane.rect.x,
                    "y": pane.rect.y,
                    "w": pane.rect.w,
                    "h": pane.rect.h,
                    "yAxisVisible": pane.y_axis == crate::layout::AxisVisibilityPolicy::Visible,
                })
            })
            .collect::<Vec<_>>();

        serde_json::to_string(&serde_json::json!({ "panes": panes }))
            .map_err(|e| JsValue::from_str(&format!("Failed to serialize pane layout: {e}")))
    }

    // -------- Rendering --------

    pub fn draw(&self) -> Result<(), JsValue> {
        // Domain builds a backend-agnostic scene; backend handles paint.
        let cmds = self.chart.build_draw_commands();
        paint_canvas2d(&self.ctx, &self.canvas, &cmds, self.chart.theme())
    }
}

impl WasmChart {
    fn set_canvas_cursor(&self, cursor: &str) {
        let _ = self.canvas.style().set_property("cursor", cursor);
    }
}

fn pane_id_label(pane_id: &PaneId) -> String {
    match pane_id {
        PaneId::Price => "price".to_string(),
        PaneId::Named(name) => name.clone(),
    }
}

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
    chart::tools::DrawingToolMode,
    chart::Chart,
    drawings::hit_test::{HitToleranceProfile, InteractionMode},
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

    /// Sets native drawing tool mode (`select`, `hline`, `vline`, `rectangle`, `long`, `short`).
    pub fn set_drawing_tool_mode(&mut self, mode: &str) -> Result<(), JsValue> {
        let mode = parse_drawing_tool_mode(mode)?;
        self.chart.set_drawing_tool_mode(mode);
        Ok(())
    }

    /// Returns current native drawing tool mode label.
    pub fn drawing_tool_mode(&self) -> String {
        match self.chart.drawing_tool_mode() {
            DrawingToolMode::Select => "select",
            DrawingToolMode::HorizontalLine => "hline",
            DrawingToolMode::VerticalLine => "vline",
            DrawingToolMode::Ray => "ray",
            DrawingToolMode::Rectangle => "rectangle",
            DrawingToolMode::FibRetracement => "fib",
            DrawingToolMode::LongPosition => "long",
            DrawingToolMode::ShortPosition => "short",
        }
        .to_string()
    }

    /// Native drawing pointer lifecycle: down.
    pub fn drawing_pointer_down(&mut self, x: f32, y: f32) -> bool {
        self.chart.drawing_pointer_down(x, y)
    }

    /// Native drawing pointer lifecycle: move.
    pub fn drawing_pointer_move(&mut self, x: f32, y: f32) -> bool {
        self.chart.drawing_pointer_move(x, y)
    }

    /// Native drawing pointer lifecycle: up.
    pub fn drawing_pointer_up(&mut self, x: f32, y: f32) -> bool {
        self.chart.drawing_pointer_up(x, y)
    }

    /// Returns native cursor hint for current drawing mode and hover target.
    pub fn drawing_cursor_hint(&self, x: f32, y: f32) -> String {
        self.chart.drawing_cursor_hint_at(x, y).to_string()
    }

    /// Returns true when the pointer is inside the native object-tree panel.
    pub fn point_in_object_tree(&self, x: f32, y: f32) -> bool {
        self.chart.point_in_chart_object_tree(x, y)
    }

    /// Cancels active native drawing interaction.
    pub fn cancel_drawing_interaction(&mut self) {
        self.chart.cancel_drawing_interaction();
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

    /// Add a rectangle drawing centered at clicked position.
    pub fn add_rectangle_at(&mut self, x: f32, y: f32) {
        self.chart.add_rectangle_at(x, y);
    }

    /// Add a rectangle drawing from two pixel points.
    pub fn add_rectangle_from_pixels(&mut self, x1: f32, y1: f32, x2: f32, y2: f32) {
        self.chart.add_rectangle_from_pixels(x1, y1, x2, y2);
    }

    /// Add a fib-retracement drawing centered at clicked position.
    pub fn add_fib_retracement_at(&mut self, x: f32, y: f32) {
        self.chart.add_fib_retracement_at(x, y);
    }

    /// Add a fib-retracement drawing from two pixel points.
    pub fn add_fib_retracement_from_pixels(&mut self, x1: f32, y1: f32, x2: f32, y2: f32) {
        self.chart.add_fib_retracement_from_pixels(x1, y1, x2, y2);
    }

    /// Add a long-position drawing centered at clicked position.
    pub fn add_long_position_at(&mut self, x: f32, y: f32) {
        self.chart.add_long_position_at(x, y);
    }

    /// Add a long-position drawing from two pixel points.
    pub fn add_long_position_from_pixels(&mut self, x1: f32, y1: f32, x2: f32, y2: f32) {
        self.chart.add_long_position_from_pixels(x1, y1, x2, y2);
    }

    /// Add a short-position drawing centered at clicked position.
    pub fn add_short_position_at(&mut self, x: f32, y: f32) {
        self.chart.add_short_position_at(x, y);
    }

    /// Add a short-position drawing from two pixel points.
    pub fn add_short_position_from_pixels(&mut self, x1: f32, y1: f32, x2: f32, y2: f32) {
        self.chart.add_short_position_from_pixels(x1, y1, x2, y2);
    }

    /// Moves a drawing by drag deltas in pixel space.
    pub fn move_drawing_by_pixels(&mut self, drawing_id: u64, dx: f32, dy: f32) -> bool {
        self.chart.move_drawing_by_pixels(drawing_id, dx, dy)
    }

    /// Optional helpers you can use later from JS
    pub fn clear_drawings(&mut self) {
        self.chart.clear_drawings();
    }

    /// Assigns a drawing to a layer id. Creates layer if needed.
    pub fn set_drawing_layer(&mut self, drawing_id: u64, layer_id: &str) -> bool {
        self.chart.set_drawing_layer(drawing_id, layer_id)
    }

    /// Assigns or clears a drawing group id.
    pub fn set_drawing_group(&mut self, drawing_id: u64, group_id: &str) -> bool {
        let group = if group_id.trim().is_empty() {
            None
        } else {
            Some(group_id)
        };
        self.chart.set_drawing_group(drawing_id, group)
    }

    /// Sets layer visibility (`true` visible, `false` hidden).
    pub fn set_drawing_layer_visible(&mut self, layer_id: &str, visible: bool) {
        self.chart.set_drawing_layer_visible(layer_id, visible);
    }

    /// Sets group visibility (`true` visible, `false` hidden).
    pub fn set_drawing_group_visible(&mut self, group_id: &str, visible: bool) {
        self.chart.set_drawing_group_visible(group_id, visible);
    }

    /// Sets full drawing layer order from JSON array.
    pub fn set_drawing_layer_order_json(&mut self, json: &str) -> Result<(), JsValue> {
        let order: Vec<String> = serde_json::from_str(json)
            .map_err(|e| JsValue::from_str(&format!("Invalid drawing-layer-order JSON: {e}")))?;
        self.chart.set_drawing_layer_order(order);
        Ok(())
    }

    /// Returns current drawing layer order as JSON array.
    pub fn drawing_layer_order_json(&self) -> Result<String, JsValue> {
        serde_json::to_string(&self.chart.drawing_layer_order()).map_err(|e| {
            JsValue::from_str(&format!("Failed to serialize drawing layer order: {e}"))
        })
    }

    /// Hit-tests drawings at cursor position and returns structured JSON.
    /// `mode` must be one of: `hover`, `select`, `drag`.
    pub fn hit_test_drawings_json(&self, x: f32, y: f32, mode: &str) -> Result<String, JsValue> {
        let interaction_mode = parse_interaction_mode(mode)?;
        let hit = self.chart.hit_test_drawings(x, y, interaction_mode);
        serde_json::to_string(&hit)
            .map_err(|e| JsValue::from_str(&format!("Failed to serialize drawing hit: {e}")))
    }

    /// Hit-tests drawings with custom tolerance profile and returns structured JSON.
    pub fn hit_test_drawings_with_tolerance_json(
        &self,
        x: f32,
        y: f32,
        mode: &str,
        hover_tolerance_px: f32,
        select_tolerance_px: f32,
        drag_tolerance_px: f32,
    ) -> Result<String, JsValue> {
        let interaction_mode = parse_interaction_mode(mode)?;
        let profile = HitToleranceProfile {
            hover_px: hover_tolerance_px,
            select_px: select_tolerance_px,
            drag_px: drag_tolerance_px,
        };

        let hit = self
            .chart
            .hit_test_drawings_with_profile(x, y, interaction_mode, profile);
        serde_json::to_string(&hit)
            .map_err(|e| JsValue::from_str(&format!("Failed to serialize drawing hit: {e}")))
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

fn parse_interaction_mode(mode: &str) -> Result<InteractionMode, JsValue> {
    match mode.trim().to_ascii_lowercase().as_str() {
        "hover" => Ok(InteractionMode::Hover),
        "select" => Ok(InteractionMode::Select),
        "drag" => Ok(InteractionMode::Drag),
        other => Err(JsValue::from_str(&format!(
            "Invalid interaction mode '{other}'. Use one of: hover, select, drag"
        ))),
    }
}

fn parse_drawing_tool_mode(mode: &str) -> Result<DrawingToolMode, JsValue> {
    match mode.trim().to_ascii_lowercase().as_str() {
        "select" => Ok(DrawingToolMode::Select),
        "hline" => Ok(DrawingToolMode::HorizontalLine),
        "vline" => Ok(DrawingToolMode::VerticalLine),
        "ray" => Ok(DrawingToolMode::Ray),
        "rectangle" => Ok(DrawingToolMode::Rectangle),
        "fib" => Ok(DrawingToolMode::FibRetracement),
        "long" => Ok(DrawingToolMode::LongPosition),
        "short" => Ok(DrawingToolMode::ShortPosition),
        other => Err(JsValue::from_str(&format!(
            "Invalid drawing tool mode '{other}'. Use: select, hline, vline, ray, rectangle, fib, long, short"
        ))),
    }
}

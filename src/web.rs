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

use crate::drawings::types::StrokeType;
use crate::{
    chart::appearance::ChartAppearanceConfig,
    chart::plots::PaneLayoutState,
    chart::tools::DrawingToolMode,
    chart::Chart,
    drawings::hit_test::{HitToleranceProfile, InteractionMode},
    indicators::api as indicator_api,
    plots::model::PaneId,
    render::{backends::canvas2d::paint_canvas2d, candles::CandleBodyStyle, styles::ThemeId},
    types::{Candle, CursorMode},
};
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
struct DrawingConfigJson {
    stroke_color: Option<String>,
    fill_color: Option<String>,
    fill_opacity: Option<f32>,
    stroke_width: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    stroke_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    font_size: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    text_content: Option<String>,
    locked: bool,
    supports_fill: bool,
}

#[derive(Debug, Clone, Serialize)]
struct PaneTreeState {
    id: String,
    visible: bool,
}

#[derive(Debug, Clone, Serialize)]
struct SeriesTreeState {
    id: String,
    name: String,
    pane_id: String,
    visible: bool,
    deleted: bool,
}

#[derive(Debug, Clone, Serialize)]
struct DrawingTreeState {
    id: u64,
    kind: String,
    layer_id: String,
    group_id: Option<String>,
    visible: bool,
    locked: bool,
}

#[derive(Debug, Clone, Serialize)]
struct LayerTreeState {
    id: String,
    name: String,
    visible: bool,
    locked: bool,
    order: i32,
}

#[derive(Debug, Clone, Serialize)]
struct GroupTreeState {
    id: String,
    name: String,
    layer_id: String,
    parent_group_id: Option<String>,
    visible: bool,
    locked: bool,
    order: i32,
}

#[derive(Debug, Clone, Serialize)]
struct ObjectTreeState {
    panes: Vec<PaneTreeState>,
    series: Vec<SeriesTreeState>,
    layers: Vec<LayerTreeState>,
    groups: Vec<GroupTreeState>,
    drawings: Vec<DrawingTreeState>,
}

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

    /// Upserts one streaming candle from JSON object:
    /// {"ts":1,"open":100.0,"high":101.0,"low":99.5,"close":100.5,"volume":1200.0}
    pub fn append_ohlcv_json(&mut self, json: &str) -> Result<(), JsValue> {
        let candle: Candle = serde_json::from_str(json)
            .map_err(|e| JsValue::from_str(&format!("Invalid OHLCV JSON candle: {e}")))?;
        self.chart.upsert_candle(candle);
        Ok(())
    }

    /// Upserts many streaming candles from JSON array.
    pub fn append_ohlcv_batch_json(&mut self, json: &str) -> Result<(), JsValue> {
        let candles: Vec<Candle> = serde_json::from_str(json)
            .map_err(|e| JsValue::from_str(&format!("Invalid OHLCV JSON candle batch: {e}")))?;
        self.chart.upsert_candles(candles);
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

    /// Sets chart appearance config from JSON.
    /// Expects: {"background":"#030712","candle_up":"#22c55e","candle_down":"#ef4444"}
    /// Invalid values are rejected silently.
    pub fn set_appearance_config(&mut self, json: &str) -> Result<(), JsValue> {
        let config: ChartAppearanceConfig = serde_json::from_str(json)
            .map_err(|e| JsValue::from_str(&format!("Invalid appearance config JSON: {e}")))?;
        config.validate().map_err(|e| JsValue::from_str(&e))?;
        self.chart.set_appearance_config(config);
        Ok(())
    }

    /// Returns current chart appearance config as JSON.
    pub fn appearance_config(&self) -> Result<String, JsValue> {
        serde_json::to_string(self.chart.appearance_config())
            .map_err(|e| JsValue::from_str(&format!("Failed to serialize appearance config: {e}")))
    }

    /// Sets candle body style (`solid` | `hollow`).
    pub fn set_candle_style(&mut self, style: &str) {
        let style = match style.to_ascii_lowercase().as_str() {
            "hollow" => CandleBodyStyle::Hollow,
            "bars" => CandleBodyStyle::Bars,
            "volume" | "volume_candles" => CandleBodyStyle::Volume,
            _ => CandleBodyStyle::Solid,
        };
        self.chart.set_candle_body_style(style);
    }

    /// Returns current candle body style label.
    pub fn candle_style(&self) -> String {
        match self.chart.candle_body_style() {
            CandleBodyStyle::Solid => "solid",
            CandleBodyStyle::Hollow => "hollow",
            CandleBodyStyle::Bars => "bars",
            CandleBodyStyle::Volume => "volume",
        }
        .to_string()
    }

    /// Sets native drawing tool mode.
    pub fn set_drawing_tool_mode(&mut self, mode: &str) -> Result<(), JsValue> {
        let mode = parse_drawing_tool_mode(mode)?;
        self.chart.set_drawing_tool_mode(mode);
        Ok(())
    }

    /// Returns current native drawing tool mode label.
    pub fn drawing_tool_mode(&self) -> String {
        use crate::chart::tools::DrawingToolMode;
        match self.chart.drawing_tool_mode() {
            DrawingToolMode::Select => "select",
            DrawingToolMode::HorizontalLine => "hline",
            DrawingToolMode::VerticalLine => "vline",
            DrawingToolMode::Ray => "ray",
            DrawingToolMode::Rectangle => "rectangle",
            DrawingToolMode::PriceRange => "price_range",
            DrawingToolMode::TimeRange => "time_range",
            DrawingToolMode::DateTimeRange => "date_time_range",
            DrawingToolMode::FibRetracement => "fib",
            DrawingToolMode::LongPosition => "long",
            DrawingToolMode::ShortPosition => "short",
            DrawingToolMode::Triangle => "triangle",
            DrawingToolMode::Circle => "circle",
            DrawingToolMode::Ellipse => "ellipse",
            DrawingToolMode::Text => "text",
            DrawingToolMode::Brush => "brush",
            DrawingToolMode::Highlighter => "highlighter",
        }
        .to_string()
    }

    /// Sets cursor mode (`crosshair` | `dot` | `normal`).
    pub fn set_cursor_mode(&mut self, mode: &str) {
        let mode = match mode.to_ascii_lowercase().as_str() {
            "dot" => CursorMode::Dot,
            "normal" => CursorMode::Normal,
            _ => CursorMode::Crosshair,
        };
        self.chart.set_cursor_mode(mode);
    }

    /// Returns current cursor mode label.
    pub fn cursor_mode(&self) -> String {
        match self.chart.cursor_mode() {
            CursorMode::Crosshair => "crosshair",
            CursorMode::Dot => "dot",
            CursorMode::Normal => "normal",
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

    /// Cancels active native drawing interaction.
    pub fn cancel_drawing_interaction(&mut self) {
        self.chart.cancel_drawing_interaction();
    }

    /// Selects drawing under cursor, returning selected id when hit.
    pub fn select_drawing_at(&mut self, x: f32, y: f32) -> Option<u64> {
        self.chart.select_drawing_at(x, y)
    }

    /// Returns currently selected drawing id, if any.
    pub fn selected_drawing_id(&self) -> Option<u64> {
        self.chart.selected_drawing_id()
    }

    /// Clears current drawing selection.
    pub fn clear_selected_drawing(&mut self) {
        self.chart.clear_selected_drawing();
    }

    /// Deletes currently selected drawing.
    pub fn delete_selected_drawing(&mut self) -> bool {
        self.chart.delete_selected_drawing()
    }

    /// Returns drawing config (stroke, fill, locked, supports_fill) as JSON.
    pub fn drawing_config(&self, drawing_id: u64) -> Result<String, JsValue> {
        let (style, supports_fill, text_content) = self
            .chart
            .drawing_config_with_capabilities(drawing_id)
            .ok_or_else(|| JsValue::from_str("Drawing not found"))?;
        let cfg = DrawingConfigJson {
            stroke_color: style.stroke_color,
            fill_color: style.fill_color,
            fill_opacity: style.fill_opacity,
            stroke_width: style.stroke_width,
            stroke_type: style.stroke_type.map(|t| match t {
                StrokeType::Solid => "solid".to_string(),
                StrokeType::Dotted => "dotted".to_string(),
                StrokeType::Dashed => "dashed".to_string(),
            }),
            font_size: style.font_size,
            text_content,
            locked: style.locked,
            supports_fill,
        };
        serde_json::to_string(&cfg).map_err(|e| JsValue::from_str(&format!("Serialize error: {e}")))
    }

    /// Sets drawing config from JSON. Expects { stroke_color?, fill_color?, fill_opacity?, stroke_width?, locked? }.
    /// Only fields present in the JSON are updated; absent fields leave existing values unchanged.
    pub fn set_drawing_config(&mut self, drawing_id: u64, json: &str) -> Result<(), JsValue> {
        let val: serde_json::Value = serde_json::from_str(json)
            .map_err(|e| JsValue::from_str(&format!("Invalid drawing config JSON: {e}")))?;
        let obj = val
            .as_object()
            .ok_or_else(|| JsValue::from_str("Config must be a JSON object"))?;

        if obj.contains_key("stroke_color") {
            let v = obj
                .get("stroke_color")
                .and_then(|x| x.as_str())
                .map(String::from);
            self.chart
                .set_drawing_stroke_color(drawing_id, v.as_deref());
        }
        if obj.contains_key("fill_color") {
            let v = obj
                .get("fill_color")
                .and_then(|x| x.as_str())
                .map(String::from);
            self.chart.set_drawing_fill_color(drawing_id, v.as_deref());
        }
        if obj.contains_key("fill_opacity") {
            let v = obj
                .get("fill_opacity")
                .and_then(|x| x.as_f64())
                .map(|f| f as f32);
            self.chart.set_drawing_fill_opacity(drawing_id, v);
        }
        if obj.contains_key("stroke_width") {
            let v = obj
                .get("stroke_width")
                .and_then(|x| x.as_f64())
                .map(|f| f as f32);
            self.chart.set_drawing_stroke_width(drawing_id, v);
        }
        if obj.contains_key("stroke_type") {
            let v = obj
                .get("stroke_type")
                .and_then(|x| x.as_str())
                .and_then(|s| match s.trim().to_ascii_lowercase().as_str() {
                    "dotted" => Some(StrokeType::Dotted),
                    "dashed" => Some(StrokeType::Dashed),
                    "solid" | _ => Some(StrokeType::Solid),
                });
            self.chart.set_drawing_stroke_type(drawing_id, v);
        }
        if obj.contains_key("locked") {
            let locked = obj.get("locked").and_then(|x| x.as_bool()).unwrap_or(false);
            self.chart.set_drawing_locked(drawing_id, locked);
        }
        if obj.contains_key("font_size") {
            let v = obj
                .get("font_size")
                .and_then(|x| x.as_f64())
                .map(|f| f as f32);
            self.chart.set_drawing_font_size(drawing_id, v);
        }
        if obj.contains_key("text_content") {
            let t = obj
                .get("text_content")
                .and_then(|x| x.as_str())
                .unwrap_or("");
            self.chart.set_drawing_text_content(drawing_id, t);
        }
        Ok(())
    }

    /// Returns selected drawing config as JSON, or empty object if none selected.
    pub fn selected_drawing_config(&self) -> Result<String, JsValue> {
        match self.chart.selected_drawing_id() {
            Some(id) => self.drawing_config(id),
            None => Ok("{}".to_string()),
        }
    }

    /// Returns caret bounds for selected Text drawing when not locked (inline edit mode).
    /// Returns JSON `null` or `{"x":100,"y":50,"height":14,"color":"#e5e7eb"}`.
    pub fn selected_text_caret_bounds(&self) -> Result<String, JsValue> {
        match self.chart.selected_text_caret_bounds() {
            Some((x, y, height, color)) => {
                #[derive(serde::Serialize)]
                struct CaretBounds {
                    x: f32,
                    y: f32,
                    height: f32,
                    color: String,
                }
                serde_json::to_string(&CaretBounds {
                    x,
                    y,
                    height,
                    color,
                })
                .map_err(|e| JsValue::from_str(&format!("Serialize error: {e}")))
            }
            None => Ok("null".to_string()),
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

    /// Add a rectangle drawing centered at clicked position.
    pub fn add_rectangle_at(&mut self, x: f32, y: f32) {
        self.chart.add_rectangle_at(x, y);
    }

    /// Add a text drawing at clicked position.
    pub fn add_text_at(&mut self, x: f32, y: f32) {
        self.chart.add_text_at(x, y);
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

    /// Sets drawing visibility (`true` visible, `false` hidden).
    pub fn set_drawing_visible(&mut self, drawing_id: u64, visible: bool) -> bool {
        self.chart.set_drawing_visible(drawing_id, visible)
    }

    /// Removes a drawing by id.
    pub fn remove_drawing(&mut self, drawing_id: u64) -> bool {
        self.chart.remove_drawing(drawing_id)
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

    /// Sets series visibility (`true` visible, `false` hidden).
    pub fn set_series_visible(&mut self, series_id: &str, visible: bool) {
        self.chart.set_series_visibility(series_id, visible);
    }

    /// Removes a series from render output by id.
    pub fn delete_series(&mut self, series_id: &str) {
        self.chart.delete_series(series_id);
    }

    /// Selects series near cursor and returns id when hit.
    pub fn select_series_at(&mut self, x: f32, y: f32) -> Option<String> {
        self.chart.select_series_at(x, y)
    }

    /// Returns currently selected series id.
    pub fn selected_series_id(&self) -> Option<String> {
        self.chart.selected_series_id()
    }

    /// Clears selected series.
    pub fn clear_selected_series(&mut self) {
        self.chart.clear_selected_series();
    }

    /// Deletes currently selected series.
    pub fn delete_selected_series(&mut self) -> bool {
        self.chart.delete_selected_series()
    }

    /// Restores a previously deleted series by id.
    pub fn restore_series(&mut self, series_id: &str) {
        self.chart.restore_series(series_id);
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

    /// Returns external object-tree state as JSON for UI components.
    pub fn object_tree_state_json(&self) -> Result<String, JsValue> {
        let mut panes = vec![PaneTreeState {
            id: "price".to_string(),
            visible: true,
        }];
        panes.extend(
            self.chart
                .registered_named_panes()
                .into_iter()
                .map(|id| PaneTreeState {
                    visible: self.chart.is_pane_visible(&id),
                    id,
                }),
        );

        let series = self
            .chart
            .plot_series_state()
            .into_iter()
            .map(|item| SeriesTreeState {
                id: item.id,
                name: item.name,
                pane_id: item.pane_id,
                visible: item.visible,
                deleted: item.deleted,
            })
            .collect();

        let drawings = self
            .chart
            .drawing_state()
            .into_iter()
            .map(|item| DrawingTreeState {
                locked: self.chart.is_drawing_locked(item.id),
                id: item.id,
                kind: item.kind,
                layer_id: item.layer_id,
                group_id: item.group_id,
                visible: item.visible,
            })
            .collect();

        let layers = self
            .chart
            .drawings()
            .layers()
            .values()
            .map(|l| LayerTreeState {
                id: l.id.clone(),
                name: l.name.clone(),
                visible: l.visible,
                locked: l.locked,
                order: l.order,
            })
            .collect();

        let groups = self
            .chart
            .drawings()
            .groups()
            .values()
            .map(|g| GroupTreeState {
                id: g.id.clone(),
                name: g.name.clone(),
                layer_id: g.layer_id.clone(),
                parent_group_id: g.parent_group_id.clone(),
                visible: g.visible,
                locked: g.locked,
                order: g.order,
            })
            .collect();

        let state = ObjectTreeState {
            panes,
            series,
            layers,
            groups,
            drawings,
        };

        serde_json::to_string(&state)
            .map_err(|e| JsValue::from_str(&format!("Failed to serialize object tree state: {e}")))
    }

    pub fn create_drawing_layer(&mut self, id: String, name: String) {
        self.chart.create_drawing_layer(id, name);
    }

    pub fn delete_drawing_layer(&mut self, id: String) {
        self.chart.delete_drawing_layer(id);
    }

    pub fn update_drawing_layer(&mut self, id: String, json: &str) -> Result<(), JsValue> {
        let val: serde_json::Value =
            serde_json::from_str(json).map_err(|e| JsValue::from_str(&e.to_string()))?;
        let name = val
            .get("name")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let visible = val.get("visible").and_then(|v| v.as_bool());
        let locked = val.get("locked").and_then(|v| v.as_bool());
        self.chart.update_drawing_layer(id, name, visible, locked);
        Ok(())
    }

    pub fn create_drawing_group(
        &mut self,
        id: String,
        name: String,
        layer_id: String,
        parent_group_id: Option<String>,
    ) {
        self.chart
            .create_drawing_group(id, name, layer_id, parent_group_id);
    }

    pub fn delete_drawing_group(&mut self, id: String) {
        self.chart.delete_drawing_group(id);
    }

    pub fn update_drawing_group(&mut self, id: String, json: &str) -> Result<(), JsValue> {
        let val: serde_json::Value =
            serde_json::from_str(json).map_err(|e| JsValue::from_str(&e.to_string()))?;
        let name = val
            .get("name")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let visible = val.get("visible").and_then(|v| v.as_bool());
        let locked = val.get("locked").and_then(|v| v.as_bool());
        self.chart.update_drawing_group(id, name, visible, locked);
        Ok(())
    }

    pub fn move_drawings_to_group(
        &mut self,
        ids_json: &str,
        group_id: Option<String>,
    ) -> Result<(), JsValue> {
        let ids: Vec<u64> = serde_json::from_str(ids_json)
            .map_err(|e| JsValue::from_str(&format!("Invalid IDs JSON: {e}")))?;
        self.chart.move_drawings_to_group(ids, group_id);
        Ok(())
    }

    pub fn move_drawings_to_layer(
        &mut self,
        ids_json: &str,
        layer_id: String,
    ) -> Result<(), JsValue> {
        let ids: Vec<u64> = serde_json::from_str(ids_json)
            .map_err(|e| JsValue::from_str(&format!("Invalid IDs JSON: {e}")))?;
        self.chart.move_drawings_to_layer(ids, layer_id);
        Ok(())
    }

    pub fn delete_drawings(&mut self, ids_json: &str) -> Result<(), JsValue> {
        let ids: Vec<u64> = serde_json::from_str(ids_json)
            .map_err(|e| JsValue::from_str(&format!("Invalid IDs JSON: {e}")))?;
        self.chart.delete_drawings(ids);
        Ok(())
    }

    // -------- Rendering --------

    pub fn draw(&self) -> Result<(), JsValue> {
        // Domain builds a backend-agnostic scene; backend handles paint.
        let cmds = self.chart.build_draw_commands();
        paint_canvas2d(&self.ctx, &self.canvas, &cmds, self.chart.theme())
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
        "price_range" => Ok(DrawingToolMode::PriceRange),
        "time_range" => Ok(DrawingToolMode::TimeRange),
        "date_time_range" => Ok(DrawingToolMode::DateTimeRange),
        "fib" => Ok(DrawingToolMode::FibRetracement),
        "long" => Ok(DrawingToolMode::LongPosition),
        "short" => Ok(DrawingToolMode::ShortPosition),
        "triangle" => Ok(DrawingToolMode::Triangle),
        "circle" => Ok(DrawingToolMode::Circle),
        "ellipse" => Ok(DrawingToolMode::Ellipse),
        "text" => Ok(DrawingToolMode::Text),
        "brush" => Ok(DrawingToolMode::Brush),
        "highlighter" => Ok(DrawingToolMode::Highlighter),
        other => Err(JsValue::from_str(&format!(
            "Invalid drawing tool mode '{other}'. Use: select, hline, vline, ray, rectangle, price_range, time_range, date_time_range, fib, long, short, triangle, circle, ellipse, text, brush, highlighter"
        ))),
    }
}

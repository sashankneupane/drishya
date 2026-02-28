use wasm_bindgen::prelude::*;

use crate::api::dto::drawings::DrawingConfigJson;
use crate::api::wasm::chart_handle::{parse_drawing_tool_mode, parse_interaction_mode, WasmChart};
use crate::drawings::hit_test::HitToleranceProfile;
use crate::drawings::types::StrokeType;

#[wasm_bindgen]
impl WasmChart {
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
            let v = obj.get("stroke_type").and_then(|x| x.as_str()).map(|s| {
                match s.trim().to_ascii_lowercase().as_str() {
                    "dotted" => StrokeType::Dotted,
                    "dashed" => StrokeType::Dashed,
                    "solid" => StrokeType::Solid,
                    _ => StrokeType::Solid,
                }
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
    /// Sets drawing visibility (`true` visible, `false` hidden).
    pub fn set_drawing_visible(&mut self, drawing_id: u64, visible: bool) -> bool {
        self.chart.set_drawing_visible(drawing_id, visible)
    }

    /// Removes a drawing by id.
    pub fn remove_drawing(&mut self, drawing_id: u64) -> bool {
        self.chart.remove_drawing(drawing_id)
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
}

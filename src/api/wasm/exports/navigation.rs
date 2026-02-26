use wasm_bindgen::prelude::*;

use crate::api::wasm::chart_handle::WasmChart;
use crate::api::wasm::dto::persistence::ViewportSnapshotDto;
use crate::api::wasm::parse::json::parse_json;

#[wasm_bindgen]
impl WasmChart {
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
    /// Sets crosshair position in CSS pixel space.
    pub fn set_crosshair_at(&mut self, x: f32, y: f32) {
        self.chart.set_crosshair_at(x, y);
    }

    /// Clears crosshair overlay.
    pub fn clear_crosshair(&mut self) {
        self.chart.clear_crosshair();
    }

    /// Exports viewport/navigation state as JSON.
    pub fn viewport_state_json(&self) -> Result<String, JsValue> {
        serde_json::to_string(&self.chart.export_viewport_snapshot())
            .map_err(|e| JsValue::from_str(&format!("Failed to serialize viewport state: {e}")))
    }

    /// Restores viewport/navigation state from JSON.
    pub fn restore_viewport_state_json(&mut self, json: &str) -> Result<(), JsValue> {
        let snapshot: ViewportSnapshotDto = parse_json(json, "viewport-state JSON")?;
        self.chart.restore_viewport_snapshot(&snapshot);
        Ok(())
    }
}

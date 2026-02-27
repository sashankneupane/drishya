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

    /// Sets crosshair by source timestamp, mapped to current viewport/cadence.
    /// Returns false when mapping is unavailable (e.g., no candles).
    pub fn set_crosshair_at_timestamp(&mut self, timestamp: i64, y: f32) -> bool {
        let layout = self.chart.current_layout();
        let pane = layout.price_pane().unwrap_or(layout.plot);
        let scale = self.chart.current_time_scale(pane);
        if let Some(x) = self.chart.pixel_x_for_timestamp(timestamp, scale) {
            self.chart.set_crosshair_at(x, y);
            return true;
        }
        false
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

    /// Sets the price axis mode: "linear", "log", or "percent".
    pub fn set_price_axis_mode(&mut self, mode: &str) -> Result<(), JsValue> {
        let axis_mode = match mode.trim().to_ascii_lowercase().as_str() {
            "linear" => crate::scale::PriceAxisMode::Linear,
            "log" => crate::scale::PriceAxisMode::Log,
            "percent" => crate::scale::PriceAxisMode::Percent,
            other => {
                return Err(JsValue::from_str(&format!(
                    "Invalid axis mode '{other}'. Use: linear, log, percent"
                )))
            }
        };
        self.chart.set_price_axis_mode(axis_mode);
        Ok(())
    }

    /// Returns the current price axis mode.
    pub fn price_axis_mode(&self) -> String {
        match self.chart.price_axis_mode() {
            crate::scale::PriceAxisMode::Linear => "linear".to_string(),
            crate::scale::PriceAxisMode::Log => "log".to_string(),
            crate::scale::PriceAxisMode::Percent => "percent".to_string(),
        }
    }
}

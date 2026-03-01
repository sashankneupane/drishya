use wasm_bindgen::prelude::*;

use crate::api::wasm::chart_handle::WasmChart;
use crate::chart::plots::SeriesStyleOverride;
use std::collections::HashMap;

#[wasm_bindgen]
impl WasmChart {
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

    pub fn series_style_snapshot_json(&self) -> Result<String, JsValue> {
        serde_json::to_string(&self.chart.series_style_snapshot()).map_err(|e| {
            JsValue::from_str(&format!("Failed to serialize series style snapshot: {e}"))
        })
    }

    pub fn series_style_override_json(&self, series_id: &str) -> Result<String, JsValue> {
        serde_json::to_string(&self.chart.series_style_override(series_id)).map_err(|e| {
            JsValue::from_str(&format!("Failed to serialize series style override: {e}"))
        })
    }

    pub fn set_series_style_override_json(
        &mut self,
        series_id: &str,
        json: &str,
    ) -> Result<(), JsValue> {
        let style = serde_json::from_str::<SeriesStyleOverride>(json)
            .map_err(|e| JsValue::from_str(&format!("Invalid series style override JSON: {e}")))?;
        self.chart.set_series_style_override(series_id, style);
        Ok(())
    }

    pub fn clear_series_style_override(&mut self, series_id: &str) {
        self.chart.clear_series_style_override(series_id);
    }

    pub fn all_series_style_overrides_json(&self) -> Result<String, JsValue> {
        serde_json::to_string(&self.chart.all_series_style_overrides()).map_err(|e| {
            JsValue::from_str(&format!("Failed to serialize series style overrides: {e}"))
        })
    }

    /// Replaces all series style overrides (full rewrite).
    pub fn replace_series_style_overrides_json(&mut self, json: &str) -> Result<(), JsValue> {
        let overrides: HashMap<String, SeriesStyleOverride> = serde_json::from_str(json)
            .map_err(|e| JsValue::from_str(&format!("Invalid style override map JSON: {e}")))?;
        self.chart.replace_all_series_style_overrides(overrides);
        Ok(())
    }

    /// Applies partial series style overrides (upsert subset).
    pub fn patch_series_style_overrides_json(&mut self, json: &str) -> Result<(), JsValue> {
        let overrides: HashMap<String, SeriesStyleOverride> = serde_json::from_str(json)
            .map_err(|e| JsValue::from_str(&format!("Invalid style override patch JSON: {e}")))?;
        self.chart.patch_series_style_overrides(overrides);
        Ok(())
    }

    pub fn register_compare_series(&mut self, symbol: &str, name: &str, color: &str) -> String {
        self.chart.register_compare_series(symbol, name, color)
    }

    pub fn remove_compare_series(&mut self, id: &str) -> bool {
        self.chart.remove_compare_series(id)
    }

    pub fn set_compare_series_visible(&mut self, id: &str, visible: bool) -> bool {
        self.chart.set_compare_series_visible(id, visible)
    }
}

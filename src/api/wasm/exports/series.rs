use wasm_bindgen::prelude::*;

use crate::api::wasm::chart_handle::WasmChart;

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
}

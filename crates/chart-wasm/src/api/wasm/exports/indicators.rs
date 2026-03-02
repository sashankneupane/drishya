use wasm_bindgen::prelude::*;

use crate::api::wasm::chart_handle::WasmChart;
use crate::indicators::api as indicator_api;
use crate::indicators::catalog::list_available_indicators;
use std::collections::HashMap;

#[wasm_bindgen]
impl WasmChart {
    /// Returns discovered indicator catalog with TA visual metadata.
    pub fn indicator_catalog_json(&self) -> Result<String, JsValue> {
        serde_json::to_string(&list_available_indicators())
            .map_err(|e| JsValue::from_str(&format!("Failed to serialize indicator catalog: {e}")))
    }

    /// Adds a built-in indicator using catalog id and parameter JSON object.
    pub fn add_indicator_json(
        &mut self,
        indicator_id: &str,
        params_json: &str,
    ) -> Result<(), JsValue> {
        let params: HashMap<String, serde_json::Value> = if params_json.trim().is_empty() {
            HashMap::new()
        } else {
            serde_json::from_str(params_json)
                .map_err(|e| JsValue::from_str(&format!("Invalid indicator params JSON: {e}")))?
        };
        indicator_api::add_indicator_with_params(&mut self.chart, indicator_id, &params)
            .map_err(|e| JsValue::from_str(&e))
    }

    /// Clears all active indicator overlays.
    pub fn clear_indicator_overlays(&mut self) {
        indicator_api::clear_builtins(&mut self.chart);
    }
}

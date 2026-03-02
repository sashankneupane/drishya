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

    /// Adds a built-in indicator using strict explicit params and style slot payloads.
    ///
    /// This API is designed for consumer-owned state pipelines where indicator creation
    /// must reject implicit defaults and missing style contracts up front.
    pub fn add_indicator_strict_json(
        &mut self,
        indicator_id: &str,
        params_json: &str,
        style_slots_json: &str,
    ) -> Result<(), JsValue> {
        let id = indicator_id.trim().to_ascii_lowercase();
        let catalog = list_available_indicators();
        let Some(meta) = catalog
            .iter()
            .find(|item| item.id.trim().eq_ignore_ascii_case(&id))
        else {
            return Err(JsValue::from_str(&format!(
                "Unsupported built-in indicator id '{}' for strict attachment",
                indicator_id
            )));
        };

        let params: HashMap<String, serde_json::Value> = serde_json::from_str(params_json)
            .map_err(|e| JsValue::from_str(&format!("Invalid strict indicator params JSON: {e}")))?;

        let style_slots: HashMap<String, serde_json::Value> = serde_json::from_str(style_slots_json)
            .map_err(|e| JsValue::from_str(&format!("Invalid strict indicator style JSON: {e}")))?;

        for required in meta.params.iter().filter(|param| param.required) {
            if !params.contains_key(&required.name) {
                return Err(JsValue::from_str(&format!(
                    "Strict indicator '{}' is missing required param '{}'",
                    id, required.name
                )));
            }
        }

        for slot in &meta.visual.style_slots {
            let Some(slot_payload) = style_slots.get(&slot.slot) else {
                return Err(JsValue::from_str(&format!(
                    "Strict indicator '{}' is missing required style slot '{}'",
                    id, slot.slot
                )));
            };
            if !slot_payload.is_object() {
                return Err(JsValue::from_str(&format!(
                    "Strict indicator '{}' style slot '{}' must be an object",
                    id, slot.slot
                )));
            }
        }

        indicator_api::add_indicator_with_params(&mut self.chart, indicator_id, &params)
            .map_err(|e| JsValue::from_str(&e))
    }

    /// Clears all active indicator overlays.
    pub fn clear_indicator_overlays(&mut self) {
        indicator_api::clear_builtins(&mut self.chart);
    }
}

use wasm_bindgen::prelude::*;

use crate::api::wasm::chart_handle::WasmChart;
use crate::api::wasm::parse::json::parse_json;
use crate::events::ChartEvent;

#[wasm_bindgen]
impl WasmChart {
    pub fn set_events_json(&mut self, json: &str) -> Result<(), JsValue> {
        let events: Vec<ChartEvent> = parse_json(json, "Chart events JSON")?;
        self.chart.set_events(events);
        Ok(())
    }

    pub fn clear_events(&mut self) {
        self.chart.clear_events();
    }

    pub fn select_event_at(&mut self, x: f32, y: f32) -> Option<String> {
        self.chart.select_event_at(x, y)
    }

    pub fn selected_event_json(&self) -> Result<String, JsValue> {
        serde_json::to_string(&self.chart.selected_event())
            .map_err(|e| JsValue::from_str(&format!("Failed to serialize selected event: {e}")))
    }
}

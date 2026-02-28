use wasm_bindgen::prelude::*;

use crate::api::wasm::chart_handle::WasmChart;

#[wasm_bindgen]
impl WasmChart {
    pub fn replay_play(&mut self) {
        self.chart.replay_play();
    }

    pub fn replay_pause(&mut self) {
        self.chart.replay_pause();
    }

    pub fn replay_stop(&mut self) {
        self.chart.replay_stop();
    }

    pub fn replay_step_bar(&mut self) -> Option<i64> {
        self.chart.replay_step_bar()
    }

    pub fn replay_step_event(&mut self) -> Option<i64> {
        self.chart.replay_step_event()
    }

    pub fn replay_seek_ts(&mut self, ts: i64) {
        self.chart.replay_seek_ts(ts);
    }

    pub fn replay_tick(&mut self) -> Option<i64> {
        self.chart.replay_tick()
    }

    pub fn replay_state_json(&self) -> Result<String, JsValue> {
        serde_json::to_string(&self.chart.replay_state())
            .map_err(|e| JsValue::from_str(&format!("Failed to serialize replay state: {e}")))
    }
}

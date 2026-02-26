use wasm_bindgen::prelude::*;

use crate::api::wasm::chart_handle::WasmChart;
use crate::api::wasm::parse::json::parse_json;
use crate::types::Candle;

#[wasm_bindgen]
impl WasmChart {
    /// Pass JSON array of candles:
    /// [{"ts":1,"open":100.0,"high":101.0,"low":99.5,"close":100.5,"volume":1200.0}, ...]
    pub fn set_ohlcv_json(&mut self, json: &str) -> Result<(), JsValue> {
        let data: Vec<Candle> = parse_json(json, "OHLCV JSON")?;
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
}

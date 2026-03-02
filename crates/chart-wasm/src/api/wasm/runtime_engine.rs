use wasm_bindgen::prelude::*;

use crate::api::wasm::parse::json::parse_json;
use crate::runtime::{RuntimeEngine, RuntimeId, SourceKey, TileIndicatorConfig, TileLayoutConfig};
use crate::types::Candle;

#[wasm_bindgen]
pub struct WasmRuntimeEngine {
    engine: RuntimeEngine,
}

#[wasm_bindgen]
impl WasmRuntimeEngine {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            engine: RuntimeEngine::new(),
        }
    }

    /// Creates (tile_id, tab_id) runtime. This operation is idempotent only by caller discipline:
    /// creating the same runtime twice returns a deterministic error.
    pub fn create_runtime(
        &mut self,
        tile_id: &str,
        tab_id: &str,
        width: u32,
        height: u32,
    ) -> Result<(), JsValue> {
        self.engine
            .create_runtime(RuntimeId::new(tile_id, tab_id), width as f32, height as f32)
            .map_err(|e| JsValue::from_str(&e.to_string()))
    }

    /// Binds a runtime to a source key JSON payload:
    /// {"asset":"BTCUSDT","timeframe":"1m"}
    pub fn bind_source_json(
        &mut self,
        tile_id: &str,
        tab_id: &str,
        source_json: &str,
    ) -> Result<(), JsValue> {
        let source: SourceKey = parse_json(source_json, "runtime source key JSON")?;
        self.engine
            .bind_source(&RuntimeId::new(tile_id, tab_id), source)
            .map_err(|e| JsValue::from_str(&e.to_string()))
    }

    /// Applies tile-owned pane/order/weights config to all runtimes in the tile.
    /// JSON payload shape:
    /// {"pane_order":["price","rsi"],"pane_weights":{"price":3.0,"rsi":1.0}}
    pub fn set_tile_layout_json(
        &mut self,
        tile_id: &str,
        layout_json: &str,
    ) -> Result<(), JsValue> {
        let layout: TileLayoutConfig = parse_json(layout_json, "tile layout JSON")?;
        self.engine
            .set_tile_layout(tile_id, layout)
            .map_err(|e| JsValue::from_str(&e.to_string()))
    }

    /// Applies tile-owned indicator config to all runtimes in the tile.
    /// JSON payload shape:
    /// {"indicators":[{"indicator_id":"rsi","params":{"period":14}}]}
    pub fn set_tile_indicators_json(
        &mut self,
        tile_id: &str,
        indicators_json: &str,
    ) -> Result<(), JsValue> {
        let indicators: TileIndicatorConfig = parse_json(indicators_json, "tile indicators JSON")?;
        self.engine
            .set_tile_indicators(tile_id, indicators)
            .map_err(|e| JsValue::from_str(&e.to_string()))
    }

    /// Replaces source snapshot and fans out to all runtimes bound to source.
    pub fn ingest_snapshot_json(
        &mut self,
        source_json: &str,
        candles_json: &str,
    ) -> Result<(), JsValue> {
        let source: SourceKey = parse_json(source_json, "source key JSON")?;
        let candles: Vec<Candle> = parse_json(candles_json, "OHLCV snapshot JSON")?;
        self.engine.ingest_snapshot(source, candles);
        Ok(())
    }

    /// Upserts one streaming candle for source and fans out to all bound runtimes.
    pub fn append_candle_json(
        &mut self,
        source_json: &str,
        candle_json: &str,
    ) -> Result<(), JsValue> {
        let source: SourceKey = parse_json(source_json, "source key JSON")?;
        let candle: Candle = parse_json(candle_json, "OHLCV candle JSON")?;
        self.engine.append_candle(source, candle);
        Ok(())
    }

    /// Returns runtime snapshot JSON for persistence/render reconciliation.
    pub fn runtime_snapshot_json(&self, tile_id: &str, tab_id: &str) -> Result<String, JsValue> {
        let snapshot = self
            .engine
            .runtime_snapshot(&RuntimeId::new(tile_id, tab_id))
            .map_err(|e| JsValue::from_str(&e.to_string()))?;
        serde_json::to_string(&snapshot)
            .map_err(|e| JsValue::from_str(&format!("Failed to serialize runtime snapshot: {e}")))
    }
}

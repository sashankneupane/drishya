use crate::{chart::Chart, indicators::api as indicator_api, types::Candle};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BTreeMap, HashMap, HashSet};
use std::fmt::{Display, Formatter};

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct RuntimeId {
    pub tile_id: String,
    pub tab_id: String,
}

impl RuntimeId {
    pub fn new(tile_id: &str, tab_id: &str) -> Self {
        Self {
            tile_id: tile_id.trim().to_string(),
            tab_id: tab_id.trim().to_string(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct SourceKey {
    pub asset: String,
    pub timeframe: String,
}

impl SourceKey {
    pub fn new(asset: &str, timeframe: &str) -> Self {
        Self {
            asset: asset.trim().to_string(),
            timeframe: timeframe.trim().to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct TileLayoutConfig {
    #[serde(default)]
    pub pane_order: Vec<String>,
    #[serde(default)]
    pub pane_weights: BTreeMap<String, f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct IndicatorSpec {
    pub indicator_id: String,
    #[serde(default)]
    pub params: HashMap<String, Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct TileIndicatorConfig {
    #[serde(default)]
    pub indicators: Vec<IndicatorSpec>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuntimeSnapshot {
    pub runtime_id: RuntimeId,
    pub source: Option<SourceKey>,
    pub candle_count: usize,
    pub tile_config_version: u64,
    pub pane_layout_state: crate::chart::plots::PaneLayoutState,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RuntimeEngineError {
    InvalidRuntimeId,
    InvalidSourceKey,
    RuntimeAlreadyExists(RuntimeId),
    RuntimeNotFound(RuntimeId),
    TileNotFound(String),
    IndicatorApplyFailed {
        runtime_id: RuntimeId,
        indicator_id: String,
        message: String,
    },
}

impl Display for RuntimeEngineError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            RuntimeEngineError::InvalidRuntimeId => {
                write!(f, "Invalid runtime id: tile_id and tab_id are required")
            }
            RuntimeEngineError::InvalidSourceKey => {
                write!(f, "Invalid source key: asset and timeframe are required")
            }
            RuntimeEngineError::RuntimeAlreadyExists(runtime_id) => write!(
                f,
                "Runtime already exists for tile '{}' tab '{}'",
                runtime_id.tile_id, runtime_id.tab_id
            ),
            RuntimeEngineError::RuntimeNotFound(runtime_id) => write!(
                f,
                "Runtime not found for tile '{}' tab '{}'",
                runtime_id.tile_id, runtime_id.tab_id
            ),
            RuntimeEngineError::TileNotFound(tile_id) => {
                write!(f, "Tile '{}' has no registered runtime", tile_id)
            }
            RuntimeEngineError::IndicatorApplyFailed {
                runtime_id,
                indicator_id,
                message,
            } => write!(
                f,
                "Failed to apply indicator '{}' to runtime {}:{}: {}",
                indicator_id, runtime_id.tile_id, runtime_id.tab_id, message
            ),
        }
    }
}

impl std::error::Error for RuntimeEngineError {}

#[derive(Debug, Clone)]
struct RuntimeMeta {
    source: Option<SourceKey>,
}

#[derive(Default)]
pub struct RuntimeEngine {
    runtimes: HashMap<RuntimeId, Chart>,
    runtime_meta: HashMap<RuntimeId, RuntimeMeta>,
    runtimes_by_tile: HashMap<String, HashSet<RuntimeId>>,
    runtimes_by_source: HashMap<SourceKey, HashSet<RuntimeId>>,
    market_store: HashMap<SourceKey, Vec<Candle>>,
    tile_layout_by_tile: HashMap<String, TileLayoutConfig>,
    tile_indicators_by_tile: HashMap<String, TileIndicatorConfig>,
    tile_config_version_by_tile: HashMap<String, u64>,
}

impl RuntimeEngine {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn create_runtime(
        &mut self,
        runtime_id: RuntimeId,
        width: f32,
        height: f32,
    ) -> Result<(), RuntimeEngineError> {
        if runtime_id.tile_id.is_empty() || runtime_id.tab_id.is_empty() {
            return Err(RuntimeEngineError::InvalidRuntimeId);
        }
        if self.runtimes.contains_key(&runtime_id) {
            return Err(RuntimeEngineError::RuntimeAlreadyExists(runtime_id));
        }

        let mut chart = Chart::new(width.max(1.0), height.max(1.0));
        if let Some(layout) = self.tile_layout_by_tile.get(&runtime_id.tile_id) {
            apply_tile_layout_to_chart(&mut chart, layout);
        }
        if let Some(indicators) = self.tile_indicators_by_tile.get(&runtime_id.tile_id) {
            apply_tile_indicators_to_chart(&mut chart, indicators).map_err(|message| {
                RuntimeEngineError::IndicatorApplyFailed {
                    runtime_id: runtime_id.clone(),
                    indicator_id: "tile_indicator_config".to_string(),
                    message,
                }
            })?;
        }

        self.runtimes.insert(runtime_id.clone(), chart);
        self.runtime_meta
            .insert(runtime_id.clone(), RuntimeMeta { source: None });
        self.runtimes_by_tile
            .entry(runtime_id.tile_id.clone())
            .or_default()
            .insert(runtime_id);
        Ok(())
    }

    pub fn bind_source(
        &mut self,
        runtime_id: &RuntimeId,
        source: SourceKey,
    ) -> Result<(), RuntimeEngineError> {
        if source.asset.is_empty() || source.timeframe.is_empty() {
            return Err(RuntimeEngineError::InvalidSourceKey);
        }
        let previous_source = self
            .runtime_meta
            .get(runtime_id)
            .ok_or_else(|| RuntimeEngineError::RuntimeNotFound(runtime_id.clone()))?
            .source
            .clone();

        if let Some(prev) = previous_source {
            let should_remove_key = if let Some(set) = self.runtimes_by_source.get_mut(&prev) {
                set.remove(runtime_id);
                set.is_empty()
            } else {
                false
            };
            if should_remove_key {
                self.runtimes_by_source.remove(&prev);
            }
        }

        self.runtimes_by_source
            .entry(source.clone())
            .or_default()
            .insert(runtime_id.clone());
        if let Some(meta) = self.runtime_meta.get_mut(runtime_id) {
            meta.source = Some(source.clone());
        }

        let runtime = self
            .runtimes
            .get_mut(runtime_id)
            .ok_or_else(|| RuntimeEngineError::RuntimeNotFound(runtime_id.clone()))?;
        let candles = self.market_store.get(&source).cloned().unwrap_or_default();
        runtime.set_data(candles);
        Ok(())
    }

    pub fn set_tile_layout(
        &mut self,
        tile_id: &str,
        layout: TileLayoutConfig,
    ) -> Result<(), RuntimeEngineError> {
        let normalized_tile_id = tile_id.trim().to_string();
        if normalized_tile_id.is_empty() {
            return Err(RuntimeEngineError::TileNotFound(tile_id.to_string()));
        }

        self.tile_layout_by_tile
            .insert(normalized_tile_id.clone(), layout.clone());
        *self
            .tile_config_version_by_tile
            .entry(normalized_tile_id.clone())
            .or_insert(0) += 1;

        let runtime_ids = self
            .runtimes_by_tile
            .get(&normalized_tile_id)
            .map(|set| set.iter().cloned().collect::<Vec<_>>())
            .unwrap_or_default();

        for runtime_id in runtime_ids {
            if let Some(chart) = self.runtimes.get_mut(&runtime_id) {
                apply_tile_layout_to_chart(chart, &layout);
            }
        }
        Ok(())
    }

    pub fn set_tile_indicators(
        &mut self,
        tile_id: &str,
        indicators: TileIndicatorConfig,
    ) -> Result<(), RuntimeEngineError> {
        let normalized_tile_id = tile_id.trim().to_string();
        if normalized_tile_id.is_empty() {
            return Err(RuntimeEngineError::TileNotFound(tile_id.to_string()));
        }

        // Validate deterministically before mutating any runtime.
        {
            let mut validation_chart = Chart::new(1.0, 1.0);
            apply_tile_indicators_to_chart(&mut validation_chart, &indicators).map_err(
                |message| RuntimeEngineError::IndicatorApplyFailed {
                    runtime_id: RuntimeId::new(tile_id, "_validation"),
                    indicator_id: "tile_indicator_config".to_string(),
                    message,
                },
            )?;
        }

        self.tile_indicators_by_tile
            .insert(normalized_tile_id.clone(), indicators.clone());
        *self
            .tile_config_version_by_tile
            .entry(normalized_tile_id.clone())
            .or_insert(0) += 1;

        let runtime_ids = self
            .runtimes_by_tile
            .get(&normalized_tile_id)
            .map(|set| set.iter().cloned().collect::<Vec<_>>())
            .unwrap_or_default();

        for runtime_id in runtime_ids {
            let chart = self
                .runtimes
                .get_mut(&runtime_id)
                .ok_or_else(|| RuntimeEngineError::RuntimeNotFound(runtime_id.clone()))?;
            apply_tile_indicators_to_chart(chart, &indicators).map_err(|message| {
                RuntimeEngineError::IndicatorApplyFailed {
                    runtime_id: runtime_id.clone(),
                    indicator_id: "tile_indicator_config".to_string(),
                    message,
                }
            })?;
        }
        Ok(())
    }

    pub fn ingest_snapshot(&mut self, source: SourceKey, candles: Vec<Candle>) {
        self.market_store.insert(source.clone(), candles.clone());
        let runtime_ids = self
            .runtimes_by_source
            .get(&source)
            .map(|set| set.iter().cloned().collect::<Vec<_>>())
            .unwrap_or_default();
        for runtime_id in runtime_ids {
            if let Some(chart) = self.runtimes.get_mut(&runtime_id) {
                chart.set_data(candles.clone());
            }
        }
    }

    pub fn append_candle(&mut self, source: SourceKey, candle: Candle) {
        let candles = self.market_store.entry(source.clone()).or_default();
        upsert_candle_in_store(candles, candle);
        let runtime_ids = self
            .runtimes_by_source
            .get(&source)
            .map(|set| set.iter().cloned().collect::<Vec<_>>())
            .unwrap_or_default();
        for runtime_id in runtime_ids {
            if let Some(chart) = self.runtimes.get_mut(&runtime_id) {
                chart.upsert_candle(candle);
            }
        }
    }

    pub fn runtime_snapshot(
        &self,
        runtime_id: &RuntimeId,
    ) -> Result<RuntimeSnapshot, RuntimeEngineError> {
        let chart = self
            .runtimes
            .get(runtime_id)
            .ok_or_else(|| RuntimeEngineError::RuntimeNotFound(runtime_id.clone()))?;
        let meta = self
            .runtime_meta
            .get(runtime_id)
            .ok_or_else(|| RuntimeEngineError::RuntimeNotFound(runtime_id.clone()))?;
        let tile_config_version = self
            .tile_config_version_by_tile
            .get(&runtime_id.tile_id)
            .copied()
            .unwrap_or(0);
        Ok(RuntimeSnapshot {
            runtime_id: runtime_id.clone(),
            source: meta.source.clone(),
            candle_count: chart.candles.len(),
            tile_config_version,
            pane_layout_state: chart.export_pane_layout_state(),
        })
    }
}

fn apply_tile_layout_to_chart(chart: &mut Chart, layout: &TileLayoutConfig) {
    if !layout.pane_order.is_empty() {
        chart.set_pane_order(layout.pane_order.clone());
    }
    if !layout.pane_weights.is_empty() {
        chart.set_pane_weights(layout.pane_weights.clone());
    }
}

fn apply_tile_indicators_to_chart(
    chart: &mut Chart,
    indicators: &TileIndicatorConfig,
) -> Result<(), String> {
    indicator_api::clear_builtins(chart);
    for indicator in &indicators.indicators {
        indicator_api::add_indicator_with_params(
            chart,
            &indicator.indicator_id,
            &indicator.params,
        )?;
    }
    Ok(())
}

fn upsert_candle_in_store(candles: &mut Vec<Candle>, candle: Candle) {
    match candles.last_mut() {
        None => candles.push(candle),
        Some(last) if candle.ts == last.ts => *last = candle,
        Some(last) if candle.ts > last.ts => candles.push(candle),
        Some(_) => {
            if let Some(existing) = candles.iter_mut().rev().find(|c| c.ts == candle.ts) {
                *existing = candle;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn candle(ts: i64, close: f64) -> Candle {
        Candle {
            ts,
            open: close,
            high: close + 1.0,
            low: close - 1.0,
            close,
            volume: 1_000.0,
        }
    }

    #[test]
    fn fanout_source_snapshot_to_all_bound_runtimes() {
        let mut engine = RuntimeEngine::new();
        let runtime_a = RuntimeId::new("tile-1", "tab-1");
        let runtime_b = RuntimeId::new("tile-1", "tab-2");
        let source = SourceKey::new("BTCUSDT", "1m");

        engine
            .create_runtime(runtime_a.clone(), 1200.0, 700.0)
            .unwrap();
        engine
            .create_runtime(runtime_b.clone(), 1200.0, 700.0)
            .unwrap();
        engine.bind_source(&runtime_a, source.clone()).unwrap();
        engine.bind_source(&runtime_b, source.clone()).unwrap();

        engine.ingest_snapshot(source, vec![candle(1, 10.0), candle(2, 11.0)]);

        assert_eq!(engine.runtime_snapshot(&runtime_a).unwrap().candle_count, 2);
        assert_eq!(engine.runtime_snapshot(&runtime_b).unwrap().candle_count, 2);
    }

    #[test]
    fn append_candle_uses_store_upsert_semantics() {
        let mut engine = RuntimeEngine::new();
        let runtime = RuntimeId::new("tile-1", "tab-1");
        let source = SourceKey::new("ETHUSDT", "5m");
        engine
            .create_runtime(runtime.clone(), 1200.0, 700.0)
            .unwrap();
        engine.bind_source(&runtime, source.clone()).unwrap();
        engine.ingest_snapshot(source.clone(), vec![candle(1, 10.0), candle(2, 11.0)]);

        engine.append_candle(source.clone(), candle(2, 42.0));
        engine.append_candle(source.clone(), candle(3, 43.0));

        assert_eq!(engine.runtime_snapshot(&runtime).unwrap().candle_count, 3);
        let market = engine.market_store.get(&source).unwrap();
        assert_eq!(market[1].close, 42.0);
        assert_eq!(market[2].close, 43.0);
    }

    #[test]
    fn tile_layout_fanout_updates_runtime_layout() {
        let mut engine = RuntimeEngine::new();
        let runtime_a = RuntimeId::new("tile-99", "tab-1");
        let runtime_b = RuntimeId::new("tile-99", "tab-2");
        engine
            .create_runtime(runtime_a.clone(), 1200.0, 700.0)
            .unwrap();
        engine
            .create_runtime(runtime_b.clone(), 1200.0, 700.0)
            .unwrap();

        let mut weights = BTreeMap::new();
        weights.insert("price".to_string(), 3.0);
        weights.insert("rsi".to_string(), 1.0);
        engine
            .set_tile_layout(
                "tile-99",
                TileLayoutConfig {
                    pane_order: vec!["rsi".to_string()],
                    pane_weights: weights,
                },
            )
            .unwrap();

        let snapshot_a = engine.runtime_snapshot(&runtime_a).unwrap();
        let snapshot_b = engine.runtime_snapshot(&runtime_b).unwrap();
        assert!(snapshot_a
            .pane_layout_state
            .order
            .iter()
            .any(|id| id == "rsi"));
        assert!(snapshot_b
            .pane_layout_state
            .order
            .iter()
            .any(|id| id == "rsi"));
        assert_eq!(snapshot_a.tile_config_version, 1);
        assert_eq!(snapshot_b.tile_config_version, 1);
    }

    #[test]
    fn missing_runtime_returns_deterministic_error() {
        let mut engine = RuntimeEngine::new();
        let err = engine
            .bind_source(
                &RuntimeId::new("tile-missing", "tab-missing"),
                SourceKey::new("BTCUSDT", "1m"),
            )
            .unwrap_err();
        assert!(matches!(err, RuntimeEngineError::RuntimeNotFound(_)));
    }
}

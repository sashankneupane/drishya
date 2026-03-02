//! Plot-provider adapters backed by `ta-engine` compute.

use crate::indicators::contracts::{
    IndicatorId, IndicatorParamValue, IndicatorSpec, NormalizedSeries,
};
use crate::indicators::engine::types::{
    IndicatorComputeContext, IndicatorComputeRequest, OhlcvBatch,
};
use crate::indicators::engine::IndicatorComputeProvider;
use crate::indicators::error::IndicatorError;
use crate::indicators::provider::ta_engine_provider::TaEngineProvider;
use crate::plots::model::{
    BandStyle, HistogramStyle, LinePattern, LineStyle, PaneId, PlotPrimitive, PlotSeries,
};
use crate::plots::provider::PlotDataProvider;
use crate::types::Candle;
use serde_json::Value as JsonValue;
use std::collections::BTreeMap;

fn ohlcv_from_candles(candles: &[Candle]) -> OhlcvBatch {
    OhlcvBatch {
        timestamps: candles.iter().map(|c| c.ts).collect(),
        open: candles.iter().map(|c| c.open).collect(),
        high: candles.iter().map(|c| c.high).collect(),
        low: candles.iter().map(|c| c.low).collect(),
        close: candles.iter().map(|c| c.close).collect(),
        volume: Some(candles.iter().map(|c| c.volume).collect()),
    }
}

fn make_request(
    id: &str,
    params: Vec<(String, IndicatorParamValue)>,
    candles: &[Candle],
) -> IndicatorComputeRequest {
    IndicatorComputeRequest {
        context: IndicatorComputeContext {
            symbol: "unknown".to_string(),
            timeframe: "unknown".to_string(),
        },
        spec: IndicatorSpec {
            id: IndicatorId(id.to_string()),
            params,
        },
        ohlcv: ohlcv_from_candles(candles),
    }
}

fn values_or_none(series: Option<&NormalizedSeries>, len: usize) -> Vec<Option<f64>> {
    match series {
        Some(s) => s.values.clone(),
        None => vec![None; len],
    }
}

fn param_value_to_json(value: &IndicatorParamValue) -> JsonValue {
    match value {
        IndicatorParamValue::Int(v) => JsonValue::from(*v),
        IndicatorParamValue::Float(v) => JsonValue::from(*v),
        IndicatorParamValue::Bool(v) => JsonValue::from(*v),
        IndicatorParamValue::Text(v) => JsonValue::from(v.clone()),
    }
}

fn series_instance_id(indicator_id: &str, params: &[(String, IndicatorParamValue)]) -> String {
    for (key, value) in params {
        if key == "__instance" {
            if let IndicatorParamValue::Text(v) = value {
                let trimmed = v.trim();
                if !trimmed.is_empty() {
                    return format!("{indicator_id}::{trimmed}");
                }
            }
        }
    }
    let mut map = serde_json::Map::new();
    for (key, value) in params {
        map.insert(key.clone(), param_value_to_json(value));
    }
    let encoded = serde_json::to_string(&map)
        .ok()
        .map(|raw| {
            let mut out = String::with_capacity(raw.len() * 2);
            for b in raw.as_bytes() {
                use std::fmt::Write as _;
                let _ = write!(&mut out, "{:02x}", b);
            }
            out
        })
        .unwrap_or_else(|| "7b7d".to_string());
    format!("{indicator_id}::{encoded}")
}

fn style_slot_map(
    meta: &ta_engine::metadata::IndicatorMeta,
) -> BTreeMap<&'static str, ta_engine::metadata::StyleSlotMeta> {
    meta.visual
        .style_slots
        .iter()
        .map(|slot| (slot.slot, *slot))
        .collect()
}

fn map_pane_hint(id: &str, pane_hint: ta_engine::metadata::IndicatorPaneHint) -> PaneId {
    match pane_hint {
        ta_engine::metadata::IndicatorPaneHint::PriceOverlay => PaneId::Price,
        ta_engine::metadata::IndicatorPaneHint::VolumeOverlay => {
            PaneId::Named("volume".to_string())
        }
        ta_engine::metadata::IndicatorPaneHint::SeparatePane => PaneId::Named(id.to_string()),
        ta_engine::metadata::IndicatorPaneHint::Auto => PaneId::Named(id.to_string()),
    }
}

pub struct TaCatalogPlotProvider {
    indicator_id: String,
    params: Vec<(String, IndicatorParamValue)>,
}

impl TaCatalogPlotProvider {
    pub fn new(indicator_id: String, params: Vec<(String, IndicatorParamValue)>) -> Self {
        Self {
            indicator_id,
            params,
        }
    }
}

impl PlotDataProvider for TaCatalogPlotProvider {
    fn build_series(&self, candles: &[Candle]) -> Vec<PlotSeries> {
        match self.build_series_strict(candles) {
            Ok(series) => series,
            Err(error) => {
                eprintln!(
                    "strict indicator provider '{}' failed contract validation: {}",
                    self.indicator_id, error
                );
                Vec::new()
            }
        }
    }
}

impl TaCatalogPlotProvider {
    fn build_series_strict(&self, candles: &[Candle]) -> Result<Vec<PlotSeries>, IndicatorError> {
        let provider = TaEngineProvider::new();
        let req = make_request(&self.indicator_id, self.params.clone(), candles);
        let out = provider
            .compute(&req)
            .map_err(|reason| IndicatorError::ComputeFailed {
                indicator_id: self.indicator_id.clone(),
                reason: reason.to_string(),
            })?;
        let Some(meta) = ta_engine::metadata::find_indicator_meta(&self.indicator_id) else {
            return Err(IndicatorError::UnsupportedIndicator {
                id: self.indicator_id.clone(),
            });
        };
        let slot_map = style_slot_map(meta);
        let line_map: BTreeMap<String, Vec<Option<f64>>> = out
            .lines
            .into_iter()
            .map(|line| (line.name, line.values))
            .collect();

        let mut primitives = Vec::new();
        for visual in meta.visual.output_visuals {
            let Some(slot) = slot_map.get(visual.style_slot) else {
                return Err(IndicatorError::MissingStyleSlot {
                    indicator_id: self.indicator_id.clone(),
                    slot: visual.style_slot.to_string(),
                });
            };
            match visual.primitive {
                ta_engine::metadata::OutputVisualPrimitive::Line => {
                    let values = line_map.get(visual.output).cloned().ok_or_else(|| {
                        IndicatorError::MissingOutputLine {
                            indicator_id: self.indicator_id.clone(),
                            output: visual.output.to_string(),
                        }
                    })?;
                    let width =
                        slot.default
                            .width
                            .ok_or_else(|| IndicatorError::MissingStyleDefault {
                                indicator_id: self.indicator_id.clone(),
                                slot: slot.slot.to_string(),
                                field: "width".to_string(),
                            })?;
                    let pattern = slot.default.pattern.ok_or_else(|| {
                        IndicatorError::MissingStyleDefault {
                            indicator_id: self.indicator_id.clone(),
                            slot: slot.slot.to_string(),
                            field: "pattern".to_string(),
                        }
                    })?;
                    primitives.push(PlotPrimitive::Line {
                        values,
                        style: LineStyle {
                            color: slot.default.color.to_string(),
                            width: width as f32,
                            pattern: match pattern {
                                ta_engine::metadata::StrokePattern::Dashed => LinePattern::Dashed,
                                ta_engine::metadata::StrokePattern::Dotted => LinePattern::Dotted,
                                ta_engine::metadata::StrokePattern::Solid => LinePattern::Solid,
                            },
                        },
                    });
                }
                ta_engine::metadata::OutputVisualPrimitive::Histogram => {
                    let values = line_map.get(visual.output).cloned().ok_or_else(|| {
                        IndicatorError::MissingOutputLine {
                            indicator_id: self.indicator_id.clone(),
                            output: visual.output.to_string(),
                        }
                    })?;
                    let color = slot.default.color.to_string();
                    let width_factor =
                        slot.default
                            .width
                            .ok_or_else(|| IndicatorError::MissingStyleDefault {
                                indicator_id: self.indicator_id.clone(),
                                slot: slot.slot.to_string(),
                                field: "width".to_string(),
                            })?;
                    primitives.push(PlotPrimitive::Histogram {
                        values,
                        base: 0.0,
                        style: HistogramStyle {
                            positive_color: color.clone(),
                            negative_color: color,
                            width_factor: width_factor as f32,
                        },
                    });
                }
                ta_engine::metadata::OutputVisualPrimitive::BandFill => {
                    let (Some(upper), Some(lower)) = (line_map.get("upper"), line_map.get("lower"))
                    else {
                        return Err(IndicatorError::MissingOutputLine {
                            indicator_id: self.indicator_id.clone(),
                            output: "upper/lower".to_string(),
                        });
                    };
                    primitives.push(PlotPrimitive::Band {
                        upper: upper.clone(),
                        lower: lower.clone(),
                        style: BandStyle {
                            fill_color: slot.default.color.to_string(),
                        },
                    });
                }
                ta_engine::metadata::OutputVisualPrimitive::Markers
                | ta_engine::metadata::OutputVisualPrimitive::SignalFlag => {}
            }
        }

        if primitives.is_empty() {
            return Err(IndicatorError::InvalidParameter {
                name: "visual.output_visuals".to_string(),
                reason: "no chart-plottable primitives were produced".to_string(),
            });
        }

        Ok(vec![PlotSeries {
            id: series_instance_id(&self.indicator_id, &self.params),
            name: meta.display_name.to_string(),
            pane: map_pane_hint(&self.indicator_id, meta.visual.pane_hint),
            visible: true,
            primitives,
        }])
    }
}

// Legacy convenience adapters are retained only for regression test parity.
// Chart integration should use TaCatalogPlotProvider through add_indicator_with_params.
pub struct TaSmaPlotProvider {
    period: usize,
    color: String,
    width: f32,
}

impl TaSmaPlotProvider {
    pub fn new(period: usize) -> Self {
        Self {
            period,
            color: "#f59e0b".to_string(),
            width: 1.5,
        }
    }
}

impl PlotDataProvider for TaSmaPlotProvider {
    fn build_series(&self, candles: &[Candle]) -> Vec<PlotSeries> {
        let provider = TaEngineProvider::new();
        let req = make_request(
            "sma",
            vec![(
                "period".to_string(),
                IndicatorParamValue::Int(self.period as i64),
            )],
            candles,
        );
        let out = provider.compute(&req).ok();
        let values = out
            .as_ref()
            .and_then(|v| v.lines.first())
            .map(|l| l.values.clone())
            .unwrap_or_else(|| vec![None; candles.len()]);

        vec![PlotSeries {
            id: format!("sma:{}", self.period),
            name: format!("SMA({})", self.period),
            pane: PaneId::Price,
            visible: true,
            primitives: vec![PlotPrimitive::Line {
                values,
                style: LineStyle {
                    color: self.color.clone(),
                    width: self.width,
                    pattern: LinePattern::Solid,
                },
            }],
        }]
    }
}

pub struct TaEmaPlotProvider {
    period: usize,
    color: String,
    width: f32,
}

impl TaEmaPlotProvider {
    pub fn new(period: usize) -> Self {
        Self {
            period,
            color: "#f97316".to_string(),
            width: 1.5,
        }
    }
}

impl PlotDataProvider for TaEmaPlotProvider {
    fn build_series(&self, candles: &[Candle]) -> Vec<PlotSeries> {
        let provider = TaEngineProvider::new();
        let req = make_request(
            "ema",
            vec![(
                "period".to_string(),
                IndicatorParamValue::Int(self.period as i64),
            )],
            candles,
        );
        let out = provider.compute(&req).ok();
        let values = out
            .as_ref()
            .and_then(|v| v.lines.first())
            .map(|l| l.values.clone())
            .unwrap_or_else(|| vec![None; candles.len()]);

        vec![PlotSeries {
            id: format!("ema:{}", self.period),
            name: format!("EMA({})", self.period),
            pane: PaneId::Price,
            visible: true,
            primitives: vec![PlotPrimitive::Line {
                values,
                style: LineStyle {
                    color: self.color.clone(),
                    width: self.width,
                    pattern: LinePattern::Solid,
                },
            }],
        }]
    }
}

pub struct TaRsiPlotProvider {
    period: usize,
}

impl TaRsiPlotProvider {
    pub fn new(period: usize) -> Self {
        Self { period }
    }
}

impl PlotDataProvider for TaRsiPlotProvider {
    fn build_series(&self, candles: &[Candle]) -> Vec<PlotSeries> {
        let provider = TaEngineProvider::new();
        let req = make_request(
            "rsi",
            vec![(
                "period".to_string(),
                IndicatorParamValue::Int(self.period as i64),
            )],
            candles,
        );
        let out = provider.compute(&req).ok();
        let values = out
            .as_ref()
            .and_then(|v| v.lines.first())
            .map(|l| l.values.clone())
            .unwrap_or_else(|| vec![None; candles.len()]);
        let upper = vec![Some(70.0); candles.len()];
        let lower = vec![Some(30.0); candles.len()];
        vec![PlotSeries {
            id: format!("rsi:{}", self.period),
            name: format!("RSI({})", self.period),
            pane: PaneId::Named("rsi".to_string()),
            visible: true,
            primitives: vec![
                PlotPrimitive::Line {
                    values: upper,
                    style: LineStyle {
                        color: "rgba(148,163,184,0.75)".to_string(),
                        width: 1.0,
                        pattern: LinePattern::Dashed,
                    },
                },
                PlotPrimitive::Line {
                    values: lower,
                    style: LineStyle {
                        color: "rgba(148,163,184,0.75)".to_string(),
                        width: 1.0,
                        pattern: LinePattern::Dashed,
                    },
                },
                PlotPrimitive::Line {
                    values,
                    style: LineStyle {
                        color: "#34d399".to_string(),
                        width: 1.3,
                        pattern: LinePattern::Solid,
                    },
                },
            ],
        }]
    }
}

pub struct TaMacdPlotProvider {
    fast: usize,
    slow: usize,
    signal: usize,
}

impl TaMacdPlotProvider {
    pub fn new(fast: usize, slow: usize, signal: usize) -> Self {
        Self { fast, slow, signal }
    }
}

impl PlotDataProvider for TaMacdPlotProvider {
    fn build_series(&self, candles: &[Candle]) -> Vec<PlotSeries> {
        let provider = TaEngineProvider::new();
        let req = make_request(
            "macd",
            vec![
                (
                    "fast_period".to_string(),
                    IndicatorParamValue::Int(self.fast as i64),
                ),
                (
                    "slow_period".to_string(),
                    IndicatorParamValue::Int(self.slow as i64),
                ),
                (
                    "signal_period".to_string(),
                    IndicatorParamValue::Int(self.signal as i64),
                ),
            ],
            candles,
        );
        let out = provider.compute(&req).ok();
        let len = candles.len();
        let macd = values_or_none(out.as_ref().and_then(|s| s.lines.first()), len);
        let signal = values_or_none(out.as_ref().and_then(|s| s.lines.get(1)), len);
        let histogram = values_or_none(out.as_ref().and_then(|s| s.lines.get(2)), len);
        vec![
            PlotSeries {
                id: format!("macd:{}:{}:{}", self.fast, self.slow, self.signal),
                name: format!("MACD({},{},{})", self.fast, self.slow, self.signal),
                pane: PaneId::Named("macd".to_string()),
                visible: true,
                primitives: vec![PlotPrimitive::Line {
                    values: macd,
                    style: LineStyle {
                        color: "#22d3ee".to_string(),
                        width: 1.3,
                        pattern: LinePattern::Solid,
                    },
                }],
            },
            PlotSeries {
                id: format!("macd-signal:{}:{}:{}", self.fast, self.slow, self.signal),
                name: "MACD Signal".to_string(),
                pane: PaneId::Named("macd".to_string()),
                visible: true,
                primitives: vec![PlotPrimitive::Line {
                    values: signal,
                    style: LineStyle {
                        color: "#f59e0b".to_string(),
                        width: 1.2,
                        pattern: LinePattern::Dashed,
                    },
                }],
            },
            PlotSeries {
                id: format!("macd-hist:{}:{}:{}", self.fast, self.slow, self.signal),
                name: "MACD Histogram".to_string(),
                pane: PaneId::Named("macd".to_string()),
                visible: true,
                primitives: vec![PlotPrimitive::Histogram {
                    values: histogram,
                    base: 0.0,
                    style: HistogramStyle {
                        positive_color: "rgba(34,197,94,0.45)".to_string(),
                        negative_color: "rgba(239,68,68,0.45)".to_string(),
                        width_factor: 0.7,
                    },
                }],
            },
        ]
    }
}

pub struct TaBbandsPlotProvider {
    period: usize,
    std_mult: f64,
}

impl TaBbandsPlotProvider {
    pub fn new(period: usize, std_mult: f64) -> Self {
        Self { period, std_mult }
    }
}

impl PlotDataProvider for TaBbandsPlotProvider {
    fn build_series(&self, candles: &[Candle]) -> Vec<PlotSeries> {
        let provider = TaEngineProvider::new();
        let req = make_request(
            "bbands",
            vec![
                (
                    "period".to_string(),
                    IndicatorParamValue::Int(self.period as i64),
                ),
                (
                    "std_dev".to_string(),
                    IndicatorParamValue::Float(self.std_mult),
                ),
            ],
            candles,
        );
        let out = provider.compute(&req).ok();
        let len = candles.len();
        let upper = values_or_none(out.as_ref().and_then(|s| s.lines.first()), len);
        let middle = values_or_none(out.as_ref().and_then(|s| s.lines.get(1)), len);
        let lower = values_or_none(out.as_ref().and_then(|s| s.lines.get(2)), len);
        vec![PlotSeries {
            id: format!("bbands:{}:{}", self.period, self.std_mult),
            name: format!("BBands({},{})", self.period, self.std_mult),
            pane: PaneId::Price,
            visible: true,
            primitives: vec![
                PlotPrimitive::Band {
                    upper: upper.clone(),
                    lower: lower.clone(),
                    style: BandStyle {
                        fill_color: "rgba(56,189,248,0.15)".to_string(),
                    },
                },
                PlotPrimitive::Line {
                    values: upper,
                    style: LineStyle {
                        color: "#38bdf8".to_string(),
                        width: 1.25,
                        pattern: LinePattern::Solid,
                    },
                },
                PlotPrimitive::Line {
                    values: middle,
                    style: LineStyle {
                        color: "#93c5fd".to_string(),
                        width: 1.25,
                        pattern: LinePattern::Dashed,
                    },
                },
                PlotPrimitive::Line {
                    values: lower,
                    style: LineStyle {
                        color: "#38bdf8".to_string(),
                        width: 1.25,
                        pattern: LinePattern::Solid,
                    },
                },
            ],
        }]
    }
}

pub struct TaAtrPlotProvider {
    period: usize,
}

impl TaAtrPlotProvider {
    pub fn new(period: usize) -> Self {
        Self { period }
    }
}

impl PlotDataProvider for TaAtrPlotProvider {
    fn build_series(&self, candles: &[Candle]) -> Vec<PlotSeries> {
        let provider = TaEngineProvider::new();
        let req = make_request(
            "atr",
            vec![(
                "period".to_string(),
                IndicatorParamValue::Int(self.period as i64),
            )],
            candles,
        );
        let out = provider.compute(&req).ok();
        let values = out
            .as_ref()
            .and_then(|v| v.lines.first())
            .map(|l| l.values.clone())
            .unwrap_or_else(|| vec![None; candles.len()]);

        vec![PlotSeries {
            id: format!("atr:{}", self.period),
            name: format!("ATR({})", self.period),
            pane: PaneId::Named("atr".to_string()),
            visible: true,
            primitives: vec![PlotPrimitive::Line {
                values,
                style: LineStyle {
                    color: "#fda4af".to_string(),
                    width: 1.3,
                    pattern: LinePattern::Solid,
                },
            }],
        }]
    }
}

pub struct TaStochasticPlotProvider {
    k: usize,
    d: usize,
    smooth: usize,
}

impl TaStochasticPlotProvider {
    pub fn new(k: usize, d: usize, smooth: usize) -> Self {
        Self { k, d, smooth }
    }
}

impl PlotDataProvider for TaStochasticPlotProvider {
    fn build_series(&self, candles: &[Candle]) -> Vec<PlotSeries> {
        let provider = TaEngineProvider::new();
        let req = make_request(
            "stochastic",
            vec![
                (
                    "k_period".to_string(),
                    IndicatorParamValue::Int(self.k as i64),
                ),
                (
                    "d_period".to_string(),
                    IndicatorParamValue::Int(self.d as i64),
                ),
                (
                    "smooth".to_string(),
                    IndicatorParamValue::Int(self.smooth as i64),
                ),
            ],
            candles,
        );
        let out = provider.compute(&req).ok();
        let len = candles.len();
        let k_values = values_or_none(out.as_ref().and_then(|s| s.lines.first()), len);
        let d_values = values_or_none(out.as_ref().and_then(|s| s.lines.get(1)), len);

        vec![
            PlotSeries {
                id: format!("stoch-k:{}:{}:{}", self.k, self.d, self.smooth),
                name: format!("Stoch %K({},{},{})", self.k, self.d, self.smooth),
                pane: PaneId::Named("stoch".to_string()),
                visible: true,
                primitives: vec![PlotPrimitive::Line {
                    values: k_values,
                    style: LineStyle {
                        color: "#60a5fa".to_string(),
                        width: 1.2,
                        pattern: LinePattern::Solid,
                    },
                }],
            },
            PlotSeries {
                id: format!("stoch-d:{}:{}:{}", self.k, self.d, self.smooth),
                name: "Stoch %D".to_string(),
                pane: PaneId::Named("stoch".to_string()),
                visible: true,
                primitives: vec![PlotPrimitive::Line {
                    values: d_values,
                    style: LineStyle {
                        color: "#f59e0b".to_string(),
                        width: 1.2,
                        pattern: LinePattern::Dashed,
                    },
                }],
            },
        ]
    }
}

pub struct TaObvPlotProvider;

impl TaObvPlotProvider {
    pub fn new() -> Self {
        Self
    }
}

impl Default for TaObvPlotProvider {
    fn default() -> Self {
        Self::new()
    }
}

impl PlotDataProvider for TaObvPlotProvider {
    fn build_series(&self, candles: &[Candle]) -> Vec<PlotSeries> {
        let provider = TaEngineProvider::new();
        let req = make_request("obv", Vec::new(), candles);
        let out = provider.compute(&req).ok();
        let values = out
            .as_ref()
            .and_then(|v| v.lines.first())
            .map(|l| l.values.clone())
            .unwrap_or_else(|| vec![None; candles.len()]);

        vec![PlotSeries {
            id: "obv".to_string(),
            name: "OBV".to_string(),
            pane: PaneId::Named("obv".to_string()),
            visible: true,
            primitives: vec![PlotPrimitive::Line {
                values,
                style: LineStyle {
                    color: "#c084fc".to_string(),
                    width: 1.2,
                    pattern: LinePattern::Solid,
                },
            }],
        }]
    }
}

pub struct TaVwapPlotProvider;

impl TaVwapPlotProvider {
    pub fn new() -> Self {
        Self
    }
}

impl Default for TaVwapPlotProvider {
    fn default() -> Self {
        Self::new()
    }
}

impl PlotDataProvider for TaVwapPlotProvider {
    fn build_series(&self, candles: &[Candle]) -> Vec<PlotSeries> {
        let provider = TaEngineProvider::new();
        let req = make_request("vwap", Vec::new(), candles);
        let out = provider.compute(&req).ok();
        let values = out
            .as_ref()
            .and_then(|v| v.lines.first())
            .map(|l| l.values.clone())
            .unwrap_or_else(|| vec![None; candles.len()]);

        vec![PlotSeries {
            id: "vwap".to_string(),
            name: "VWAP".to_string(),
            pane: PaneId::Price,
            visible: true,
            primitives: vec![PlotPrimitive::Line {
                values,
                style: LineStyle {
                    color: "#34d399".to_string(),
                    width: 1.3,
                    pattern: LinePattern::Solid,
                },
            }],
        }]
    }
}

pub struct TaAdxPlotProvider {
    period: usize,
}

impl TaAdxPlotProvider {
    pub fn new(period: usize) -> Self {
        Self { period }
    }
}

impl PlotDataProvider for TaAdxPlotProvider {
    fn build_series(&self, candles: &[Candle]) -> Vec<PlotSeries> {
        let provider = TaEngineProvider::new();
        let req = make_request(
            "adx",
            vec![(
                "period".to_string(),
                IndicatorParamValue::Int(self.period as i64),
            )],
            candles,
        );
        let out = provider.compute(&req).ok();
        let len = candles.len();
        let adx = values_or_none(out.as_ref().and_then(|s| s.lines.first()), len);
        let plus = values_or_none(out.as_ref().and_then(|s| s.lines.get(1)), len);
        let minus = values_or_none(out.as_ref().and_then(|s| s.lines.get(2)), len);

        vec![
            PlotSeries {
                id: format!("adx:{}", self.period),
                name: format!("ADX({})", self.period),
                pane: PaneId::Named("adx".to_string()),
                visible: true,
                primitives: vec![PlotPrimitive::Line {
                    values: adx,
                    style: LineStyle {
                        color: "#e2e8f0".to_string(),
                        width: 1.3,
                        pattern: LinePattern::Solid,
                    },
                }],
            },
            PlotSeries {
                id: format!("plus-di:{}", self.period),
                name: format!("+DI({})", self.period),
                pane: PaneId::Named("adx".to_string()),
                visible: true,
                primitives: vec![PlotPrimitive::Line {
                    values: plus,
                    style: LineStyle {
                        color: "#22c55e".to_string(),
                        width: 1.1,
                        pattern: LinePattern::Solid,
                    },
                }],
            },
            PlotSeries {
                id: format!("minus-di:{}", self.period),
                name: format!("-DI({})", self.period),
                pane: PaneId::Named("adx".to_string()),
                visible: true,
                primitives: vec![PlotPrimitive::Line {
                    values: minus,
                    style: LineStyle {
                        color: "#ef4444".to_string(),
                        width: 1.1,
                        pattern: LinePattern::Solid,
                    },
                }],
            },
        ]
    }
}

pub struct TaAoHistogramPlotProvider {
    fast: usize,
    slow: usize,
}

impl TaAoHistogramPlotProvider {
    pub fn new() -> Self {
        Self { fast: 5, slow: 34 }
    }
}

impl Default for TaAoHistogramPlotProvider {
    fn default() -> Self {
        Self::new()
    }
}

impl PlotDataProvider for TaAoHistogramPlotProvider {
    fn build_series(&self, candles: &[Candle]) -> Vec<PlotSeries> {
        let provider = TaEngineProvider::new();
        let req = make_request(
            "ao",
            vec![
                (
                    "fast_period".to_string(),
                    IndicatorParamValue::Int(self.fast as i64),
                ),
                (
                    "slow_period".to_string(),
                    IndicatorParamValue::Int(self.slow as i64),
                ),
            ],
            candles,
        );
        let out = provider.compute(&req).ok();
        let values = out
            .as_ref()
            .and_then(|v| v.lines.first())
            .map(|l| l.values.clone())
            .unwrap_or_else(|| vec![None; candles.len()]);

        vec![PlotSeries {
            id: format!("ao-hist:{}:{}", self.fast, self.slow),
            name: format!("AO({},{})", self.fast, self.slow),
            pane: PaneId::Named("momentum".to_string()),
            visible: true,
            primitives: vec![PlotPrimitive::Histogram {
                values,
                base: 0.0,
                style: HistogramStyle {
                    positive_color: "rgba(34,197,94,0.40)".to_string(),
                    negative_color: "rgba(239,68,68,0.40)".to_string(),
                    width_factor: 0.7,
                },
            }],
        }]
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::indicators::contracts::{IndicatorId, IndicatorParamValue, IndicatorSpec};
    use crate::indicators::engine::types::{IndicatorComputeContext, IndicatorComputeRequest};
    use crate::indicators::engine::IndicatorComputeProvider;
    use crate::indicators::provider::ta_engine_provider::TaEngineProvider;
    type TripleSeriesRef<'a> = (&'a [Option<f64>], &'a [Option<f64>], &'a [Option<f64>]);

    fn compute_ta_lines(
        id: &str,
        params: Vec<(String, IndicatorParamValue)>,
        candles: &[Candle],
    ) -> Vec<NormalizedSeries> {
        let provider = TaEngineProvider::new();
        let req = IndicatorComputeRequest {
            context: IndicatorComputeContext {
                symbol: "BTCUSD".to_string(),
                timeframe: "1m".to_string(),
            },
            spec: IndicatorSpec {
                id: IndicatorId(id.to_string()),
                params,
            },
            ohlcv: ohlcv_from_candles(candles),
        };
        provider.compute(&req).unwrap().lines
    }

    fn sample_candles(n: usize) -> Vec<Candle> {
        (0..n)
            .map(|i| {
                let base = 100.0 + (i as f64) * 0.8;
                let wave = ((i as f64) / 5.0).sin() * 2.5;
                let close = base + wave;
                let open = close - 0.6;
                let high = close + 1.1;
                let low = close - 1.2;
                let volume = 1_000.0 + ((i * 17) as f64);
                Candle {
                    ts: 1_700_000_000 + (i as i64) * 60,
                    open,
                    high,
                    low,
                    close,
                    volume,
                }
            })
            .collect()
    }

    fn assert_option_vec_close(lhs: &[Option<f64>], rhs: &[Option<f64>], tol: f64) {
        assert_eq!(lhs.len(), rhs.len(), "series length mismatch");
        for (idx, (l, r)) in lhs.iter().zip(rhs.iter()).enumerate() {
            match (l, r) {
                (None, None) => {}
                (Some(a), Some(b)) => {
                    let delta = (a - b).abs();
                    assert!(
                        delta <= tol,
                        "value mismatch at index {idx}: {a} vs {b}, delta={delta}, tol={tol}"
                    );
                }
                _ => panic!("mask mismatch at index {idx}: {l:?} vs {r:?}"),
            }
        }
    }

    fn line_values_at(series: &PlotSeries, primitive_index: usize) -> &[Option<f64>] {
        match series.primitives.get(primitive_index) {
            Some(PlotPrimitive::Line { values, .. }) => values,
            other => panic!("expected line primitive, got {other:?}"),
        }
    }

    fn histogram_values(series: &PlotSeries) -> &[Option<f64>] {
        match series.primitives.first() {
            Some(PlotPrimitive::Histogram { values, .. }) => values,
            other => panic!("expected first primitive to be histogram, got {other:?}"),
        }
    }

    fn bbands_values(series: &PlotSeries) -> TripleSeriesRef<'_> {
        assert_eq!(series.primitives.len(), 4);
        let (upper, lower) = match &series.primitives[0] {
            PlotPrimitive::Band { upper, lower, .. } => (upper.as_slice(), lower.as_slice()),
            other => panic!("expected first primitive to be band, got {other:?}"),
        };
        let middle = match &series.primitives[2] {
            PlotPrimitive::Line { values, .. } => values.as_slice(),
            other => panic!("expected middle primitive to be line, got {other:?}"),
        };
        (upper, middle, lower)
    }

    #[test]
    fn sma_plot_provider_matches_ta_engine_output() {
        let candles = sample_candles(180);
        let lines = compute_ta_lines(
            "sma",
            vec![("period".to_string(), IndicatorParamValue::Int(14))],
            &candles,
        );
        let native = TaSmaPlotProvider::new(14).build_series(&candles);
        assert_eq!(native.len(), 1);
        assert_eq!(lines.len(), 1);
        assert_option_vec_close(&lines[0].values, line_values_at(&native[0], 0), 1e-8);
    }

    #[test]
    fn ema_plot_provider_matches_ta_engine_output() {
        let candles = sample_candles(180);
        let lines = compute_ta_lines(
            "ema",
            vec![("period".to_string(), IndicatorParamValue::Int(21))],
            &candles,
        );
        let native = TaEmaPlotProvider::new(21).build_series(&candles);
        assert_eq!(native.len(), 1);
        assert_eq!(lines.len(), 1);
        assert_option_vec_close(&lines[0].values, line_values_at(&native[0], 0), 1e-8);
    }

    #[test]
    fn rsi_plot_provider_matches_ta_engine_output() {
        let candles = sample_candles(220);
        let lines = compute_ta_lines(
            "rsi",
            vec![("period".to_string(), IndicatorParamValue::Int(14))],
            &candles,
        );
        let native = TaRsiPlotProvider::new(14).build_series(&candles);
        assert_eq!(native.len(), 1);
        assert_eq!(lines.len(), 1);
        assert_option_vec_close(&lines[0].values, line_values_at(&native[0], 2), 1e-8);
    }

    #[test]
    fn macd_plot_provider_matches_ta_engine_output() {
        let candles = sample_candles(220);
        let lines = compute_ta_lines(
            "macd",
            vec![
                ("fast_period".to_string(), IndicatorParamValue::Int(12)),
                ("slow_period".to_string(), IndicatorParamValue::Int(26)),
                ("signal_period".to_string(), IndicatorParamValue::Int(9)),
            ],
            &candles,
        );
        let native = TaMacdPlotProvider::new(12, 26, 9).build_series(&candles);
        assert_eq!(native.len(), 3);
        assert_eq!(lines.len(), 3);
        assert_option_vec_close(&lines[0].values, line_values_at(&native[0], 0), 1e-8);
        assert_option_vec_close(&lines[1].values, line_values_at(&native[1], 0), 1e-8);
        assert_option_vec_close(&lines[2].values, histogram_values(&native[2]), 1e-8);
    }

    #[test]
    fn bbands_plot_provider_matches_ta_engine_output() {
        let candles = sample_candles(220);
        let lines = compute_ta_lines(
            "bbands",
            vec![
                ("period".to_string(), IndicatorParamValue::Int(20)),
                ("std_dev".to_string(), IndicatorParamValue::Float(2.0)),
            ],
            &candles,
        );
        let native = TaBbandsPlotProvider::new(20, 2.0).build_series(&candles);
        assert_eq!(native.len(), 1);
        assert_eq!(lines.len(), 3);

        let (upper, middle, lower) = bbands_values(&native[0]);
        assert_option_vec_close(&lines[0].values, upper, 1e-8);
        assert_option_vec_close(&lines[1].values, middle, 1e-8);
        assert_option_vec_close(&lines[2].values, lower, 1e-8);
    }
}

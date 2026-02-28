//! Plot-provider adapters backed by `ta-engine` compute.

use crate::indicators::contracts::{
    IndicatorId, IndicatorParamValue, IndicatorSpec, NormalizedSeries,
};
use crate::indicators::engine::types::{
    IndicatorComputeContext, IndicatorComputeRequest, OhlcvBatch,
};
use crate::indicators::engine::IndicatorComputeProvider;
use crate::indicators::provider::ta_engine_provider::TaEngineProvider;
use crate::plots::model::{
    BandStyle, HistogramStyle, LinePattern, LineStyle, PaneId, PlotPrimitive, PlotSeries,
};
use crate::plots::provider::PlotDataProvider;
use crate::types::Candle;

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
        vec![PlotSeries {
            id: format!("rsi:{}", self.period),
            name: format!("RSI({})", self.period),
            pane: PaneId::Named("rsi".to_string()),
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

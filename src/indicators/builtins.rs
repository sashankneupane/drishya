//! Built-in indicator adapters backed by `indicators-rs`.
//!
//! These are optional conveniences for demos and batteries-included usage.

use indicators_rs::indicators;

use crate::{
    plots::{
        model::{
            BandStyle, HistogramStyle, LinePattern, LineStyle, PaneId, PlotPrimitive, PlotSeries,
        },
        provider::PlotDataProvider,
    },
    types::Candle,
};

fn close_values(candles: &[Candle]) -> Vec<f64> {
    candles.iter().map(|c| c.close).collect()
}

fn high_values(candles: &[Candle]) -> Vec<f64> {
    candles.iter().map(|c| c.high).collect()
}

fn low_values(candles: &[Candle]) -> Vec<f64> {
    candles.iter().map(|c| c.low).collect()
}

fn volume_values(candles: &[Candle]) -> Vec<f64> {
    candles.iter().map(|c| c.volume).collect()
}

pub struct SmaProvider {
    pub period: usize,
    pub color: String,
    pub width: f32,
}

impl SmaProvider {
    pub fn new(period: usize) -> Self {
        Self {
            period,
            color: "#f59e0b".to_string(),
            width: 1.5,
        }
    }
}

impl PlotDataProvider for SmaProvider {
    fn build_series(&self, candles: &[Candle]) -> Vec<PlotSeries> {
        let period = self.period.max(1);
        let close = close_values(candles);
        let values = indicators::sma(&close, period).unwrap_or_else(|_| vec![None; candles.len()]);

        vec![PlotSeries {
            id: format!("sma:{period}"),
            name: format!("SMA({period})"),
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

pub struct EmaProvider {
    pub period: usize,
    pub color: String,
    pub width: f32,
}

impl EmaProvider {
    pub fn new(period: usize) -> Self {
        Self {
            period,
            color: "#f97316".to_string(),
            width: 1.5,
        }
    }
}

impl PlotDataProvider for EmaProvider {
    fn build_series(&self, candles: &[Candle]) -> Vec<PlotSeries> {
        let period = self.period.max(1);
        let close = close_values(candles);
        let values = indicators::ema(&close, period).unwrap_or_else(|_| vec![None; candles.len()]);

        vec![PlotSeries {
            id: format!("ema:{period}"),
            name: format!("EMA({period})"),
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

pub struct BbandsProvider {
    pub period: usize,
    pub std_mult: f64,
    pub upper_color: String,
    pub middle_color: String,
    pub lower_color: String,
    pub band_fill: String,
    pub line_width: f32,
}

impl BbandsProvider {
    pub fn new(period: usize, std_mult: f64) -> Self {
        Self {
            period,
            std_mult,
            upper_color: "#38bdf8".to_string(),
            middle_color: "#93c5fd".to_string(),
            lower_color: "#38bdf8".to_string(),
            band_fill: "rgba(56,189,248,0.15)".to_string(),
            line_width: 1.25,
        }
    }
}

impl PlotDataProvider for BbandsProvider {
    fn build_series(&self, candles: &[Candle]) -> Vec<PlotSeries> {
        let period = self.period.max(1);
        let close = close_values(candles);
        let out = indicators::bbands(&close, period, self.std_mult).ok();
        let (upper, middle, lower) = if let Some(out) = out {
            (out.upper, out.middle, out.lower)
        } else {
            let none = vec![None; candles.len()];
            (none.clone(), none.clone(), none)
        };

        vec![PlotSeries {
            id: format!("bbands:{period}:{}", self.std_mult),
            name: format!("BBands({period},{})", self.std_mult),
            pane: PaneId::Price,
            visible: true,
            primitives: vec![
                PlotPrimitive::Band {
                    upper: upper.clone(),
                    lower: lower.clone(),
                    style: BandStyle {
                        fill_color: self.band_fill.clone(),
                    },
                },
                PlotPrimitive::Line {
                    values: upper,
                    style: LineStyle {
                        color: self.upper_color.clone(),
                        width: self.line_width,
                        pattern: LinePattern::Solid,
                    },
                },
                PlotPrimitive::Line {
                    values: middle,
                    style: LineStyle {
                        color: self.middle_color.clone(),
                        width: self.line_width,
                        pattern: LinePattern::Dashed,
                    },
                },
                PlotPrimitive::Line {
                    values: lower,
                    style: LineStyle {
                        color: self.lower_color.clone(),
                        width: self.line_width,
                        pattern: LinePattern::Solid,
                    },
                },
            ],
        }]
    }
}

pub struct MacdProvider {
    pub fast: usize,
    pub slow: usize,
    pub signal: usize,
}

impl MacdProvider {
    pub fn new(fast: usize, slow: usize, signal: usize) -> Self {
        Self { fast, slow, signal }
    }
}

impl PlotDataProvider for MacdProvider {
    fn build_series(&self, candles: &[Candle]) -> Vec<PlotSeries> {
        let close = close_values(candles);
        let out = indicators::macd(
            &close,
            self.fast.max(1),
            self.slow.max(self.fast + 1),
            self.signal.max(1),
        )
        .ok();
        let (line, signal, histogram) = if let Some(out) = out {
            (out.line, out.signal, out.histogram)
        } else {
            let none = vec![None; candles.len()];
            (none.clone(), none.clone(), none)
        };

        vec![
            PlotSeries {
                id: format!("macd:{}:{}:{}", self.fast, self.slow, self.signal),
                name: format!("MACD({},{},{})", self.fast, self.slow, self.signal),
                pane: PaneId::Named("macd".to_string()),
                visible: true,
                primitives: vec![PlotPrimitive::Line {
                    values: line,
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

pub struct AtrProvider {
    pub period: usize,
}

impl AtrProvider {
    pub fn new(period: usize) -> Self {
        Self { period }
    }
}

impl PlotDataProvider for AtrProvider {
    fn build_series(&self, candles: &[Candle]) -> Vec<PlotSeries> {
        let high = high_values(candles);
        let low = low_values(candles);
        let close = close_values(candles);
        let values = indicators::atr(&high, &low, &close, self.period.max(1))
            .unwrap_or_else(|_| vec![None; candles.len()]);
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

pub struct StochasticProvider {
    pub k: usize,
    pub d: usize,
    pub smooth: usize,
}

impl StochasticProvider {
    pub fn new(k: usize, d: usize, smooth: usize) -> Self {
        Self { k, d, smooth }
    }
}

impl PlotDataProvider for StochasticProvider {
    fn build_series(&self, candles: &[Candle]) -> Vec<PlotSeries> {
        let high = high_values(candles);
        let low = low_values(candles);
        let close = close_values(candles);
        let out = indicators::stochastic(
            &high,
            &low,
            &close,
            self.k.max(1),
            self.d.max(1),
            self.smooth.max(1),
        )
        .ok();
        let (k, d) = if let Some(out) = out {
            (out.k, out.d)
        } else {
            let none = vec![None; candles.len()];
            (none.clone(), none)
        };

        vec![
            PlotSeries {
                id: format!("stoch-k:{}:{}:{}", self.k, self.d, self.smooth),
                name: format!("Stoch %K({},{},{})", self.k, self.d, self.smooth),
                pane: PaneId::Named("stoch".to_string()),
                visible: true,
                primitives: vec![PlotPrimitive::Line {
                    values: k,
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
                    values: d,
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

pub struct ObvProvider;

impl ObvProvider {
    pub fn new() -> Self {
        Self
    }
}

impl Default for ObvProvider {
    fn default() -> Self {
        Self::new()
    }
}

impl PlotDataProvider for ObvProvider {
    fn build_series(&self, candles: &[Candle]) -> Vec<PlotSeries> {
        let close = close_values(candles);
        let volume = volume_values(candles);
        let values = indicators::obv(&close, &volume).unwrap_or_else(|_| vec![None; candles.len()]);
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

pub struct VwapProvider;

impl VwapProvider {
    pub fn new() -> Self {
        Self
    }
}

impl Default for VwapProvider {
    fn default() -> Self {
        Self::new()
    }
}

impl PlotDataProvider for VwapProvider {
    fn build_series(&self, candles: &[Candle]) -> Vec<PlotSeries> {
        let high = high_values(candles);
        let low = low_values(candles);
        let close = close_values(candles);
        let volume = volume_values(candles);
        let values = indicators::vwap(&high, &low, &close, &volume)
            .unwrap_or_else(|_| vec![None; candles.len()]);
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

pub struct AdxProvider {
    pub period: usize,
}

impl AdxProvider {
    pub fn new(period: usize) -> Self {
        Self { period }
    }
}

impl PlotDataProvider for AdxProvider {
    fn build_series(&self, candles: &[Candle]) -> Vec<PlotSeries> {
        let high = high_values(candles);
        let low = low_values(candles);
        let close = close_values(candles);
        let out = indicators::adx(&high, &low, &close, self.period.max(1)).ok();
        let (adx, plus, minus) = if let Some(out) = out {
            (out.adx, out.plus_di, out.minus_di)
        } else {
            let none = vec![None; candles.len()];
            (none.clone(), none.clone(), none)
        };

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

/// Example histogram-style analytics provider.
///
/// Produces a simple close-to-close delta series around `base = 0.0`.
pub struct MomentumHistogramProvider {
    pub color_up: String,
    pub color_down: String,
    pub width_factor: f32,
}

impl MomentumHistogramProvider {
    pub fn new() -> Self {
        Self {
            color_up: "rgba(34,197,94,0.40)".to_string(),
            color_down: "rgba(239,68,68,0.40)".to_string(),
            width_factor: 0.7,
        }
    }
}

impl Default for MomentumHistogramProvider {
    fn default() -> Self {
        Self::new()
    }
}

impl PlotDataProvider for MomentumHistogramProvider {
    fn build_series(&self, candles: &[Candle]) -> Vec<PlotSeries> {
        let mut values = vec![None; candles.len()];
        for i in 1..candles.len() {
            values[i] = Some(candles[i].close - candles[i - 1].close);
        }

        vec![PlotSeries {
            id: "momentum-histogram".to_string(),
            name: "Momentum Histogram".to_string(),
            pane: PaneId::Named("momentum".to_string()),
            visible: true,
            primitives: vec![PlotPrimitive::Histogram {
                values,
                base: 0.0,
                style: HistogramStyle {
                    positive_color: self.color_up.clone(),
                    negative_color: self.color_down.clone(),
                    width_factor: self.width_factor,
                },
            }],
        }]
    }
}

pub struct RsiProvider {
    pub period: usize,
    pub line_color: String,
    pub line_width: f32,
    pub threshold_color: String,
}

impl RsiProvider {
    pub fn new(period: usize) -> Self {
        Self {
            period,
            line_color: "#a78bfa".to_string(),
            line_width: 1.4,
            threshold_color: "rgba(148,163,184,0.75)".to_string(),
        }
    }
}

impl PlotDataProvider for RsiProvider {
    fn build_series(&self, candles: &[Candle]) -> Vec<PlotSeries> {
        let close = close_values(candles);
        let period = self.period.max(1);
        let rsi = indicators::rsi(&close, period).unwrap_or_else(|_| vec![None; candles.len()]);
        vec![build_rsi_series(self, rsi, period)]
    }
}

fn build_rsi_series(
    provider: &RsiProvider,
    rsi_values: Vec<Option<f64>>,
    period: usize,
) -> PlotSeries {
    let upper = vec![Some(70.0); rsi_values.len()];
    let lower = vec![Some(30.0); rsi_values.len()];

    PlotSeries {
        id: format!("rsi:{period}"),
        name: format!("RSI({period})"),
        pane: PaneId::Named("rsi".to_string()),
        visible: true,
        primitives: vec![
            PlotPrimitive::Line {
                values: upper,
                style: LineStyle {
                    color: provider.threshold_color.clone(),
                    width: 1.0,
                    pattern: LinePattern::Dashed,
                },
            },
            PlotPrimitive::Line {
                values: lower,
                style: LineStyle {
                    color: provider.threshold_color.clone(),
                    width: 1.0,
                    pattern: LinePattern::Dashed,
                },
            },
            PlotPrimitive::Line {
                values: rsi_values,
                style: LineStyle {
                    color: provider.line_color.clone(),
                    width: provider.line_width,
                    pattern: LinePattern::Solid,
                },
            },
        ],
    }
}

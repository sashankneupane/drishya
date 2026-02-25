//! Built-in indicator adapters.
//!
//! These are optional conveniences for demos and batteries-included usage.

use crate::{
    plots::{
        model::{
            BandStyle, HistogramStyle, LinePattern, LineStyle, PaneId, PlotPrimitive, PlotSeries,
        },
        provider::PlotDataProvider,
    },
    types::Candle,
};

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
        let mut values = vec![None; candles.len()];
        let mut rolling_sum = 0.0;

        for i in 0..candles.len() {
            rolling_sum += candles[i].close;
            if i >= period {
                rolling_sum -= candles[i - period].close;
            }
            if i + 1 >= period {
                values[i] = Some(rolling_sum / period as f64);
            }
        }

        vec![PlotSeries {
            id: format!("sma:{}", period),
            name: format!("SMA({})", period),
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
        let mut upper = vec![None; candles.len()];
        let mut middle = vec![None; candles.len()];
        let mut lower = vec![None; candles.len()];

        let mut rolling_sum = 0.0f64;
        let mut rolling_sum_sq = 0.0f64;

        for i in 0..candles.len() {
            let close = candles[i].close;
            rolling_sum += close;
            rolling_sum_sq += close * close;

            if i >= period {
                let prev = candles[i - period].close;
                rolling_sum -= prev;
                rolling_sum_sq -= prev * prev;
            }

            if i + 1 >= period {
                let mean = rolling_sum / period as f64;
                let variance = (rolling_sum_sq / period as f64) - mean * mean;
                let std_dev = variance.max(0.0).sqrt();

                middle[i] = Some(mean);
                upper[i] = Some(mean + self.std_mult * std_dev);
                lower[i] = Some(mean - self.std_mult * std_dev);
            }
        }

        vec![PlotSeries {
            id: format!("bbands:{}:{}", period, self.std_mult),
            name: format!("BBands({},{})", period, self.std_mult),
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
        let period = self.period.max(1);
        let mut rsi = vec![None; candles.len()];
        if candles.len() <= period {
            return vec![build_rsi_series(self, rsi, period)];
        }

        let mut gains = 0.0f64;
        let mut losses = 0.0f64;

        for i in 1..=period {
            let delta = candles[i].close - candles[i - 1].close;
            if delta >= 0.0 {
                gains += delta;
            } else {
                losses += -delta;
            }
        }

        let mut avg_gain = gains / period as f64;
        let mut avg_loss = losses / period as f64;
        rsi[period] = Some(compute_rsi(avg_gain, avg_loss));

        for i in (period + 1)..candles.len() {
            let delta = candles[i].close - candles[i - 1].close;
            let gain = if delta > 0.0 { delta } else { 0.0 };
            let loss = if delta < 0.0 { -delta } else { 0.0 };

            avg_gain = (avg_gain * (period as f64 - 1.0) + gain) / period as f64;
            avg_loss = (avg_loss * (period as f64 - 1.0) + loss) / period as f64;

            rsi[i] = Some(compute_rsi(avg_gain, avg_loss));
        }

        vec![build_rsi_series(self, rsi, period)]
    }
}

fn compute_rsi(avg_gain: f64, avg_loss: f64) -> f64 {
    if avg_loss <= 1e-12 {
        return 100.0;
    }

    let rs = avg_gain / avg_loss;
    100.0 - (100.0 / (1.0 + rs))
}

fn build_rsi_series(
    provider: &RsiProvider,
    rsi_values: Vec<Option<f64>>,
    period: usize,
) -> PlotSeries {
    let upper = vec![Some(70.0); rsi_values.len()];
    let lower = vec![Some(30.0); rsi_values.len()];

    PlotSeries {
        id: format!("rsi:{}", period),
        name: format!("RSI({})", period),
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

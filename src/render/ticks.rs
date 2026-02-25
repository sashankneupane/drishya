//! Pluggable axis tick providers and label formatters.
//!
//! This module separates tick generation from axis drawing so providers can be
//! swapped or extended without changing render command assembly.

use crate::{scale::TimeScale, types::Candle};

#[derive(Debug, Clone)]
pub struct YTick {
    pub y: f32,
    pub value: f64,
    pub label: String,
}

#[derive(Debug, Clone)]
pub struct XTick {
    pub x: f32,
    pub index: usize,
    pub timestamp: i64,
    pub label: String,
}

pub trait ValueLabelFormatter {
    fn format_value(&self, value: f64) -> String;
}

pub trait TimeLabelFormatter {
    fn format_time(&self, timestamp: i64) -> String;
}

#[derive(Debug, Clone, Copy)]
pub struct PriceFormatter {
    pub decimals: usize,
}

impl ValueLabelFormatter for PriceFormatter {
    fn format_value(&self, value: f64) -> String {
        format!("{value:.prec$}", prec = self.decimals)
    }
}

#[derive(Debug, Clone, Copy)]
pub struct PercentFormatter {
    pub decimals: usize,
}

impl ValueLabelFormatter for PercentFormatter {
    fn format_value(&self, value: f64) -> String {
        format!("{value:.prec$}%", prec = self.decimals)
    }
}

#[derive(Debug, Clone, Copy)]
pub struct RawTimestampFormatter;

impl TimeLabelFormatter for RawTimestampFormatter {
    fn format_time(&self, timestamp: i64) -> String {
        timestamp.to_string()
    }
}

#[derive(Debug, Clone, Copy)]
pub struct HumanTimeFormatter;

impl TimeLabelFormatter for HumanTimeFormatter {
    fn format_time(&self, timestamp: i64) -> String {
        let (_year, month, day, hour, minute) = unix_to_utc_components(timestamp);
        let month_name = short_month_name(month);

        if hour == 0 && minute == 0 {
            format!("{month_name} {day:02}")
        } else {
            format!("{month_name} {day:02} {hour:02}:{minute:02}")
        }
    }
}

pub struct AxisFormatters<'a> {
    pub y: &'a dyn ValueLabelFormatter,
    pub x: &'a dyn TimeLabelFormatter,
}

static DEFAULT_PRICE_FORMATTER: PriceFormatter = PriceFormatter { decimals: 2 };
static DEFAULT_TIME_FORMATTER: HumanTimeFormatter = HumanTimeFormatter;

pub fn default_axis_formatters() -> AxisFormatters<'static> {
    AxisFormatters {
        y: &DEFAULT_PRICE_FORMATTER,
        x: &DEFAULT_TIME_FORMATTER,
    }
}

#[derive(Debug, Clone, Copy)]
pub struct NumericYTickProvider {
    pub min_label_spacing_px: f32,
    pub target_tick_spacing_px: f32,
    pub max_ticks: usize,
}

impl Default for NumericYTickProvider {
    fn default() -> Self {
        Self {
            min_label_spacing_px: 22.0,
            target_tick_spacing_px: 64.0,
            max_ticks: 12,
        }
    }
}

impl NumericYTickProvider {
    pub fn generate(
        &self,
        min: f64,
        max: f64,
        pane_top: f32,
        pane_height: f32,
        formatter: &dyn ValueLabelFormatter,
    ) -> Vec<YTick> {
        if pane_height <= 1.0 || !min.is_finite() || !max.is_finite() {
            return Vec::new();
        }

        let range = (max - min).abs().max(1e-9);
        let spacing_limited_max_ticks = ((pane_height / self.min_label_spacing_px).floor() as usize)
            .saturating_add(1)
            .max(2);
        let target_ticks = ((pane_height / self.target_tick_spacing_px).round() as usize)
            .saturating_add(1)
            .clamp(2, self.max_ticks.max(2).min(spacing_limited_max_ticks));

        let raw_step = range / (target_ticks.saturating_sub(1).max(1) as f64);
        let step = nice_step(raw_step).max(1e-9);

        let mut ticks = Vec::new();
        let mut value = (min / step).floor() * step;
        let upper = max + step * 0.5;
        let mut last_y = f32::NEG_INFINITY;

        while value <= upper {
            let t = ((value - min) / range).clamp(0.0, 1.0);
            let y = pane_top + pane_height * (1.0 - t as f32);

            if (y - last_y).abs() >= self.min_label_spacing_px - 0.5 {
                ticks.push(YTick {
                    y,
                    value,
                    label: formatter.format_value(value),
                });
                last_y = y;
            }

            value += step;
            if ticks.len() > self.max_ticks.saturating_mul(2) {
                break;
            }
        }

        ticks
    }
}

#[derive(Debug, Clone, Copy)]
pub struct DensityXTickProvider {
    pub min_label_spacing_px: f32,
}

impl Default for DensityXTickProvider {
    fn default() -> Self {
        Self {
            min_label_spacing_px: 82.0,
        }
    }
}

impl DensityXTickProvider {
    pub fn generate(
        &self,
        candles: &[Candle],
        visible_start: usize,
        ts: TimeScale,
        formatter: &dyn TimeLabelFormatter,
    ) -> Vec<XTick> {
        if candles.is_empty() || ts.pane.w <= 1.0 {
            return Vec::new();
        }

        let n = candles.len();
        let max_labels = ((ts.pane.w / self.min_label_spacing_px).floor() as usize)
            .max(2)
            .min(n);

        let step = if n <= max_labels {
            1
        } else {
            ((n - 1) as f32 / (max_labels - 1) as f32).ceil() as usize
        }
        .max(1);

        let mut ticks = Vec::new();
        let mut idx = 0usize;
        let mut last_x = f32::NEG_INFINITY;

        while idx < n {
            let global_idx = visible_start + idx;
            let x = ts.x_for_global_index(global_idx);
            if (x - last_x).abs() >= self.min_label_spacing_px - 0.5 {
                let timestamp = candles[idx].ts;
                ticks.push(XTick {
                    x,
                    index: global_idx,
                    timestamp,
                    label: formatter.format_time(timestamp),
                });
                last_x = x;
            }
            idx = idx.saturating_add(step);
        }

        let last_global = visible_start + (n - 1);
        if ticks.last().map(|t| t.index) != Some(last_global) {
            let x = ts.x_for_global_index(last_global);
            let timestamp = candles[n - 1].ts;
            if (x - last_x).abs() >= self.min_label_spacing_px * 0.45 {
                ticks.push(XTick {
                    x,
                    index: last_global,
                    timestamp,
                    label: formatter.format_time(timestamp),
                });
            }
        }

        ticks
    }
}

fn nice_step(raw_step: f64) -> f64 {
    if !raw_step.is_finite() || raw_step <= 0.0 {
        return 1.0;
    }

    let exponent = raw_step.log10().floor();
    let scale = 10f64.powf(exponent);
    let fraction = raw_step / scale;

    let nice_fraction = if fraction <= 1.0 {
        1.0
    } else if fraction <= 2.0 {
        2.0
    } else if fraction <= 5.0 {
        5.0
    } else {
        10.0
    };

    nice_fraction * scale
}

fn unix_to_utc_components(timestamp: i64) -> (i32, u32, u32, u32, u32) {
    const SECS_PER_DAY: i64 = 86_400;

    let days_since_epoch = timestamp.div_euclid(SECS_PER_DAY);
    let secs_of_day = timestamp.rem_euclid(SECS_PER_DAY);

    let hour = (secs_of_day / 3_600) as u32;
    let minute = ((secs_of_day % 3_600) / 60) as u32;

    let (year, month, day) = civil_from_days(days_since_epoch);
    (year, month, day, hour, minute)
}

fn civil_from_days(days_since_epoch: i64) -> (i32, u32, u32) {
    let z = days_since_epoch + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let mut year = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = mp + if mp < 10 { 3 } else { -9 };
    if month <= 2 {
        year += 1;
    }

    (year as i32, month as u32, day as u32)
}

fn short_month_name(month: u32) -> &'static str {
    match month {
        1 => "Jan",
        2 => "Feb",
        3 => "Mar",
        4 => "Apr",
        5 => "May",
        6 => "Jun",
        7 => "Jul",
        8 => "Aug",
        9 => "Sep",
        10 => "Oct",
        11 => "Nov",
        12 => "Dec",
        _ => "?",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::Rect;

    fn sample_candles(n: usize) -> Vec<Candle> {
        (0..n)
            .map(|i| Candle {
                ts: 1_700_000_000 + i as i64 * 60,
                open: 100.0,
                high: 101.0,
                low: 99.0,
                close: 100.5,
                volume: 1000.0,
            })
            .collect()
    }

    #[test]
    fn y_tick_density_adapts_to_pane_height() {
        let provider = NumericYTickProvider::default();
        let formatter = PriceFormatter { decimals: 2 };

        let short = provider.generate(10.0, 110.0, 0.0, 120.0, &formatter);
        let tall = provider.generate(10.0, 110.0, 0.0, 480.0, &formatter);

        assert!(tall.len() >= short.len());
        assert!(short.len() >= 2);
    }

    #[test]
    fn y_ticks_respect_min_label_spacing() {
        let provider = NumericYTickProvider {
            min_label_spacing_px: 24.0,
            ..NumericYTickProvider::default()
        };
        let formatter = PriceFormatter { decimals: 2 };

        let ticks = provider.generate(0.0, 100.0, 0.0, 360.0, &formatter);
        for pair in ticks.windows(2) {
            let dy = (pair[1].y - pair[0].y).abs();
            assert!(dy >= 23.0);
        }
    }

    #[test]
    fn x_tick_density_adapts_to_visible_count() {
        let provider = DensityXTickProvider::default();
        let formatter = RawTimestampFormatter;

        let few = sample_candles(40);
        let many = sample_candles(300);

        let ts_few = TimeScale {
            pane: Rect {
                x: 0.0,
                y: 0.0,
                w: 900.0,
                h: 300.0,
            },
            world_start_x: 0.0,
            world_end_x: few.len() as f64,
        };
        let ts_many = TimeScale {
            pane: Rect {
                x: 0.0,
                y: 0.0,
                w: 900.0,
                h: 300.0,
            },
            world_start_x: 0.0,
            world_end_x: many.len() as f64,
        };

        let ticks_few = provider.generate(&few, 0, ts_few, &formatter);
        let ticks_many = provider.generate(&many, 0, ts_many, &formatter);

        let avg_stride = |ticks: &[XTick]| -> f32 {
            if ticks.len() < 2 {
                return 0.0;
            }

            let sum: usize = ticks
                .windows(2)
                .map(|pair| pair[1].index.saturating_sub(pair[0].index))
                .sum();
            sum as f32 / (ticks.len() - 1) as f32
        };

        let stride_few = avg_stride(&ticks_few);
        let stride_many = avg_stride(&ticks_many);

        assert!(stride_many >= stride_few);
        assert!(ticks_many.len() >= 2);
    }

    #[test]
    fn x_ticks_respect_spacing_under_normal_width() {
        let provider = DensityXTickProvider {
            min_label_spacing_px: 80.0,
        };
        let formatter = RawTimestampFormatter;
        let candles = sample_candles(240);
        let ts = TimeScale {
            pane: Rect {
                x: 0.0,
                y: 0.0,
                w: 1200.0,
                h: 320.0,
            },
            world_start_x: 0.0,
            world_end_x: candles.len() as f64,
        };

        let ticks = provider.generate(&candles, 0, ts, &formatter);
        for pair in ticks.windows(2) {
            let dx = (pair[1].x - pair[0].x).abs();
            assert!(dx >= 79.0);
        }
    }

    #[test]
    fn human_time_formatter_outputs_readable_labels() {
        let f = HumanTimeFormatter;

        assert_eq!(f.format_time(0), "Jan 01");
        assert_eq!(f.format_time(1_700_000_000), "Nov 14 22:13");
        assert_eq!(f.format_time(1_700_006_400), "Nov 15");
    }
}

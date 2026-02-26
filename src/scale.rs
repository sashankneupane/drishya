//! Coordinate transforms used by render builders.
//!
//! Scale objects map domain values (index/price/volume) into pane pixels.

use crate::types::Rect;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
pub enum PriceAxisMode {
    #[default]
    Linear,
    Log,
    Percent,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
pub enum PercentBaselinePolicy {
    #[default]
    FirstVisibleBar,
    // Custom(f64) could be added later
}

pub fn apply_axis_zoom_pan(
    min: f64,
    max: f64,
    zoom_factor: f32,
    pan_factor: f32,
    mode: PriceAxisMode,
    baseline: Option<f64>,
) -> (f64, f64) {
    let zoom = zoom_factor.max(1e-6) as f64;
    let pan = pan_factor as f64;

    let linear_zoom_pan = |a: f64, b: f64| {
        let center = (a + b) * 0.5;
        let half = ((b - a) * 0.5).max(1e-9);
        let zoomed_half = half / zoom;
        let pan_delta = zoomed_half * pan;
        (
            center - zoomed_half - pan_delta,
            center + zoomed_half - pan_delta,
        )
    };

    match mode {
        PriceAxisMode::Linear => linear_zoom_pan(min, max),
        PriceAxisMode::Log => {
            let epsilon = 1e-9;
            let log_min = min.max(epsilon).ln();
            let log_max = max.max(epsilon + 1e-9).ln();
            let (zmin, zmax) = linear_zoom_pan(log_min, log_max);
            (zmin.exp(), zmax.exp())
        }
        PriceAxisMode::Percent => {
            let base = baseline.unwrap_or(1.0).max(1e-9);
            let p_min = (min - base) / base * 100.0;
            let p_max = (max - base) / base * 100.0;
            let (zmin, zmax) = linear_zoom_pan(p_min, p_max);
            let out_min = base + (zmin / 100.0) * base;
            let out_max = base + (zmax / 100.0) * base;
            if out_min.is_finite() && out_max.is_finite() {
                (out_min, out_max)
            } else {
                linear_zoom_pan(min, max)
            }
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub struct TimeScale {
    pub pane: Rect,
    pub world_start_x: f64,
    pub world_end_x: f64,
}

impl TimeScale {
    pub fn x_for_index(&self, i: usize) -> f32 {
        self.x_for_global_index(i)
    }

    pub fn x_for_global_index(&self, i: usize) -> f32 {
        if self.world_span() <= 1e-9 {
            return self.pane.x;
        }
        // Candle centers are offset by half a bar in world space.
        let world_x = i as f64 + 0.5;
        self.x_for_world_x(world_x)
    }

    pub fn x_for_world_x(&self, world_x: f64) -> f32 {
        if self.world_span() <= 1e-9 {
            return self.pane.x;
        }

        let u = (world_x - self.world_start_x) / self.world_span();
        self.pane.x + (u as f32) * self.pane.w
    }

    pub fn step(&self) -> f32 {
        let span = self.world_span();
        if span <= 1e-9 {
            1.0
        } else {
            self.pane.w / span as f32
        }
    }

    pub fn candle_width(&self) -> f32 {
        (self.step() * 0.7).max(1.0)
    }

    pub fn world_span(&self) -> f64 {
        (self.world_end_x - self.world_start_x).max(1e-9)
    }
}

#[derive(Debug, Clone, Copy)]
pub struct PriceScale {
    pub pane: Rect,
    pub min: f64,
    pub max: f64,
    pub mode: crate::scale::PriceAxisMode,
    pub baseline: Option<f64>,
}

impl PriceScale {
    pub fn y_for_price(&self, price: f64) -> f32 {
        use crate::scale::PriceAxisMode;

        let (val, min_v, max_v) = match self.mode {
            PriceAxisMode::Linear => (price, self.min, self.max),
            PriceAxisMode::Percent => {
                let base = self.baseline.unwrap_or(1.0).max(1e-9);
                (
                    (price - base) / base * 100.0,
                    (self.min - base) / base * 100.0,
                    (self.max - base) / base * 100.0,
                )
            }
            PriceAxisMode::Log => {
                let epsilon = 1e-9;
                (
                    price.max(epsilon).ln(),
                    self.min.max(epsilon).ln(),
                    self.max.max(epsilon + 1e-9).ln(),
                )
            }
        };

        let range = (max_v - min_v).max(1e-9);
        let t = ((val - min_v) / range) as f32;
        self.pane.y + self.pane.h * (1.0 - t)
    }

    pub fn price_for_y(&self, y: f32) -> f64 {
        use crate::scale::PriceAxisMode;

        let t = 1.0 - ((y - self.pane.y) / self.pane.h).clamp(0.0, 1.0);

        match self.mode {
            PriceAxisMode::Linear => self.min + (self.max - self.min) * t as f64,
            PriceAxisMode::Percent => {
                let base = self.baseline.unwrap_or(1.0).max(1e-9);
                let p_min = (self.min - base) / base * 100.0;
                let p_max = (self.max - base) / base * 100.0;
                let p_val = p_min + (p_max - p_min) * t as f64;
                base + (p_val / 100.0) * base
            }
            PriceAxisMode::Log => {
                let epsilon = 1e-9;
                let log_min = self.min.max(epsilon).ln();
                let log_max = self.max.max(epsilon + 1e-9).ln();
                (log_min + (log_max - log_min) * t as f64).exp()
            }
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub struct VolumeScale {
    pub pane: Rect,
    pub max: f64,
}

impl VolumeScale {
    pub fn y_for_volume(&self, vol: f64) -> f32 {
        let maxv = self.max.max(1e-9);
        let t = (vol / maxv) as f32;
        self.pane.y + self.pane.h * (1.0 - t)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::Rect;

    #[test]
    fn price_scale_linear_mapping() {
        let ps = PriceScale {
            pane: Rect {
                x: 0.0,
                y: 100.0,
                w: 100.0,
                h: 200.0,
            },
            min: 10.0,
            max: 30.0,
            mode: PriceAxisMode::Linear,
            baseline: None,
        };

        // Middle of range
        assert_eq!(ps.y_for_price(20.0), 200.0);
        assert_eq!(ps.price_for_y(200.0), 20.0);

        // Bottom of range (highest y)
        assert_eq!(ps.y_for_price(10.0), 300.0);
        assert_eq!(ps.price_for_y(300.0), 10.0);

        // Top of range (lowest y)
        assert_eq!(ps.y_for_price(30.0), 100.0);
        assert_eq!(ps.price_for_y(100.0), 30.0);
    }

    #[test]
    fn price_scale_log_mapping() {
        let ps = PriceScale {
            pane: Rect {
                x: 0.0,
                y: 0.0,
                w: 100.0,
                h: 100.0,
            },
            min: 10.0,
            max: 100.0,
            mode: PriceAxisMode::Log,
            baseline: None,
        };

        let mid_price = (10.0f64 * 100.0f64).sqrt(); // Geometrical mean
        assert!((ps.y_for_price(mid_price) - 50.0).abs() < 1e-5);
        assert!((ps.price_for_y(50.0) - mid_price).abs() < 1e-5);

        assert!((ps.y_for_price(10.0) - 100.0).abs() < 1e-5);
        assert!((ps.y_for_price(100.0) - 0.0).abs() < 1e-5);
    }

    #[test]
    fn price_scale_log_handles_non_positive() {
        let ps = PriceScale {
            pane: Rect {
                x: 0.0,
                y: 0.0,
                w: 100.0,
                h: 100.0,
            },
            min: 10.0,
            max: 100.0,
            mode: PriceAxisMode::Log,
            baseline: None,
        };

        let y_neg = ps.y_for_price(-10.0);
        let y_zero = ps.y_for_price(0.0);
        assert!(y_neg >= 100.0);
        assert!(y_zero >= 100.0);
    }

    #[test]
    fn price_scale_roundtrip() {
        let ps = PriceScale {
            pane: Rect {
                x: 50.0,
                y: 50.0,
                w: 500.0,
                h: 500.0,
            },
            min: 123.45,
            max: 678.90,
            mode: PriceAxisMode::Log,
            baseline: None,
        };

        let prices = [150.0, 300.0, 450.0, 600.0];
        for &p in &prices {
            let y = ps.y_for_price(p);
            let roundtrip = ps.price_for_y(y);
            assert!(
                (p - roundtrip).abs() < 1e-4,
                "Failed roundtrip for price {p}"
            );
        }
    }

    #[test]
    fn price_scale_percent_mapping() {
        let ps = PriceScale {
            pane: Rect {
                x: 0.0,
                y: 0.0,
                w: 100.0,
                h: 100.0,
            },
            min: 50.0,  // -50% relative to 100
            max: 150.0, // +50% relative to 100
            mode: PriceAxisMode::Percent,
            baseline: Some(100.0),
        };

        // Price 100 (0%) should be at middle y=50
        assert!((ps.y_for_price(100.0) - 50.0).abs() < 1e-5);
        assert!((ps.price_for_y(50.0) - 100.0).abs() < 1e-5);

        // Price 150 (+50%) should be at top y=0
        assert!((ps.y_for_price(150.0) - 0.0).abs() < 1e-5);
        // Price 50 (-50%) should be at bottom y=100
        assert!((ps.y_for_price(50.0) - 100.0).abs() < 1e-5);
    }
}

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
}

impl PriceScale {
    pub fn y_for_price(&self, price: f64) -> f32 {
        use crate::scale::PriceAxisMode;

        let (val, min_v, max_v) = match self.mode {
            PriceAxisMode::Linear | PriceAxisMode::Percent => (price, self.min, self.max),
            PriceAxisMode::Log => {
                // Log mode requires strictly positive values.
                // We clamp to a tiny positive epsilon if data is non-positive.
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
            PriceAxisMode::Linear | PriceAxisMode::Percent => {
                self.min + (self.max - self.min) * t as f64
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

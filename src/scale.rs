//! Coordinate transforms used by render builders.
//!
//! Scale objects map domain values (index/price/volume) into pane pixels.

use crate::types::Rect;

#[derive(Debug, Clone, Copy)]
pub struct TimeScale {
    pub pane: Rect,
    pub count: usize,
}

impl TimeScale {
    pub fn x_for_index(&self, i: usize) -> f32 {
        if self.count == 0 {
            return self.pane.x;
        }
        // Candle centers are offset by half a step to keep bars symmetric.
        let step = self.pane.w / self.count as f32;
        self.pane.x + (i as f32 + 0.5) * step
    }

    pub fn step(&self) -> f32 {
        if self.count == 0 { 1.0 } else { self.pane.w / self.count as f32 }
    }

    pub fn candle_width(&self) -> f32 {
        (self.step() * 0.7).max(1.0)
    }
}

#[derive(Debug, Clone, Copy)]
pub struct PriceScale {
    pub pane: Rect,
    pub min: f64,
    pub max: f64,
}

impl PriceScale {
    pub fn y_for_price(&self, price: f64) -> f32 {
        // Clamp tiny ranges to avoid division blow-ups on flat data windows.
        let range = (self.max - self.min).max(1e-9);
        let t = ((price - self.min) / range) as f32;
        self.pane.y + self.pane.h * (1.0 - t)
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

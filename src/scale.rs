//! Coordinate transforms used by render builders.
//!
//! Scale objects map domain values (index/price/volume) into pane pixels.

use crate::types::Rect;

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

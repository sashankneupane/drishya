//! Chart state and data-window helpers.
//!
//! This file contains logic that mutates or reads persistent chart state,
//! but does not decide rendering style or interaction intent.

use crate::{
    types::{Candle, Size},
    viewport::Viewport,
};

use super::Chart;

impl Chart {
    pub fn set_size(&mut self, width: f32, height: f32) {
        // Layout changes can invalidate viewport assumptions, so clamp after
        // resize even if the candle data itself is unchanged.
        self.size = Size { width, height };
        self.clamp_viewport();
    }

    pub fn set_data(&mut self, candles: Vec<Candle>) {
        self.candles = candles;

        if !self.candles.is_empty() {
            let total = self.candles.len();
            let mut vp = Viewport::new(total);
            vp.clamp(total);

            self.viewport = Some(vp);
        } else {
            // Explicitly clear viewport when data is removed to avoid stale
            // ranges being reused when new data arrives later.
            self.viewport = None;
        }
    }

    pub fn visible_data(&self) -> &[Candle] {
        if self.candles.is_empty() {
            return &self.candles;
        }

        match self.viewport {
            Some(vp) => {
                let (start, end) = vp.visible_range(self.candles.len());
                &self.candles[start..end]
            }
            None => &self.candles,
        }
    }

    fn clamp_viewport(&mut self) {
        if let Some(vp) = &mut self.viewport {
            vp.clamp(self.candles.len());
        }
    }
}

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

    /// Upserts one candle into the existing series.
    ///
    /// Streaming feeds can send repeated updates for the current time bucket,
    /// then advance to a new timestamp once a bar closes.
    pub fn upsert_candle(&mut self, candle: Candle) {
        self.upsert_candles(std::iter::once(candle));
    }

    /// Upserts many candles while preserving viewport intent.
    ///
    /// Behavior:
    /// - same timestamp as last bar => replace last bar
    /// - newer timestamp => append
    /// - older timestamp that exists => replace matching bar
    /// - older timestamp missing => ignored
    pub fn upsert_candles<I>(&mut self, candles: I)
    where
        I: IntoIterator<Item = Candle>,
    {
        let prev_total = self.candles.len();
        let was_following_latest = self.is_following_latest();

        for candle in candles {
            match self.candles.last_mut() {
                None => self.candles.push(candle),
                Some(last) if candle.ts == last.ts => *last = candle,
                Some(last) if candle.ts > last.ts => self.candles.push(candle),
                Some(_) => {
                    if let Some(existing) = self.candles.iter_mut().rev().find(|c| c.ts == candle.ts) {
                        *existing = candle;
                    }
                }
            }
        }

        if self.candles.is_empty() {
            self.viewport = None;
            return;
        }

        if self.viewport.is_none() {
            let mut vp = Viewport::new(self.candles.len());
            vp.clamp(self.candles.len());
            self.viewport = Some(vp);
            return;
        }

        let new_total = self.candles.len();
        if new_total > prev_total && was_following_latest {
            if let Some(vp) = &mut self.viewport {
                vp.pan_world((new_total - prev_total) as f64, new_total);
            }
        } else {
            self.clamp_viewport();
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

    fn is_following_latest(&self) -> bool {
        if self.candles.is_empty() {
            return true;
        }

        match self.viewport {
            None => true,
            Some(vp) => {
                let end = vp.world_end_x();
                let latest = self.candles.len() as f64;
                end >= (latest - 0.5)
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn candle(ts: i64, close: f64) -> Candle {
        Candle {
            ts,
            open: close,
            high: close + 1.0,
            low: close - 1.0,
            close,
            volume: 1000.0,
        }
    }

    #[test]
    fn upsert_replaces_last_when_timestamp_matches() {
        let mut chart = Chart::new(1200.0, 700.0);
        chart.set_data(vec![candle(1, 10.0), candle(2, 11.0)]);

        chart.upsert_candle(candle(2, 42.0));

        assert_eq!(chart.candles.len(), 2);
        assert!((chart.candles[1].close - 42.0).abs() < f64::EPSILON);
    }

    #[test]
    fn upsert_appends_newer_timestamp() {
        let mut chart = Chart::new(1200.0, 700.0);
        chart.set_data(vec![candle(1, 10.0), candle(2, 11.0)]);

        chart.upsert_candle(candle(3, 12.0));

        assert_eq!(chart.candles.len(), 3);
        assert_eq!(chart.candles[2].ts, 3);
    }

    #[test]
    fn upsert_updates_older_existing_timestamp() {
        let mut chart = Chart::new(1200.0, 700.0);
        chart.set_data(vec![candle(1, 10.0), candle(2, 11.0), candle(3, 12.0)]);

        chart.upsert_candle(candle(2, 99.0));

        assert_eq!(chart.candles.len(), 3);
        assert!((chart.candles[1].close - 99.0).abs() < f64::EPSILON);
    }
}

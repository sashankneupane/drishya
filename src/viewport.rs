//! Viewport state for horizontal navigation.
//!
//! `offset` and `bars_visible` are intentionally fractional so pan/zoom can be
//! smooth even when users move by sub-candle pixel distances.

#[derive(Debug, Clone, Copy)]
pub struct Viewport {
    /// Fractional index of the leftmost visible candle.
    pub offset: f32,
    /// Number of bars visible in the viewport.
    pub bars_visible: f32,
}

impl Viewport {
    pub fn new(total_bars: usize) -> Self {
        let bars = total_bars.max(1) as f32;
        Self {
            offset: 0.0,
            bars_visible: bars.min(120.0),
        }
    }

    pub fn visible_range(&self, total_bars: usize) -> (usize, usize) {
        let total = total_bars as f32;
        if total_bars == 0 {
            return (0, 0);
        }

        // `floor`/`ceil` ensures partially visible candles stay included.
        let start = self.offset.floor().max(0.0).min(total - 1.0) as usize;
        let end_f = (self.offset + self.bars_visible).ceil().max(1.0).min(total);
        let end = end_f as usize;

        (start.min(total_bars), end.min(total_bars))
    }

    pub fn clamp(&mut self, total_bars: usize) {
        if total_bars == 0 {
            self.offset = 0.0;
            self.bars_visible = 1.0;
            return;
        }

        let total = total_bars as f32;

        // Soft bounds preserve an "infinite" interaction feel while keeping
        // rendering and index math safely constrained.
        let min_bars = 5.0;
        let max_bars = (total * 3.0).max(20.0);

        self.bars_visible = self.bars_visible.clamp(min_bars, max_bars);

        let max_offset = (total - 1.0).max(0.0);
        let min_offset = -self.bars_visible * 0.5;
        let max_offset_soft = max_offset + self.bars_visible * 0.5;

        self.offset = self.offset.clamp(min_offset, max_offset_soft);
    }
}

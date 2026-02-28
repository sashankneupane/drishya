//! Viewport state for horizontal navigation.
//!
//! World-space x coordinates are currently **index based**:
//! - bar `i` occupies world interval `[i, i + 1)`
//! - bar center is rendered at `i` (mapped as `i + 0.5` in viewport projection)
//! - viewport stores a half-open x-range `[start_x, end_x)`
//!
//! This explicit contract keeps pan/zoom math deterministic and allows a future
//! adapter to map timestamp domains into the same world-space interface.

#[derive(Debug, Clone, Copy)]
pub struct Viewport {
    start_x: f64,
    end_x: f64,
}

impl Viewport {
    pub const DEFAULT_VISIBLE_BARS: f64 = 120.0;
    pub const MIN_VISIBLE_BARS: f64 = 5.0;

    pub fn new(total_bars: usize) -> Self {
        let domain = total_bars.max(1) as f64;
        let span = domain.min(Self::DEFAULT_VISIBLE_BARS);
        let end_x = domain;
        let start_x = (end_x - span).max(0.0);
        Self { start_x, end_x }
    }

    pub fn world_start_x(&self) -> f64 {
        self.start_x
    }

    pub fn world_end_x(&self) -> f64 {
        self.end_x
    }

    pub fn world_span(&self) -> f64 {
        (self.end_x - self.start_x).max(1e-6)
    }

    pub fn world_x_to_pixel_x(&self, world_x: f32, pane_x: f32, pane_w: f32) -> f32 {
        if pane_w <= 0.0 {
            return pane_x;
        }

        // Keep integer drawing/crosshair indices centered on candles.
        let u = self.unit_from_world_x(world_x as f64 + 0.5);
        pane_x + (u as f32) * pane_w
    }

    pub fn pixel_x_to_world_x(&self, pixel_x: f32, pane_x: f32, pane_w: f32) -> f32 {
        if pane_w <= 0.0 {
            return self.start_x as f32;
        }

        let u = (pixel_x - pane_x) as f64 / pane_w as f64;
        // Inverse of center projection: pixel maps back to index-space anchor.
        (self.world_x_from_unit(u) - 0.5) as f32
    }

    pub fn pan_pixels(&mut self, dx_pixels: f32, pane_w: f32, total_bars: usize) {
        if pane_w <= 0.0 {
            return;
        }

        let delta_world = -(dx_pixels as f64) * self.world_span() / pane_w as f64;
        self.pan_world(delta_world, total_bars);
    }

    pub fn pan_world(&mut self, delta_world_x: f64, total_bars: usize) {
        self.start_x += delta_world_x;
        self.end_x += delta_world_x;
        self.clamp(total_bars);
    }

    pub fn zoom_at_pixel_x(
        &mut self,
        pixel_x: f32,
        pane_x: f32,
        pane_w: f32,
        zoom_factor: f32,
        total_bars: usize,
    ) {
        if pane_w <= 0.0 {
            return;
        }

        let u = (((pixel_x - pane_x) / pane_w).clamp(0.0, 1.0)) as f64;
        self.zoom_at_unit(u, zoom_factor, total_bars);
    }

    pub fn zoom_at_unit(&mut self, u: f64, zoom_factor: f32, total_bars: usize) {
        if zoom_factor <= 0.0 {
            return;
        }

        let u = u.clamp(0.0, 1.0);
        let anchor_world = self.world_x_from_unit(u);
        let (min_span, max_span) = Self::span_bounds(total_bars);
        let target_span = (self.world_span() * zoom_factor as f64).clamp(min_span, max_span);

        let unclamped_start = anchor_world - u * target_span;
        let (start_x, end_x) = Self::clamp_range(unclamped_start, target_span, total_bars);
        self.start_x = start_x;
        self.end_x = end_x;
    }

    pub fn visible_range(&self, total_bars: usize) -> (usize, usize) {
        if total_bars == 0 {
            return (0, 0);
        }

        let domain = total_bars as f64;
        let start = self.start_x.floor().clamp(0.0, domain) as usize;
        let mut end = self.end_x.ceil().clamp(0.0, domain) as usize;
        if end < start {
            end = start;
        }
        (start, end)
    }

    pub fn clamp(&mut self, total_bars: usize) {
        if total_bars == 0 {
            self.start_x = 0.0;
            self.end_x = 1.0;
            return;
        }

        let (min_span, max_span) = Self::span_bounds(total_bars);
        let span = self.world_span().clamp(min_span, max_span);
        let (start_x, end_x) = Self::clamp_range(self.start_x, span, total_bars);
        self.start_x = start_x;
        self.end_x = end_x;
    }

    fn unit_from_world_x(&self, world_x: f64) -> f64 {
        (world_x - self.start_x) / self.world_span()
    }

    fn world_x_from_unit(&self, u: f64) -> f64 {
        self.start_x + u * self.world_span()
    }

    fn span_bounds(total_bars: usize) -> (f64, f64) {
        let domain = total_bars.max(1) as f64;
        let min_span = Self::MIN_VISIBLE_BARS.min(domain);
        let max_span = domain;
        (min_span, max_span)
    }

    fn clamp_range(start_x: f64, span: f64, total_bars: usize) -> (f64, f64) {
        let domain_end = total_bars.max(1) as f64;
        let overscroll = span * 2.0;
        let min_start = -overscroll;
        let max_start = domain_end + overscroll - span;
        let clamped_start = start_x.clamp(min_start, max_start.max(min_start));
        (clamped_start, clamped_start + span)
    }
}

#[cfg(test)]
mod tests {
    use super::Viewport;
    use proptest::prelude::*;

    proptest! {
        #[test]
        fn pan_zoom_preserves_range_invariants(
            total in 1usize..100_000,
            pane_w in 80.0f32..3000.0f32,
            ops in prop::collection::vec(((-400.0f32..400.0f32), (0.5f32..1.8f32), (0.0f32..1.0f32)), 1..80)
        ) {
            let mut vp = Viewport::new(total);

            for (pan_px, zoom_factor, cursor_u) in ops {
                vp.pan_pixels(pan_px, pane_w, total);
                vp.zoom_at_unit(cursor_u as f64, zoom_factor, total);

                prop_assert!(vp.world_start_x().is_finite());
                prop_assert!(vp.world_end_x().is_finite());
                prop_assert!(vp.world_start_x() < vp.world_end_x());

                let span = vp.world_span();
                let min_span = Viewport::MIN_VISIBLE_BARS.min(total as f64);
                let max_span = total as f64;
                prop_assert!(span >= min_span - 1e-4);
                prop_assert!(span <= max_span + 1e-4);

                // Soft overscroll bounds: up to 2x span beyond each side.
                prop_assert!(vp.world_start_x() >= -2.0 * span - 1e-4);
                prop_assert!(vp.world_end_x() <= total as f64 + 2.0 * span + 1e-4);

                let (start, end) = vp.visible_range(total);
                prop_assert!(start <= end);
                prop_assert!(end <= total);
            }
        }

        #[test]
        fn repeated_zoom_at_cursor_has_no_jitter(
            pane_x in 0.0f32..300.0f32,
            pane_w in 200.0f32..4000.0f32,
            cursor_u in 0.1f32..0.9f32,
            zoom_factor in 0.7f32..1.4f32,
            cycles in 4usize..40
        ) {
            let total = 20_000usize;
            let mut vp = Viewport::new(total);
            vp.pan_world(-(total as f64 * 0.35), total);

            let cursor_px = pane_x + pane_w * cursor_u;
            let anchor_world_before = vp.pixel_x_to_world_x(cursor_px, pane_x, pane_w);

            for _ in 0..cycles {
                vp.zoom_at_pixel_x(cursor_px, pane_x, pane_w, zoom_factor, total);
                vp.zoom_at_pixel_x(cursor_px, pane_x, pane_w, 1.0 / zoom_factor, total);
            }

            let anchor_world_after = vp.pixel_x_to_world_x(cursor_px, pane_x, pane_w);
            let drift = (anchor_world_after - anchor_world_before).abs();
            prop_assert!(drift <= 1e-3, "anchor drifted by {drift}");
        }
    }
}

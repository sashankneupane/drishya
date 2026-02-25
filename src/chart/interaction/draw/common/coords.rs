use crate::{plots::model::PaneId, scale::PriceScale};

use crate::chart::Chart;

impl Chart {
    pub(crate) fn drawing_world_price_at(
        &self,
        x_pixels: f32,
        y_pixels: f32,
    ) -> Option<(f32, f64)> {
        self.drawing_anchor_at(x_pixels, y_pixels)
            .map(|(world_x, price, _)| (world_x, price))
    }

    pub(crate) fn drawing_anchor_at(
        &self,
        x_pixels: f32,
        y_pixels: f32,
    ) -> Option<(f32, f64, f64)> {
        if self.candles.is_empty() {
            return None;
        }

        let layout = self.current_layout();
        let price_pane = layout.price_pane().unwrap_or(layout.plot);
        if x_pixels < price_pane.x
            || x_pixels > price_pane.right()
            || y_pixels < price_pane.y
            || y_pixels > price_pane.bottom()
        {
            return None;
        }

        let vp = self.viewport?;
        let world_x = vp.pixel_x_to_world_x(x_pixels, price_pane.x, price_pane.w.max(1.0));

        let visible = self.visible_data();
        if visible.is_empty() {
            return None;
        }
        let (min_price, max_price, _) = self.compute_visible_bounds(visible);
        let (min_price, max_price) = apply_price_pane_y_zoom(
            min_price,
            max_price,
            self.pane_y_zoom_factor(&PaneId::Price),
            self.pane_y_pan_factor(&PaneId::Price),
        );
        let ps = PriceScale {
            pane: price_pane,
            min: min_price,
            max: max_price,
        };
        let price = self.price_from_y(y_pixels, ps);
        let span = (max_price - min_price).abs().max(1e-6);
        Some((world_x, price, span))
    }

    pub(crate) fn price_from_y(&self, y: f32, ps: PriceScale) -> f64 {
        let t = 1.0 - ((y - ps.pane.y) / ps.pane.h).clamp(0.0, 1.0);
        ps.min + (ps.max - ps.min) * t as f64
    }
}

fn apply_price_pane_y_zoom(min: f64, max: f64, zoom_factor: f32, pan_factor: f32) -> (f64, f64) {
    let span = (max - min).abs().max(1e-9);
    let zoomed_span = span * zoom_factor.max(0.01) as f64;
    let center = (max + min) * 0.5 + pan_factor as f64 * zoomed_span;
    let half = zoomed_span * 0.5;
    (center - half, center + half)
}

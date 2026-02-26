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
        let world_x = self
            .snap_pixel_x_to_world_x(x_pixels, price_pane.x, price_pane.w.max(1.0))
            .unwrap_or_else(|| {
                vp.pixel_x_to_world_x(x_pixels, price_pane.x, price_pane.w.max(1.0))
            });

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
            mode: self.price_axis_mode,
        };
        let price = ps.price_for_y(y_pixels);
        let span = (max_price - min_price).abs().max(1e-6);
        Some((world_x, price, span))
    }
}

fn apply_price_pane_y_zoom(min: f64, max: f64, zoom_factor: f32, pan_factor: f32) -> (f64, f64) {
    // Keep inverse coordinate mapping identical to the renderer's Y zoom logic.
    let center = (min + max) * 0.5;
    let half = ((max - min) * 0.5).max(1e-9);
    let zoomed_half = half / zoom_factor.max(1e-6) as f64;
    let pan_delta = zoomed_half * pan_factor as f64;
    (
        center - zoomed_half - pan_delta,
        center + zoomed_half - pan_delta,
    )
}

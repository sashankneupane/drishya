//! Chart interaction behaviors.
//!
//! This module keeps pan/zoom/crosshair behavior in one place and delegates
//! drawing tool logic to focused submodules.

mod draw;

use crate::plots::model::PaneId;

use super::Chart;

impl Chart {
    pub(crate) fn snap_world_x_to_candle_index(&self, world_x: f32) -> Option<f32> {
        if self.candles.is_empty() {
            return None;
        }
        let max = self.candles.len().saturating_sub(1) as f32;
        Some(world_x.round().clamp(0.0, max))
    }

    fn snap_world_x_to_time_step(&self, world_x: f32) -> Option<f32> {
        if self.candles.is_empty() {
            return None;
        }
        Some(world_x.round().max(0.0))
    }

    pub(crate) fn snap_pixel_x_to_world_x(
        &self,
        x_pixels: f32,
        pane_x: f32,
        pane_w: f32,
    ) -> Option<f32> {
        let vp = self.viewport?;
        let world_x = vp.pixel_x_to_world_x(x_pixels, pane_x, pane_w.max(1.0));
        self.snap_world_x_to_candle_index(world_x)
    }

    pub fn pan_pixels(&mut self, dx_pixels: f32) {
        if self.candles.is_empty() {
            return;
        }

        let layout = self.current_layout();
        let price_pane = layout.price_pane().unwrap_or(layout.plot);
        let plot_w = price_pane.w.max(1.0);

        if let Some(vp) = &mut self.viewport {
            vp.pan_pixels(dx_pixels, plot_w, self.candles.len());
        }
    }

    pub fn pan_pixels_2d(&mut self, dx_pixels: f32, dy_pixels: f32, anchor_y_pixels: f32) {
        self.pan_pixels(dx_pixels);
        self.pan_y_pixels_at(dy_pixels, anchor_y_pixels);
    }

    pub fn pan_y_pixels_at(&mut self, dy_pixels: f32, anchor_y_pixels: f32) {
        if dy_pixels == 0.0 {
            return;
        }

        let layout = self.current_layout();
        let target_pane = layout
            .panes
            .iter()
            .find(|pane| anchor_y_pixels >= pane.rect.y && anchor_y_pixels <= pane.rect.bottom())
            .map(|pane| pane.id.clone())
            .unwrap_or(crate::plots::model::PaneId::Price);

        let pane_h = layout
            .pane_by_id(&target_pane)
            .map(|p| p.rect.h.max(1.0))
            .unwrap_or(layout.plot.h.max(1.0));

        // Dragging should move the content in the same visual direction as the pointer.
        // Positive mouse dy (downward) should shift the visible value window upward
        // in data space, which corresponds to a negative pan-factor delta.
        let delta_factor = dy_pixels / pane_h;
        let current = self.pane_y_pan_factor(&target_pane);
        self.set_pane_y_pan_factor(&target_pane, current - delta_factor);
    }

    /// zoom_factor < 1.0 => zoom in, > 1.0 => zoom out
    pub fn zoom_at_x(&mut self, x_pixels: f32, zoom_factor: f32) {
        if self.candles.is_empty() || zoom_factor <= 0.0 {
            return;
        }

        let layout = self.current_layout();
        let price_pane = layout.price_pane().unwrap_or(layout.plot);

        if let Some(vp) = &mut self.viewport {
            vp.zoom_at_pixel_x(
                x_pixels,
                price_pane.x,
                price_pane.w.max(1.0),
                zoom_factor,
                self.candles.len(),
            );
        }
    }

    pub fn set_crosshair_at(&mut self, x_pixels: f32, y_pixels: f32) {
        let layout = self.current_layout();
        let plot = layout.plot;

        if x_pixels < plot.x
            || x_pixels > plot.right()
            || y_pixels < plot.y
            || y_pixels > plot.bottom()
        {
            self.crosshair = None;
            return;
        }

        let snapped_x = if let Some(vp) = self.viewport {
            let world_x = vp.pixel_x_to_world_x(x_pixels, plot.x, plot.w.max(1.0));
            let snapped_world_x = self.snap_world_x_to_time_step(world_x).unwrap_or(world_x);
            vp.world_x_to_pixel_x(snapped_world_x, plot.x, plot.w.max(1.0))
        } else {
            x_pixels
        };

        self.crosshair = Some(crate::types::Point {
            x: snapped_x,
            y: y_pixels,
        });
    }

    pub fn clear_crosshair(&mut self) {
        self.crosshair = None;
    }

    /// Zooms the y-axis scale of the pane under `y_pixels`.
    ///
    /// `zoom_factor < 1.0` zooms in (tighter range), `> 1.0` zooms out.
    pub fn zoom_y_axis_at(&mut self, y_pixels: f32, zoom_factor: f32) {
        if zoom_factor <= 0.0 {
            return;
        }

        let layout = self.current_layout();

        let target_pane = layout
            .panes
            .iter()
            .find(|pane| y_pixels >= pane.rect.y && y_pixels <= pane.rect.bottom())
            .map(|pane| pane.id.clone());

        let Some(pane_id) = target_pane else {
            return;
        };

        let current = self.pane_y_zoom_factor(&pane_id);
        let next = (current * zoom_factor).clamp(0.2, 10.0);
        self.set_pane_y_zoom_factor(&pane_id, next);
    }

    pub fn reset_y_axis_zoom(&mut self, pane_id: &str) {
        let id = if pane_id.eq_ignore_ascii_case("price") {
            PaneId::Price
        } else {
            PaneId::Named(pane_id.to_string())
        };
        self.set_pane_y_zoom_factor(&id, 1.0);
        self.set_pane_y_pan_factor(&id, 0.0);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::Candle;

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
    fn crosshair_x_snaps_to_nearest_candle_index() {
        let mut chart = Chart::new(800.0, 400.0);
        chart.set_data(vec![
            candle(1, 100.0),
            candle(2, 101.0),
            candle(3, 102.0),
            candle(4, 103.0),
        ]);

        let layout = chart.current_layout();
        let x = layout.plot.x + layout.plot.w * 0.37;
        let y = layout.plot.y + layout.plot.h * 0.5;
        chart.set_crosshair_at(x, y);

        let cross = chart.crosshair.expect("crosshair should be set");
        let vp = chart.viewport.expect("viewport should exist");
        let world = vp.pixel_x_to_world_x(cross.x, layout.plot.x, layout.plot.w.max(1.0));
        assert!((world - world.round()).abs() < 1e-3);
    }

    #[test]
    fn crosshair_can_move_to_future_time_steps() {
        let mut chart = Chart::new(800.0, 400.0);
        chart.set_data(vec![
            candle(1, 100.0),
            candle(2, 101.0),
            candle(3, 102.0),
            candle(4, 103.0),
        ]);

        chart.pan_pixels(-800.0);
        let layout = chart.current_layout();
        let x = layout.plot.right() - 2.0;
        let y = layout.plot.y + layout.plot.h * 0.5;
        chart.set_crosshair_at(x, y);

        let cross = chart.crosshair.expect("crosshair should be set");
        let vp = chart.viewport.expect("viewport should exist");
        let world = vp.pixel_x_to_world_x(cross.x, layout.plot.x, layout.plot.w.max(1.0));
        assert!(world > (chart.candles.len().saturating_sub(1) as f32));
        assert!((world - world.round()).abs() < 1e-3);
    }
}

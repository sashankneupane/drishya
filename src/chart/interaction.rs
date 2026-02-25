//! Chart interaction behaviors.
//!
//! This module keeps pan/zoom/crosshair behavior in one place and delegates
//! drawing tool logic to focused submodules.

mod draw;

use crate::plots::model::PaneId;

use super::Chart;

impl Chart {
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

        let delta_factor = dy_pixels / pane_h;
        let current = self.pane_y_pan_factor(&target_pane);
        self.set_pane_y_pan_factor(&target_pane, current + delta_factor);
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
        if self.point_in_drawing_toolbar(x_pixels, y_pixels)
            || self.point_in_chart_top_strip(x_pixels, y_pixels)
            || self.point_in_chart_object_tree(x_pixels, y_pixels)
        {
            self.crosshair = None;
            return;
        }

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

        self.crosshair = Some(crate::types::Point {
            x: x_pixels,
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

//! Chart interaction behaviors.
//!
//! The methods in this file convert user-space input (mouse pixels, zoom
//! factors) into chart-domain state updates.

use crate::{
    drawings::commands::{execute_command, DrawingCommand},
    layout::compute_layout,
    plots::model::PaneId,
    scale::PriceScale,
};

use super::Chart;

impl Chart {
    pub fn pan_pixels(&mut self, dx_pixels: f32) {
        if self.candles.is_empty() {
            return;
        }

        let pane_specs = self.pane_descriptors();
        let layout = compute_layout(self.size, &pane_specs);
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

        let pane_specs = self.pane_descriptors();
        let layout = compute_layout(self.size, &pane_specs);
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

        let pane_specs = self.pane_descriptors();
        let layout = compute_layout(self.size, &pane_specs);
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

    pub fn add_horizontal_line_at_y(&mut self, y_pixels: f32) {
        let visible = self.visible_data();
        if visible.is_empty() {
            return;
        }

        let pane_specs = self.pane_descriptors();
        let layout = compute_layout(self.size, &pane_specs);
        let price_pane = layout.price_pane().unwrap_or(layout.plot);
        if y_pixels < price_pane.y || y_pixels > price_pane.bottom() {
            return;
        }

        let (min_price, max_price, _) = self.compute_visible_bounds(visible);
        let ps = PriceScale {
            pane: price_pane,
            min: min_price,
            max: max_price,
        };

        let price = self.price_from_y(y_pixels, ps);
        // Dispatch via command layer so mutation policy stays centralized.
        let _ = execute_command(
            &mut self.drawings,
            DrawingCommand::AddHorizontalLine { price },
        );
    }

    pub fn add_vertical_line_at_x(&mut self, x_pixels: f32) {
        if self.candles.is_empty() {
            return;
        }

        let pane_specs = self.pane_descriptors();
        let layout = compute_layout(self.size, &pane_specs);
        let price_pane = layout.price_pane().unwrap_or(layout.plot);
        if x_pixels < price_pane.x || x_pixels > price_pane.right() {
            return;
        }

        if let Some(vp) = self.viewport {
            let world_x = vp.pixel_x_to_world_x(x_pixels, price_pane.x, price_pane.w.max(1.0));
            // Store world-space index rather than pixel X so line tracks pan/zoom.
            let _ = execute_command(
                &mut self.drawings,
                DrawingCommand::AddVerticalLine { index: world_x },
            );
        }
    }

    /// Clears all user drawings through the command layer.
    pub fn clear_drawings(&mut self) {
        let _ = execute_command(&mut self.drawings, DrawingCommand::ClearAll);
    }

    /// Removes a drawing by id; returns true if an item was removed.
    pub fn remove_drawing(&mut self, id: u64) -> bool {
        match execute_command(&mut self.drawings, DrawingCommand::RemoveById { id }) {
            crate::drawings::commands::DrawingCommandResult::Removed { removed } => removed,
            _ => false,
        }
    }

    pub fn set_crosshair_at(&mut self, x_pixels: f32, y_pixels: f32) {
        let pane_specs = self.pane_descriptors();
        let layout = compute_layout(self.size, &pane_specs);
        let plot = layout.plot;

        if x_pixels < plot.x || x_pixels > plot.right() || y_pixels < plot.y || y_pixels > plot.bottom() {
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

        let pane_specs = self.pane_descriptors();
        let layout = compute_layout(self.size, &pane_specs);

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

    fn price_from_y(&self, y: f32, ps: PriceScale) -> f64 {
        let t = 1.0 - ((y - ps.pane.y) / ps.pane.h).clamp(0.0, 1.0);
        ps.min + (ps.max - ps.min) * t as f64
    }
}

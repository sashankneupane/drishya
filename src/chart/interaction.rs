//! Chart interaction behaviors.
//!
//! The methods in this file convert user-space input (mouse pixels, zoom
//! factors) into chart-domain state updates.

use crate::{
    drawings::commands::{execute_command, DrawingCommand},
    layout::compute_layout,
    scale::PriceScale,
};

use super::Chart;

impl Chart {
    pub fn pan_pixels(&mut self, dx_pixels: f32) {
        if self.candles.is_empty() {
            return;
        }

        let layout = compute_layout(self.size);
        let plot_w = layout.price_pane.w.max(1.0);

        if let Some(vp) = &mut self.viewport {
            // Convert horizontal pixel drag into fractional-bar movement so
            // panning remains consistent across zoom levels.
            let bars_per_pixel = vp.bars_visible / plot_w;
            vp.offset -= dx_pixels * bars_per_pixel;
            vp.clamp(self.candles.len());
        }
    }

    /// zoom_factor < 1.0 => zoom in, > 1.0 => zoom out
    pub fn zoom_at_x(&mut self, x_pixels: f32, zoom_factor: f32) {
        if self.candles.is_empty() || zoom_factor <= 0.0 {
            return;
        }

        let layout = compute_layout(self.size);

        if let Some(vp) = &mut self.viewport {
            let plot_x = layout.price_pane.x;
            let plot_w = layout.price_pane.w.max(1.0);

            // Keep the candle under the cursor visually anchored while zooming.
            let u = ((x_pixels - plot_x) / plot_w).clamp(0.0, 1.0);
            let anchor_index = vp.offset + vp.bars_visible * u;

            vp.bars_visible *= zoom_factor;
            vp.clamp(self.candles.len());

            vp.offset = anchor_index - vp.bars_visible * u;
            vp.clamp(self.candles.len());
        }
    }

    pub fn add_horizontal_line_at_y(&mut self, y_pixels: f32) {
        let visible = self.visible_data();
        if visible.is_empty() {
            return;
        }

        let layout = compute_layout(self.size);
        if y_pixels < layout.price_pane.y || y_pixels > layout.price_pane.bottom() {
            return;
        }

        let (min_price, max_price, _) = self.compute_visible_bounds(visible);
        let ps = PriceScale {
            pane: layout.price_pane,
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

        let layout = compute_layout(self.size);
        if x_pixels < layout.price_pane.x || x_pixels > layout.price_pane.right() {
            return;
        }

        if let Some(vp) = self.viewport {
            let plot_x = layout.price_pane.x;
            let plot_w = layout.price_pane.w.max(1.0);
            let u = ((x_pixels - plot_x) / plot_w).clamp(0.0, 1.0);
            let idx = vp.offset + vp.bars_visible * u;
            // Store world-space index rather than pixel X so line tracks pan/zoom.
            let _ = execute_command(
                &mut self.drawings,
                DrawingCommand::AddVerticalLine { index: idx },
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

    fn price_from_y(&self, y: f32, ps: PriceScale) -> f64 {
        let t = 1.0 - ((y - ps.pane.y) / ps.pane.h).clamp(0.0, 1.0);
        ps.min + (ps.max - ps.min) * t as f64
    }
}
use crate::{
    drawings::commands::execute_command,
    drawings::shape::line as line_shape,
    scale::PriceScale,
};

use crate::chart::Chart;

impl Chart {
    pub fn add_horizontal_line_at_y(&mut self, y_pixels: f32) {
        let visible = self.visible_data();
        if visible.is_empty() {
            return;
        }

        let layout = self.current_layout();
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
        let _ = execute_command(&mut self.drawings, line_shape::add_horizontal_command(price));
    }

    pub fn add_vertical_line_at_x(&mut self, x_pixels: f32) {
        if self.candles.is_empty() {
            return;
        }

        let layout = self.current_layout();
        let price_pane = layout.price_pane().unwrap_or(layout.plot);
        if x_pixels < price_pane.x || x_pixels > price_pane.right() {
            return;
        }

        if let Some(vp) = self.viewport {
            let world_x = vp.pixel_x_to_world_x(x_pixels, price_pane.x, price_pane.w.max(1.0));
            let _ = execute_command(&mut self.drawings, line_shape::add_vertical_command(world_x));
        }
    }
}

use crate::chart::Chart;
use crate::{
    drawings::commands::execute_command, drawings::shape::text as text_shape, scale::PriceScale,
};

impl Chart {
    pub fn add_text_at(&mut self, x_pixels: f32, y_pixels: f32) {
        let visible = self.visible_data();
        if visible.is_empty() {
            return;
        }

        let layout = self.current_layout();
        let price_pane = layout.price_pane().unwrap_or(layout.plot);
        if x_pixels < price_pane.x || x_pixels > price_pane.right() {
            return;
        }
        if y_pixels < price_pane.y || y_pixels > price_pane.bottom() {
            return;
        }

        let (min_price, max_price, _) = self.compute_visible_bounds(visible);
        let ps = PriceScale {
            pane: price_pane,
            min: min_price,
            max: max_price,
            mode: self.price_axis_mode,
        };
        let price = ps.price_for_y(y_pixels);
        let Some(vp) = self.viewport else {
            return;
        };
        let index = self
            .snap_pixel_x_to_world_x(x_pixels, price_pane.x, price_pane.w.max(1.0))
            .unwrap_or_else(|| {
                vp.pixel_x_to_world_x(x_pixels, price_pane.x, price_pane.w.max(1.0))
            });

        let _ = execute_command(
            &mut self.drawings,
            text_shape::add_text_command(index, price, "Text".to_string()),
        );
    }
}

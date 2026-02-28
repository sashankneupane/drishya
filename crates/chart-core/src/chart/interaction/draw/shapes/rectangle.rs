use crate::drawings::commands::execute_command;
use crate::drawings::shape::rectangle as rectangle_shape;

use crate::chart::Chart;

impl Chart {
    pub fn add_rectangle_at(&mut self, x_pixels: f32, y_pixels: f32) {
        let Some((world_x, price, price_span)) = self.drawing_anchor_at(x_pixels, y_pixels) else {
            return;
        };

        let cmd = rectangle_shape::add_command_from_anchor(world_x, price, price_span);
        let _ = execute_command(&mut self.drawings, cmd);
    }

    pub fn add_rectangle_from_pixels(
        &mut self,
        x1_pixels: f32,
        y1_pixels: f32,
        x2_pixels: f32,
        y2_pixels: f32,
    ) {
        let Some((start_index, price1)) = self.drawing_world_price_at(x1_pixels, y1_pixels) else {
            return;
        };
        let Some((end_index, price2)) = self.drawing_world_price_at(x2_pixels, y2_pixels) else {
            return;
        };
        let cmd = rectangle_shape::add_command_from_points(start_index, price1, end_index, price2);
        let _ = execute_command(&mut self.drawings, cmd);
    }
}

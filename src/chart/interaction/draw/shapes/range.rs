use crate::chart::Chart;
use crate::drawings::commands::execute_command;
use crate::drawings::shape::range as range_shape;

impl Chart {
    pub fn add_price_range_from_pixels(
        &mut self,
        x1_pixels: f32,
        y1_pixels: f32,
        x2_pixels: f32,
        y2_pixels: f32,
    ) {
        let Some((start_index, start_price)) = self.drawing_world_price_at(x1_pixels, y1_pixels)
        else {
            return;
        };
        let Some((end_index, end_price)) = self.drawing_world_price_at(x2_pixels, y2_pixels) else {
            return;
        };
        let cmd = range_shape::add_price_range_command_from_points(
            start_index,
            start_price,
            end_index,
            end_price,
        );
        let _ = execute_command(&mut self.drawings, cmd);
    }

    pub fn add_time_range_from_pixels(
        &mut self,
        x1_pixels: f32,
        y1_pixels: f32,
        x2_pixels: f32,
        y2_pixels: f32,
    ) {
        let Some((start_index, start_price)) = self.drawing_world_price_at(x1_pixels, y1_pixels)
        else {
            return;
        };
        let Some((end_index, end_price)) = self.drawing_world_price_at(x2_pixels, y2_pixels) else {
            return;
        };
        let cmd = range_shape::add_time_range_command_from_points(
            start_index,
            start_price,
            end_index,
            end_price,
        );
        let _ = execute_command(&mut self.drawings, cmd);
    }

    pub fn add_date_time_range_from_pixels(
        &mut self,
        x1_pixels: f32,
        y1_pixels: f32,
        x2_pixels: f32,
        y2_pixels: f32,
    ) {
        let Some((start_index, start_price)) = self.drawing_world_price_at(x1_pixels, y1_pixels)
        else {
            return;
        };
        let Some((end_index, end_price)) = self.drawing_world_price_at(x2_pixels, y2_pixels) else {
            return;
        };
        let cmd = range_shape::add_date_time_range_command_from_points(
            start_index,
            start_price,
            end_index,
            end_price,
        );
        let _ = execute_command(&mut self.drawings, cmd);
    }
}

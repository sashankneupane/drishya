use crate::{
    drawings::shape::fib as fib_shape,
    drawings::shape::position as position_shape,
    drawings::shape::ray as ray_shape,
    drawings::shape::rectangle as rectangle_shape,
    drawings::types::Drawing,
    types::Point,
};

use crate::chart::Chart;

impl Chart {
    pub(crate) fn active_drawing_preview(&self) -> Option<Drawing> {
        let start = self.drawing_interaction.pending_start?;
        let end = self.drawing_interaction.last_pointer?;

        let (start_index, start_price) = self.drawing_world_price_at(start.x, start.y)?;
        let (end_index, end_price) = self.drawing_world_price_at(end.x, end.y)?;

        match self.drawing_tool_mode {
            crate::chart::tools::DrawingToolMode::Rectangle => {
                Some(rectangle_shape::preview(start_index, start_price, end_index, end_price))
            }
            crate::chart::tools::DrawingToolMode::FibRetracement => {
                Some(fib_shape::preview(start_index, start_price, end_index, end_price))
            }
            crate::chart::tools::DrawingToolMode::Ray => {
                Some(ray_shape::preview(start_index, start_price, end_index, end_price))
            }
            crate::chart::tools::DrawingToolMode::LongPosition => Some(
                position_shape::long_preview(start_index, start_price, end_index, end_price),
            ),
            crate::chart::tools::DrawingToolMode::ShortPosition => Some(
                position_shape::short_preview(start_index, start_price, end_index, end_price),
            ),
            _ => None,
        }
    }

    pub(crate) fn finalize_shape_from_points(&mut self, start: Point, end: Point) {
        match self.drawing_tool_mode {
            crate::chart::tools::DrawingToolMode::Rectangle => {
                self.add_rectangle_from_pixels(start.x, start.y, end.x, end.y)
            }
            crate::chart::tools::DrawingToolMode::FibRetracement => {
                self.add_fib_retracement_from_pixels(start.x, start.y, end.x, end.y)
            }
            crate::chart::tools::DrawingToolMode::Ray => {
                self.add_ray_from_pixels(start.x, start.y, end.x, end.y)
            }
            crate::chart::tools::DrawingToolMode::LongPosition => {
                self.add_long_position_from_pixels(start.x, start.y, end.x, end.y)
            }
            crate::chart::tools::DrawingToolMode::ShortPosition => {
                self.add_short_position_from_pixels(start.x, start.y, end.x, end.y)
            }
            _ => {}
        }
    }
}

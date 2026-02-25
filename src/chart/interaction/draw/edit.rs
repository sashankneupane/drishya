use crate::{
    drawings::hit_test::RectHitTarget, drawings::shape::fib as fib_shape,
    drawings::shape::position as position_shape, drawings::shape::rectangle as rectangle_shape,
    drawings::types::Drawing, types::Point,
};

use crate::chart::Chart;

impl Chart {
    pub fn move_drawing_by_pixels(&mut self, id: u64, dx_pixels: f32, dy_pixels: f32) -> bool {
        let layout = self.current_layout();
        let price_pane = layout.price_pane().unwrap_or(layout.plot);

        let Some(vp) = self.viewport else {
            return false;
        };
        let world_dx = if price_pane.w.abs() <= 1e-6 {
            0.0
        } else {
            (dx_pixels / price_pane.w) * vp.world_span() as f32
        };

        let visible = self.visible_data();
        if visible.is_empty() {
            return false;
        }
        let (min_price, max_price, _) = self.compute_visible_bounds(visible);
        let price_range = (max_price - min_price).abs().max(1e-6);
        let price_dy = -((dy_pixels / price_pane.h.max(1.0)) as f64) * price_range;

        let Some(drawing) = self.drawings.drawing_mut(id) else {
            return false;
        };

        match drawing {
            Drawing::HorizontalLine(item) => {
                item.price += price_dy;
            }
            Drawing::VerticalLine(item) => {
                item.index += world_dx;
            }
            Drawing::Ray(item) => {
                item.start_index += world_dx;
                item.end_index += world_dx;
                item.start_price += price_dy;
                item.end_price += price_dy;
            }
            Drawing::Rectangle(item) => {
                item.start_index += world_dx;
                item.end_index += world_dx;
                item.top_price += price_dy;
                item.bottom_price += price_dy;
            }
            Drawing::FibRetracement(item) => {
                item.start_index += world_dx;
                item.end_index += world_dx;
                item.start_price += price_dy;
                item.end_price += price_dy;
            }
            Drawing::LongPosition(item) => {
                item.start_index += world_dx;
                item.end_index += world_dx;
                item.entry_price += price_dy;
                item.stop_price += price_dy;
                item.target_price += price_dy;
            }
            Drawing::ShortPosition(item) => {
                item.start_index += world_dx;
                item.end_index += world_dx;
                item.entry_price += price_dy;
                item.stop_price += price_dy;
                item.target_price += price_dy;
            }
        }

        true
    }

    pub(crate) fn is_resizable_primitive(&self, drawing_id: u64) -> bool {
        matches!(
            self.drawings.drawing(drawing_id),
            Some(Drawing::Rectangle(_))
                | Some(Drawing::FibRetracement(_))
                | Some(Drawing::LongPosition(_))
                | Some(Drawing::ShortPosition(_))
        )
    }

    pub(crate) fn resize_drawing_to_pointer(
        &mut self,
        drawing_id: u64,
        target: RectHitTarget,
        pointer: Point,
    ) -> Option<RectHitTarget> {
        let (world_x, price) = self.drawing_world_price_at(pointer.x, pointer.y)?;
        let drawing = self.drawings.drawing_mut(drawing_id)?;

        match drawing {
            Drawing::Rectangle(item) => Some(rectangle_shape::resize(item, target, world_x, price)),
            Drawing::FibRetracement(item) => Some(fib_shape::resize(item, target, world_x, price)),
            Drawing::LongPosition(item) => {
                Some(position_shape::resize_long(item, target, world_x, price))
            }
            Drawing::ShortPosition(item) => {
                Some(position_shape::resize_short(item, target, world_x, price))
            }
            _ => None,
        }
    }
}

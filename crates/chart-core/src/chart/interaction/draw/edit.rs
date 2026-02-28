use crate::{
    drawings::hit_test::RectHitTarget, drawings::shape::fib as fib_shape,
    drawings::shape::position as position_shape, drawings::shape::range as range_shape,
    drawings::shape::rectangle as rectangle_shape, drawings::types::Drawing, types::Point,
};

use crate::chart::Chart;

impl Chart {
    pub fn move_drawing_by_pixels(&mut self, id: u64, dx_pixels: f32, dy_pixels: f32) -> bool {
        if self.is_drawing_locked(id) {
            return false;
        }
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
            Drawing::PriceRange(item) => {
                item.start_index += world_dx;
                item.end_index += world_dx;
                item.top_price += price_dy;
                item.bottom_price += price_dy;
            }
            Drawing::TimeRange(item) => {
                item.start_index += world_dx;
                item.end_index += world_dx;
                item.top_price += price_dy;
                item.bottom_price += price_dy;
            }
            Drawing::DateTimeRange(item) => {
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
            Drawing::Triangle(item) => {
                item.p1_index += world_dx;
                item.p2_index += world_dx;
                item.p3_index += world_dx;
                item.p1_price += price_dy;
                item.p2_price += price_dy;
                item.p3_price += price_dy;
            }
            Drawing::Circle(item) => {
                item.center_index += world_dx;
                item.radius_index += world_dx;
                item.center_price += price_dy;
                item.radius_price += price_dy;
            }
            Drawing::Ellipse(item) => {
                item.p1_index += world_dx;
                item.p2_index += world_dx;
                item.p3_index += world_dx;
                item.p1_price += price_dy;
                item.p2_price += price_dy;
                item.p3_price += price_dy;
            }
            Drawing::Text(item) => {
                item.index += world_dx;
                item.price += price_dy;
            }
            Drawing::BrushStroke(s) => {
                for p in &mut s.points {
                    p.index += world_dx;
                    p.price += price_dy;
                }
            }
            Drawing::HighlightStroke(s) => {
                for p in &mut s.points {
                    p.index += world_dx;
                    p.price += price_dy;
                }
            }
        }
        snap_drawing_x_to_candles(drawing, self.candles.len());

        true
    }

    pub(crate) fn is_resizable_primitive(&self, drawing_id: u64) -> bool {
        matches!(
            self.drawings.drawing(drawing_id),
            Some(Drawing::Rectangle(_))
                | Some(Drawing::PriceRange(_))
                | Some(Drawing::TimeRange(_))
                | Some(Drawing::DateTimeRange(_))
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
        if self.is_drawing_locked(drawing_id) {
            return None;
        }
        let (world_x, price) = self.drawing_world_price_at(pointer.x, pointer.y)?;
        let drawing = self.drawings.drawing_mut(drawing_id)?;

        match drawing {
            Drawing::Rectangle(item) => Some(rectangle_shape::resize(item, target, world_x, price)),
            Drawing::PriceRange(item) => Some(range_shape::resize_price_range(
                item, target, world_x, price,
            )),
            Drawing::TimeRange(item) => {
                Some(range_shape::resize_time_range(item, target, world_x, price))
            }
            Drawing::DateTimeRange(item) => Some(range_shape::resize_date_time_range(
                item, target, world_x, price,
            )),
            Drawing::FibRetracement(item) => Some(fib_shape::resize(item, target, world_x, price)),
            Drawing::LongPosition(item) => {
                Some(position_shape::resize_long(item, target, world_x, price))
            }
            Drawing::ShortPosition(item) => {
                Some(position_shape::resize_short(item, target, world_x, price))
            }
            Drawing::Triangle(item) => {
                // Move all three vertices together
                item.p1_index += world_x - item.p1_index;
                item.p2_index += world_x - item.p1_index;
                item.p3_index += world_x - item.p1_index;
                None // Triangle uses vertex drag, not rect resize
            }
            Drawing::Circle(item) => Some({
                // Adjust radius point only
                item.radius_index = world_x;
                item.radius_price = price;
                RectHitTarget::Inside
            }),
            Drawing::Ellipse(item) => Some({
                // Move the third control point (perpendicular radius)
                item.p3_index = world_x;
                item.p3_price = price;
                RectHitTarget::Inside
            }),
            _ => None,
        }
        .inspect(|_| snap_drawing_x_to_candles(drawing, self.candles.len()))
    }
}

fn snap_drawing_x_to_candles(drawing: &mut Drawing, candles_len: usize) {
    if candles_len == 0 {
        return;
    }
    let snap = |x: &mut f32| *x = x.round().max(0.0);

    match drawing {
        Drawing::VerticalLine(item) => snap(&mut item.index),
        Drawing::Ray(item) => {
            snap(&mut item.start_index);
            snap(&mut item.end_index);
        }
        Drawing::Rectangle(item) => {
            snap(&mut item.start_index);
            snap(&mut item.end_index);
        }
        Drawing::PriceRange(item) => {
            snap(&mut item.start_index);
            snap(&mut item.end_index);
        }
        Drawing::TimeRange(item) => {
            snap(&mut item.start_index);
            snap(&mut item.end_index);
        }
        Drawing::DateTimeRange(item) => {
            snap(&mut item.start_index);
            snap(&mut item.end_index);
        }
        Drawing::LongPosition(item) => {
            snap(&mut item.start_index);
            snap(&mut item.end_index);
            snap(&mut item.entry_index);
        }
        Drawing::ShortPosition(item) => {
            snap(&mut item.start_index);
            snap(&mut item.end_index);
            snap(&mut item.entry_index);
        }
        Drawing::FibRetracement(item) => {
            snap(&mut item.start_index);
            snap(&mut item.end_index);
        }
        Drawing::Circle(item) => {
            snap(&mut item.center_index);
            snap(&mut item.radius_index);
        }
        Drawing::Triangle(item) => {
            snap(&mut item.p1_index);
            snap(&mut item.p2_index);
            snap(&mut item.p3_index);
        }
        Drawing::Ellipse(item) => {
            snap(&mut item.p1_index);
            snap(&mut item.p2_index);
            snap(&mut item.p3_index);
        }
        Drawing::Text(item) => snap(&mut item.index),
        Drawing::BrushStroke(item) => {
            for p in &mut item.points {
                snap(&mut p.index);
            }
        }
        Drawing::HighlightStroke(item) => {
            for p in &mut item.points {
                snap(&mut p.index);
            }
        }
        Drawing::HorizontalLine(_) => {}
    }
}

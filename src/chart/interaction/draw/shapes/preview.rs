use crate::{
    drawings::shape::circle as circle_shape, drawings::shape::ellipse as ellipse_shape,
    drawings::shape::fib as fib_shape, drawings::shape::position as position_shape,
    drawings::shape::range as range_shape, drawings::shape::ray as ray_shape,
    drawings::shape::rectangle as rectangle_shape, drawings::shape::triangle as triangle_shape,
    drawings::types::Drawing, types::Point,
};

use crate::chart::Chart;

impl Chart {
    pub(crate) fn active_drawing_preview(&self) -> Option<Drawing> {
        let start = self.drawing_interaction.pending_start?;
        let end = self.drawing_interaction.last_pointer?;

        let (start_index, start_price) = self.drawing_world_price_at(start.x, start.y)?;
        let (end_index, end_price) = self.drawing_world_price_at(end.x, end.y)?;

        match self.drawing_tool_mode {
            crate::chart::tools::DrawingToolMode::Rectangle => Some(rectangle_shape::preview(
                start_index,
                start_price,
                end_index,
                end_price,
            )),
            crate::chart::tools::DrawingToolMode::PriceRange => Some(
                range_shape::price_range_preview(start_index, start_price, end_index, end_price),
            ),
            crate::chart::tools::DrawingToolMode::TimeRange => Some(
                range_shape::time_range_preview(start_index, start_price, end_index, end_price),
            ),
            crate::chart::tools::DrawingToolMode::DateTimeRange => {
                Some(range_shape::date_time_range_preview(
                    start_index,
                    start_price,
                    end_index,
                    end_price,
                ))
            }
            crate::chart::tools::DrawingToolMode::FibRetracement => Some(fib_shape::preview(
                start_index,
                start_price,
                end_index,
                end_price,
            )),
            crate::chart::tools::DrawingToolMode::Ray => Some(ray_shape::preview(
                start_index,
                start_price,
                end_index,
                end_price,
            )),
            crate::chart::tools::DrawingToolMode::LongPosition => Some(
                position_shape::long_preview(start_index, start_price, end_index, end_price),
            ),
            crate::chart::tools::DrawingToolMode::ShortPosition => Some(
                position_shape::short_preview(start_index, start_price, end_index, end_price),
            ),
            crate::chart::tools::DrawingToolMode::Triangle => {
                // Collect world-space points from already-confirmed pending_points
                let confirmed: Vec<crate::types::Point> = self
                    .drawing_interaction
                    .pending_points
                    .iter()
                    .filter_map(|p| {
                        let (idx, pr) = self.drawing_world_price_at(p.x, p.y)?;
                        Some(crate::types::Point {
                            x: idx,
                            y: pr as f32,
                        })
                    })
                    .collect();
                let (end_idx, end_pr) = self.drawing_world_price_at(end.x, end.y)?;
                let cursor_pt = crate::types::Point {
                    x: end_idx,
                    y: end_pr as f32,
                };

                match confirmed.len() {
                    0 => None, // No confirmed points yet — no preview
                    1 => None, // One point clicked — wait silently for the second
                    _ => {
                        // 2+ confirmed points — show full triangle preview with fill
                        let mut pts = confirmed;
                        pts.push(cursor_pt);
                        Some(triangle_shape::preview(&pts))
                    }
                }
            }
            crate::chart::tools::DrawingToolMode::Circle => Some(circle_shape::preview(
                start_index,
                start_price,
                end_index,
                end_price,
            )),
            crate::chart::tools::DrawingToolMode::Ellipse => {
                // 3-click: p1+p2 = diameter 1, p3 = perpendicular radius
                let confirmed: Vec<crate::types::Point> = self
                    .drawing_interaction
                    .pending_points
                    .iter()
                    .filter_map(|p| {
                        let (idx, pr) = self.drawing_world_price_at(p.x, p.y)?;
                        Some(crate::types::Point {
                            x: idx,
                            y: pr as f32,
                        })
                    })
                    .collect();
                let (end_idx, end_pr) = self.drawing_world_price_at(end.x, end.y)?;
                let cursor_pt = crate::types::Point {
                    x: end_idx,
                    y: end_pr as f32,
                };

                match confirmed.len() {
                    0 => None, // No points yet
                    1 => None, // One diameter endpoint — wait silently
                    _ => {
                        // 2+ points — show ellipse preview
                        let mut pts = confirmed;
                        pts.push(cursor_pt);
                        Some(ellipse_shape::preview(&pts))
                    }
                }
            }
            _ => None,
        }
    }

    pub(crate) fn finalize_shape_from_points(&mut self, start: Point, end: Point) {
        match self.drawing_tool_mode {
            crate::chart::tools::DrawingToolMode::Rectangle => {
                self.add_rectangle_from_pixels(start.x, start.y, end.x, end.y)
            }
            crate::chart::tools::DrawingToolMode::PriceRange => {
                self.add_price_range_from_pixels(start.x, start.y, end.x, end.y)
            }
            crate::chart::tools::DrawingToolMode::TimeRange => {
                self.add_time_range_from_pixels(start.x, start.y, end.x, end.y)
            }
            crate::chart::tools::DrawingToolMode::DateTimeRange => {
                self.add_date_time_range_from_pixels(start.x, start.y, end.x, end.y)
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
            crate::chart::tools::DrawingToolMode::Triangle => {
                // Triangle finalize is handled in pointer.rs multi-click logic, not here
            }
            crate::chart::tools::DrawingToolMode::Circle => {
                self.add_circle_from_pixels(start.x, start.y, end.x, end.y)
            }
            crate::chart::tools::DrawingToolMode::Ellipse => {
                // Ellipse finalize is handled in pointer.rs multi-click logic, not here
            }
            _ => {}
        }
    }
}

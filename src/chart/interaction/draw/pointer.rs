use crate::{
    drawings::hit_test::{InteractionMode, LocalHitInfo, RectHitTarget},
    types::Point,
};

use crate::chart::Chart;

const DRAW_SHAPE_DRAG_THRESHOLD_PX: f32 = 3.0;

impl Chart {
    pub fn drawing_cursor_hint_at(&self, x_pixels: f32, y_pixels: f32) -> &'static str {
        match self.drawing_tool_mode {
            crate::chart::tools::DrawingToolMode::Select => {
                if self.drawing_interaction.dragging_drawing_id.is_some() {
                    return "grabbing";
                }

                if self
                    .hit_test_drawings(x_pixels, y_pixels, InteractionMode::Hover)
                    .is_some()
                {
                    return "pointer";
                }

                if self.hit_test_series_at(x_pixels, y_pixels).is_some() {
                    return "pointer";
                }

                "crosshair"
            }
            _ => "crosshair",
        }
    }

    pub fn set_drawing_tool_mode(&mut self, mode: crate::chart::tools::DrawingToolMode) {
        self.drawing_tool_mode = mode;
        self.cancel_drawing_interaction();
    }

    pub fn drawing_tool_mode(&self) -> crate::chart::tools::DrawingToolMode {
        self.drawing_tool_mode
    }

    pub fn cancel_drawing_interaction(&mut self) {
        self.drawing_interaction = Default::default();
    }

    pub fn drawing_pointer_down(&mut self, x_pixels: f32, y_pixels: f32) -> bool {
        self.set_crosshair_at(x_pixels, y_pixels);

        let point = Point {
            x: x_pixels,
            y: y_pixels,
        };

        match self.drawing_tool_mode {
            crate::chart::tools::DrawingToolMode::Select => {
                if let Some(hit) =
                    self.hit_test_drawings(x_pixels, y_pixels, InteractionMode::Select)
                {
                    self.selected_drawing_id = Some(hit.primitive_id);
                    self.selected_series_id = None;
                    self.drawing_interaction.pointer_down = true;
                    self.drawing_interaction.dragging_drawing_id = Some(hit.primitive_id);
                    self.drawing_interaction.dragging_resize_target = match hit.local {
                        LocalHitInfo::Rect { target }
                            if self.is_resizable_primitive(hit.primitive_id) =>
                        {
                            if matches!(target, RectHitTarget::Inside) {
                                None
                            } else {
                                Some(target)
                            }
                        }
                        _ => None,
                    };
                    self.drawing_interaction.last_pointer = Some(point);
                    return true;
                }
                self.selected_drawing_id = None;
                false
            }
            crate::chart::tools::DrawingToolMode::HorizontalLine => {
                self.add_horizontal_line_at_y(y_pixels);
                self.set_drawing_tool_mode(crate::chart::tools::DrawingToolMode::Select);
                true
            }
            crate::chart::tools::DrawingToolMode::VerticalLine => {
                self.add_vertical_line_at_x(x_pixels);
                self.set_drawing_tool_mode(crate::chart::tools::DrawingToolMode::Select);
                true
            }
            crate::chart::tools::DrawingToolMode::Rectangle
            | crate::chart::tools::DrawingToolMode::PriceRange
            | crate::chart::tools::DrawingToolMode::TimeRange
            | crate::chart::tools::DrawingToolMode::DateTimeRange
            | crate::chart::tools::DrawingToolMode::FibRetracement
            | crate::chart::tools::DrawingToolMode::Ray
            | crate::chart::tools::DrawingToolMode::LongPosition
            | crate::chart::tools::DrawingToolMode::ShortPosition => {
                self.drawing_interaction.pointer_down = true;
                self.drawing_interaction.dragged = false;
                if self.drawing_interaction.pending_start.is_none() {
                    self.drawing_interaction.pending_start = Some(point);
                }
                self.drawing_interaction.last_pointer = Some(point);
                true
            }
        }
    }

    pub fn drawing_pointer_move(&mut self, x_pixels: f32, y_pixels: f32) -> bool {
        self.set_crosshair_at(x_pixels, y_pixels);

        let point = Point {
            x: x_pixels,
            y: y_pixels,
        };

        if let Some(drawing_id) = self.drawing_interaction.dragging_drawing_id {
            if self.drawing_interaction.pointer_down {
                if let Some(resize_target) = self.drawing_interaction.dragging_resize_target {
                    if let Some(next_target) =
                        self.resize_drawing_to_pointer(drawing_id, resize_target, point)
                    {
                        self.drawing_interaction.dragging_resize_target = Some(next_target);
                        self.drawing_interaction.last_pointer = Some(point);
                        return true;
                    }
                } else if let Some(last) = self.drawing_interaction.last_pointer {
                    let dx = point.x - last.x;
                    let dy = point.y - last.y;
                    if dx != 0.0 || dy != 0.0 {
                        self.move_drawing_by_pixels(drawing_id, dx, dy);
                        self.drawing_interaction.last_pointer = Some(point);
                        return true;
                    }
                }
            }
            return true;
        }

        if let Some(start) = self.drawing_interaction.pending_start {
            if self.drawing_interaction.pointer_down {
                let dist = ((point.x - start.x).powi(2) + (point.y - start.y).powi(2)).sqrt();
                if dist >= DRAW_SHAPE_DRAG_THRESHOLD_PX {
                    self.drawing_interaction.dragged = true;
                }
            }
            self.drawing_interaction.last_pointer = Some(point);
            return true;
        }

        false
    }

    pub fn drawing_pointer_up(&mut self, x_pixels: f32, y_pixels: f32) -> bool {
        self.set_crosshair_at(x_pixels, y_pixels);

        let point = Point {
            x: x_pixels,
            y: y_pixels,
        };

        if self.drawing_interaction.dragging_drawing_id.is_some() {
            self.drawing_interaction.pointer_down = false;
            self.drawing_interaction.dragging_drawing_id = None;
            self.drawing_interaction.dragging_resize_target = None;
            self.drawing_interaction.pending_start = None;
            self.drawing_interaction.dragged = false;
            self.drawing_interaction.last_pointer = Some(point);
            return true;
        }

        if !self.drawing_interaction.pointer_down {
            return false;
        }

        self.drawing_interaction.pointer_down = false;
        let start = self.drawing_interaction.pending_start;
        if self.drawing_interaction.dragged {
            if let Some(start) = start {
                self.finalize_shape_from_points(start, point);
                self.drawing_interaction.pending_start = None;
                self.set_drawing_tool_mode(crate::chart::tools::DrawingToolMode::Select);
                return true;
            }
        } else if is_two_point_shape_tool(self.drawing_tool_mode) {
            if let Some(start) = start {
                let dist = ((point.x - start.x).powi(2) + (point.y - start.y).powi(2)).sqrt();
                if dist >= DRAW_SHAPE_DRAG_THRESHOLD_PX {
                    self.finalize_shape_from_points(start, point);
                    self.drawing_interaction.pending_start = None;
                    self.set_drawing_tool_mode(crate::chart::tools::DrawingToolMode::Select);
                    return true;
                }

                // First click in click-click mode: keep anchor and wait for next click.
                self.drawing_interaction.pending_start = Some(start);
            }
        }

        self.drawing_interaction.dragged = false;
        self.drawing_interaction.last_pointer = Some(point);
        true
    }
}

fn is_two_point_shape_tool(mode: crate::chart::tools::DrawingToolMode) -> bool {
    matches!(
        mode,
        crate::chart::tools::DrawingToolMode::Rectangle
            | crate::chart::tools::DrawingToolMode::PriceRange
            | crate::chart::tools::DrawingToolMode::TimeRange
            | crate::chart::tools::DrawingToolMode::DateTimeRange
            | crate::chart::tools::DrawingToolMode::FibRetracement
            | crate::chart::tools::DrawingToolMode::Ray
            | crate::chart::tools::DrawingToolMode::LongPosition
            | crate::chart::tools::DrawingToolMode::ShortPosition
    )
}

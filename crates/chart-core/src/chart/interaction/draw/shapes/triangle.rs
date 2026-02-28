use crate::drawings::commands::execute_command;
use crate::drawings::shape::triangle as triangle_shape;
use crate::types::Point;

use crate::chart::Chart;

impl Chart {
    /// Called once all 3 triangle vertices have been collected via multi-click.
    pub fn add_triangle_from_pixels_3(
        &mut self,
        x1: f32,
        y1: f32,
        x2: f32,
        y2: f32,
        x3: f32,
        y3: f32,
    ) {
        let Some((i1, p1)) = self.drawing_world_price_at(x1, y1) else {
            return;
        };
        let Some((i2, p2)) = self.drawing_world_price_at(x2, y2) else {
            return;
        };
        let Some((i3, p3)) = self.drawing_world_price_at(x3, y3) else {
            return;
        };
        let pts = [
            Point {
                x: i1,
                y: p1 as f32,
            },
            Point {
                x: i2,
                y: p2 as f32,
            },
            Point {
                x: i3,
                y: p3 as f32,
            },
        ];
        let cmd = triangle_shape::add_command_from_points(&pts);
        let _ = execute_command(&mut self.drawings, cmd);
    }
}

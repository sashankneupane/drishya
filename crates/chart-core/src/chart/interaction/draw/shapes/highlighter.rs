use crate::drawings::commands::execute_command;
use crate::drawings::shape::highlighter as highlighter_shape;
use crate::drawings::types::StrokePoint;

use crate::chart::Chart;

impl Chart {
    pub fn add_highlight_stroke_from_world_points(&mut self, points: Vec<StrokePoint>) {
        if points.is_empty() {
            return;
        }
        let cmd = highlighter_shape::add_command_from_points(points);
        let _ = execute_command(&mut self.drawings, cmd);
    }
}

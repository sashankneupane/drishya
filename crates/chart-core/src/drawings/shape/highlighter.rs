use crate::drawings::shape::stroke;
use crate::drawings::{
    commands::DrawingCommand,
    types::{Drawing, DrawingStyle, HighlightStroke, StrokePoint, DEFAULT_DRAWING_LAYER},
};

pub fn from_points(points: Vec<StrokePoint>) -> HighlightStroke {
    let points = stroke::normalize_points(points);
    let points = stroke::simplify_points(points, 0.5);

    HighlightStroke {
        id: 0,
        points,
        layer_id: DEFAULT_DRAWING_LAYER.to_string(),
        group_id: None,
        style: DrawingStyle::default(),
    }
}

pub fn preview(points: Vec<StrokePoint>) -> Drawing {
    Drawing::HighlightStroke(from_points(points))
}

pub fn add_command_from_points(points: Vec<StrokePoint>) -> DrawingCommand {
    let points = stroke::normalize_points(points);
    let points = stroke::simplify_points(points, 0.5);
    DrawingCommand::AddHighlightStroke { points }
}

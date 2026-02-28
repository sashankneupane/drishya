use crate::drawings::shape::stroke;
use crate::drawings::{
    commands::DrawingCommand,
    types::{BrushStroke, Drawing, DrawingStyle, StrokePoint, DEFAULT_DRAWING_LAYER},
};

pub fn from_points(points: Vec<StrokePoint>) -> BrushStroke {
    let points = stroke::normalize_points(points);
    let points = stroke::simplify_points(points, 0.5); // Default tolerance

    BrushStroke {
        id: 0,
        points,
        layer_id: DEFAULT_DRAWING_LAYER.to_string(),
        group_id: None,
        style: DrawingStyle::default(),
    }
}

pub fn preview(points: Vec<StrokePoint>) -> Drawing {
    Drawing::BrushStroke(from_points(points))
}

pub fn add_command_from_points(points: Vec<StrokePoint>) -> DrawingCommand {
    let points = stroke::normalize_points(points);
    let points = stroke::simplify_points(points, 0.5);
    DrawingCommand::AddBrushStroke { points }
}

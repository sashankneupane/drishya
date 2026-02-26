use crate::drawings::{
    commands::DrawingCommand,
    types::{Drawing, Ellipse, DEFAULT_DRAWING_LAYER},
};
use crate::types::Point;

/// Build an Ellipse from 3 control points.
/// p1 + p2 define diameter 1 (first axis endpoints).
/// p3 defines the extent of the perpendicular (second) radius.
pub fn from_points(points: &[Point]) -> Ellipse {
    let zero = Point { x: 0.0, y: 0.0 };
    let p1 = points.get(0).cloned().unwrap_or(zero);
    let p2 = points.get(1).cloned().unwrap_or(zero);
    let p3 = points.get(2).cloned().unwrap_or(zero);
    Ellipse {
        id: 0,
        p1_index: p1.x,
        p1_price: p1.y as f64,
        p2_index: p2.x,
        p2_price: p2.y as f64,
        p3_index: p3.x,
        p3_price: p3.y as f64,
        layer_id: DEFAULT_DRAWING_LAYER.to_string(),
        group_id: None,
    }
}

pub fn preview(points: &[Point]) -> Drawing {
    Drawing::Ellipse(from_points(points))
}

pub fn add_command_from_points(points: &[Point]) -> DrawingCommand {
    let e = from_points(points);
    DrawingCommand::AddEllipse {
        p1_index: e.p1_index,
        p2_index: e.p2_index,
        p3_index: e.p3_index,
        p1_price: e.p1_price,
        p2_price: e.p2_price,
        p3_price: e.p3_price,
    }
}

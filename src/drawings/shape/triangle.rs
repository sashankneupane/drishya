use crate::drawings::{
    commands::DrawingCommand,
    types::{Drawing, DrawingStyle, Triangle, DEFAULT_DRAWING_LAYER},
};
use crate::types::Point;

pub fn from_points(points: &[Point]) -> Triangle {
    let zero = Point { x: 0.0, y: 0.0 };
    let p1 = points.get(0).cloned().unwrap_or(zero);
    let p2 = points.get(1).cloned().unwrap_or(zero);
    let p3 = points.get(2).cloned().unwrap_or(zero);

    Triangle {
        id: 0,
        p1_index: p1.x,
        p1_price: p1.y as f64,
        p2_index: p2.x,
        p2_price: p2.y as f64,
        p3_index: p3.x,
        p3_price: p3.y as f64,
        layer_id: DEFAULT_DRAWING_LAYER.to_string(),
        group_id: None,
        style: DrawingStyle::default(),
    }
}

pub fn preview(points: &[Point]) -> Drawing {
    Drawing::Triangle(from_points(points))
}

pub fn add_command_from_points(points: &[Point]) -> DrawingCommand {
    let item = from_points(points);
    DrawingCommand::AddTriangle {
        p1_index: item.p1_index,
        p2_index: item.p2_index,
        p3_index: item.p3_index,
        p1_price: item.p1_price,
        p2_price: item.p2_price,
        p3_price: item.p3_price,
    }
}

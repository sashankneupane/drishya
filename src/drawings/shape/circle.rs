use crate::drawings::{
    commands::DrawingCommand,
    types::{Circle, Drawing, DEFAULT_DRAWING_LAYER},
};

pub fn from_points(start_index: f32, start_price: f64, end_index: f32, end_price: f64) -> Circle {
    Circle {
        id: 0,
        center_index: start_index,
        center_price: start_price,
        radius_index: end_index,
        radius_price: end_price,
        layer_id: DEFAULT_DRAWING_LAYER.to_string(),
        group_id: None,
    }
}

pub fn preview(start_index: f32, start_price: f64, end_index: f32, end_price: f64) -> Drawing {
    Drawing::Circle(from_points(start_index, start_price, end_index, end_price))
}

pub fn add_command_from_points(
    start_index: f32,
    start_price: f64,
    end_index: f32,
    end_price: f64,
) -> DrawingCommand {
    DrawingCommand::AddCircle {
        center_index: start_index,
        radius_index: end_index,
        center_price: start_price,
        radius_price: end_price,
    }
}

use crate::drawings::{
    commands::DrawingCommand,
    types::{Drawing, Ray, DEFAULT_DRAWING_LAYER},
};

pub fn from_anchor(world_x: f32, price: f64, price_span: f64) -> Ray {
    Ray {
        id: 0,
        start_index: world_x - 8.0,
        end_index: world_x + 20.0,
        start_price: price,
        end_price: price + price_span * 0.04,
        layer_id: DEFAULT_DRAWING_LAYER.to_string(),
        group_id: None,
    }
}

pub fn from_points(start_index: f32, start_price: f64, end_index: f32, end_price: f64) -> Ray {
    if start_index <= end_index {
        Ray {
            id: 0,
            start_index,
            end_index,
            start_price,
            end_price,
            layer_id: DEFAULT_DRAWING_LAYER.to_string(),
            group_id: None,
        }
    } else {
        Ray {
            id: 0,
            start_index: end_index,
            end_index: start_index,
            start_price: end_price,
            end_price: start_price,
            layer_id: DEFAULT_DRAWING_LAYER.to_string(),
            group_id: None,
        }
    }
}

pub fn add_command_from_anchor(world_x: f32, price: f64, price_span: f64) -> DrawingCommand {
    let ray = from_anchor(world_x, price, price_span);
    DrawingCommand::AddRay {
        start_index: ray.start_index,
        end_index: ray.end_index,
        start_price: ray.start_price,
        end_price: ray.end_price,
    }
}

pub fn add_command_from_points(
    start_index: f32,
    start_price: f64,
    end_index: f32,
    end_price: f64,
) -> DrawingCommand {
    let ray = from_points(start_index, start_price, end_index, end_price);
    DrawingCommand::AddRay {
        start_index: ray.start_index,
        end_index: ray.end_index,
        start_price: ray.start_price,
        end_price: ray.end_price,
    }
}

pub fn preview(start_index: f32, start_price: f64, end_index: f32, end_price: f64) -> Drawing {
    Drawing::Ray(from_points(start_index, start_price, end_index, end_price))
}

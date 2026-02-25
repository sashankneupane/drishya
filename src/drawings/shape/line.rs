use crate::drawings::{
    commands::DrawingCommand,
    types::{HorizontalLine, VerticalLine, DEFAULT_DRAWING_LAYER},
};

pub fn horizontal_from_price(price: f64) -> HorizontalLine {
    HorizontalLine {
        id: 0,
        price,
        layer_id: DEFAULT_DRAWING_LAYER.to_string(),
        group_id: None,
    }
}

pub fn vertical_from_index(index: f32) -> VerticalLine {
    VerticalLine {
        id: 0,
        index,
        layer_id: DEFAULT_DRAWING_LAYER.to_string(),
        group_id: None,
    }
}

pub fn add_horizontal_command(price: f64) -> DrawingCommand {
    let line = horizontal_from_price(price);
    DrawingCommand::AddHorizontalLine { price: line.price }
}

pub fn add_vertical_command(index: f32) -> DrawingCommand {
    let line = vertical_from_index(index);
    DrawingCommand::AddVerticalLine { index: line.index }
}

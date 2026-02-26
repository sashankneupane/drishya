use crate::drawings::{
    commands::DrawingCommand,
    types::{DrawingStyle, Text, DEFAULT_DRAWING_LAYER},
};

pub fn text_from_position(index: f32, price: f64, text: String) -> Text {
    Text {
        id: 0,
        index,
        price,
        text: if text.is_empty() {
            "Text".to_string()
        } else {
            text
        },
        layer_id: DEFAULT_DRAWING_LAYER.to_string(),
        group_id: None,
        style: DrawingStyle::default(),
    }
}

pub fn add_text_command(index: f32, price: f64, text: String) -> DrawingCommand {
    DrawingCommand::AddText { index, price, text }
}

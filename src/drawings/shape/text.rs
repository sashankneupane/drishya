use crate::drawings::{
    commands::DrawingCommand,
    types::{DrawingStyle, Text, DEFAULT_DRAWING_LAYER},
};

pub fn text_from_position(index: f32, price: f64, text: String) -> Text {
    Text {
        id: 0,
        index,
        price,
        text: text.is_empty().then(|| "Text".to_string()).unwrap_or(text),
        layer_id: DEFAULT_DRAWING_LAYER.to_string(),
        group_id: None,
        style: DrawingStyle::default(),
    }
}

pub fn add_text_command(index: f32, price: f64, text: String) -> DrawingCommand {
    DrawingCommand::AddText {
        index,
        price,
        text,
    }
}

use crate::chart::Chart;
use crate::drawings::commands::{execute_command, DrawingCommand};

impl Chart {
    pub fn clear_drawings(&mut self) {
        let _ = execute_command(&mut self.drawings, DrawingCommand::ClearAll);
    }

    pub fn remove_drawing(&mut self, id: u64) -> bool {
        match execute_command(&mut self.drawings, DrawingCommand::RemoveById { id }) {
            crate::drawings::commands::DrawingCommandResult::Removed { removed } => removed,
            _ => false,
        }
    }

    pub fn set_drawing_layer(&mut self, drawing_id: u64, layer_id: &str) -> bool {
        self.drawings.set_drawing_layer(drawing_id, layer_id)
    }

    pub fn set_drawing_group(&mut self, drawing_id: u64, group_id: Option<&str>) -> bool {
        self.drawings.set_drawing_group(drawing_id, group_id)
    }

    pub fn set_drawing_visible(&mut self, drawing_id: u64, visible: bool) -> bool {
        self.drawings.set_drawing_visible(drawing_id, visible)
    }

    pub fn is_drawing_visible(&self, drawing_id: u64) -> bool {
        self.drawings.is_drawing_visible(drawing_id)
    }

    pub fn set_drawing_layer_visible(&mut self, layer_id: &str, visible: bool) {
        self.drawings.set_layer_visible(layer_id, visible);
    }

    pub fn set_drawing_group_visible(&mut self, group_id: &str, visible: bool) {
        self.drawings.set_group_visible(group_id, visible);
    }

    pub fn set_drawing_layer_order<I>(&mut self, layers: I)
    where
        I: IntoIterator<Item = String>,
    {
        self.drawings.set_layer_order(layers);
    }

    pub fn drawing_layer_order(&self) -> Vec<String> {
        self.drawings.layer_order().to_vec()
    }
}

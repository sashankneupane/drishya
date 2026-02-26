use crate::chart::Chart;
use crate::drawings::commands::{execute_command, DrawingCommand};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct DrawingState {
    pub id: u64,
    pub kind: String,
    pub layer_id: String,
    pub group_id: Option<String>,
    pub visible: bool,
}

impl Chart {
    pub fn clear_drawings(&mut self) {
        let _ = execute_command(&mut self.drawings, DrawingCommand::ClearAll);
        self.selected_drawing_id = None;
    }

    pub fn remove_drawing(&mut self, id: u64) -> bool {
        match execute_command(&mut self.drawings, DrawingCommand::RemoveById { id }) {
            crate::drawings::commands::DrawingCommandResult::Removed { removed } => {
                if removed && self.selected_drawing_id == Some(id) {
                    self.selected_drawing_id = None;
                }
                removed
            }
            _ => false,
        }
    }

    pub fn select_drawing_at(&mut self, x_pixels: f32, y_pixels: f32) -> Option<u64> {
        let hit = self.hit_test_drawings(
            x_pixels,
            y_pixels,
            crate::drawings::hit_test::InteractionMode::Select,
        );
        self.selected_drawing_id = hit.map(|h| h.primitive_id);
        self.selected_drawing_id
    }

    pub fn selected_drawing_id(&self) -> Option<u64> {
        self.selected_drawing_id
    }

    pub fn clear_selected_drawing(&mut self) {
        self.selected_drawing_id = None;
    }

    pub fn delete_selected_drawing(&mut self) -> bool {
        let Some(id) = self.selected_drawing_id else {
            return false;
        };
        let removed = self.remove_drawing(id);
        if removed {
            self.selected_drawing_id = None;
        }
        removed
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

    pub(crate) fn drawing_state(&self) -> Vec<DrawingState> {
        self.drawings
            .items()
            .iter()
            .map(|drawing| DrawingState {
                id: drawing.id(),
                kind: drawing_kind(drawing).to_string(),
                layer_id: drawing.layer_id().to_string(),
                group_id: drawing.group_id().map(ToString::to_string),
                visible: self.drawings.is_drawing_visible(drawing.id()),
            })
            .collect()
    }
}

fn drawing_kind(drawing: &crate::drawings::types::Drawing) -> &'static str {
    match drawing {
        crate::drawings::types::Drawing::HorizontalLine(_) => "hline",
        crate::drawings::types::Drawing::VerticalLine(_) => "vline",
        crate::drawings::types::Drawing::Ray(_) => "ray",
        crate::drawings::types::Drawing::Rectangle(_) => "rectangle",
        crate::drawings::types::Drawing::PriceRange(_) => "price_range",
        crate::drawings::types::Drawing::TimeRange(_) => "time_range",
        crate::drawings::types::Drawing::DateTimeRange(_) => "date_time_range",
        crate::drawings::types::Drawing::LongPosition(_) => "long",
        crate::drawings::types::Drawing::ShortPosition(_) => "short",
        crate::drawings::types::Drawing::FibRetracement(_) => "fib",
        crate::drawings::types::Drawing::Triangle(_) => "triangle",
        crate::drawings::types::Drawing::Circle(_) => "circle",
        crate::drawings::types::Drawing::Ellipse(_) => "ellipse",
    }
}

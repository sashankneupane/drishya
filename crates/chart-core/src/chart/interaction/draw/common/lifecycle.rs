use crate::chart::Chart;
use crate::drawings::commands::{execute_command, DrawingCommand};
use crate::drawings::types::{DrawingStyle, StrokeType};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DrawingState {
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
        if self.selected_drawing_id.is_some() {
            self.selected_series_id = None;
            self.selected_event_id = None;
        }
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

    pub fn set_drawing_stroke_color(&mut self, drawing_id: u64, color: Option<&str>) -> bool {
        let c = color.map(|s| s.to_string());
        execute_command(
            &mut self.drawings,
            DrawingCommand::SetDrawingStrokeColor {
                id: drawing_id,
                color: c,
            },
        );
        self.drawings.drawing(drawing_id).is_some()
    }

    pub fn set_drawing_fill_color(&mut self, drawing_id: u64, color: Option<&str>) -> bool {
        let c = color.map(|s| s.to_string());
        execute_command(
            &mut self.drawings,
            DrawingCommand::SetDrawingFillColor {
                id: drawing_id,
                color: c,
            },
        );
        self.drawings.drawing(drawing_id).is_some()
    }

    pub fn set_drawing_locked(&mut self, drawing_id: u64, locked: bool) -> bool {
        execute_command(
            &mut self.drawings,
            DrawingCommand::SetDrawingLocked {
                id: drawing_id,
                locked,
            },
        );
        self.drawings.drawing(drawing_id).is_some()
    }

    pub fn set_drawing_fill_opacity(&mut self, drawing_id: u64, opacity: Option<f32>) -> bool {
        execute_command(
            &mut self.drawings,
            DrawingCommand::SetDrawingFillOpacity {
                id: drawing_id,
                opacity,
            },
        );
        self.drawings.drawing(drawing_id).is_some()
    }

    pub fn set_drawing_stroke_width(&mut self, drawing_id: u64, width: Option<f32>) -> bool {
        execute_command(
            &mut self.drawings,
            DrawingCommand::SetDrawingStrokeWidth {
                id: drawing_id,
                width,
            },
        );
        self.drawings.drawing(drawing_id).is_some()
    }

    pub fn set_drawing_stroke_type(
        &mut self,
        drawing_id: u64,
        stroke_type: Option<StrokeType>,
    ) -> bool {
        execute_command(
            &mut self.drawings,
            DrawingCommand::SetDrawingStrokeType {
                id: drawing_id,
                stroke_type,
            },
        );
        self.drawings.drawing(drawing_id).is_some()
    }

    pub fn set_drawing_font_size(&mut self, drawing_id: u64, font_size: Option<f32>) -> bool {
        execute_command(
            &mut self.drawings,
            DrawingCommand::SetDrawingFontSize {
                id: drawing_id,
                font_size,
            },
        );
        self.drawings.drawing(drawing_id).is_some()
    }

    pub fn set_drawing_text_content(&mut self, drawing_id: u64, text: &str) -> bool {
        execute_command(
            &mut self.drawings,
            DrawingCommand::SetDrawingTextContent {
                id: drawing_id,
                text: text.to_string(),
            },
        );
        self.drawings.drawing(drawing_id).is_some()
    }

    pub fn drawing_config(&self, drawing_id: u64) -> Option<DrawingStyle> {
        self.drawings.drawing(drawing_id).map(|d| d.style().clone())
    }

    pub fn drawing_config_with_capabilities(
        &self,
        drawing_id: u64,
    ) -> Option<(DrawingStyle, bool, Option<String>)> {
        self.drawings.drawing(drawing_id).map(|d| {
            let text_content = match d {
                crate::drawings::types::Drawing::Text(t) => Some(t.text.clone()),
                _ => None,
            };
            (d.style().clone(), d.supports_fill(), text_content)
        })
    }

    pub fn is_drawing_locked(&self, drawing_id: u64) -> bool {
        self.drawings
            .drawing(drawing_id)
            .map(|d| d.style().locked)
            .unwrap_or(false)
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

    pub fn create_drawing_layer(&mut self, id: String, name: String) {
        let _ = execute_command(&mut self.drawings, DrawingCommand::CreateLayer { id, name });
    }

    pub fn delete_drawing_layer(&mut self, id: String) {
        let _ = execute_command(&mut self.drawings, DrawingCommand::DeleteLayer { id });
    }

    pub fn update_drawing_layer(
        &mut self,
        id: String,
        name: Option<String>,
        visible: Option<bool>,
        locked: Option<bool>,
    ) {
        let _ = execute_command(
            &mut self.drawings,
            DrawingCommand::UpdateLayer {
                id,
                name,
                visible,
                locked,
            },
        );
    }

    pub fn create_drawing_group(
        &mut self,
        id: String,
        name: String,
        layer_id: String,
        parent_group_id: Option<String>,
    ) {
        let _ = execute_command(
            &mut self.drawings,
            DrawingCommand::CreateGroup {
                id,
                name,
                layer_id,
                parent_group_id,
            },
        );
    }

    pub fn delete_drawing_group(&mut self, id: String) {
        let _ = execute_command(&mut self.drawings, DrawingCommand::DeleteGroup { id });
    }

    pub fn update_drawing_group(
        &mut self,
        id: String,
        name: Option<String>,
        visible: Option<bool>,
        locked: Option<bool>,
    ) {
        let _ = execute_command(
            &mut self.drawings,
            DrawingCommand::UpdateGroup {
                id,
                name,
                visible,
                locked,
            },
        );
    }

    pub fn move_drawings_to_group(&mut self, ids: Vec<u64>, group_id: Option<String>) {
        let _ = execute_command(
            &mut self.drawings,
            DrawingCommand::MoveDrawingsToGroup { ids, group_id },
        );
    }

    pub fn move_drawings_to_layer(&mut self, ids: Vec<u64>, layer_id: String) {
        let _ = execute_command(
            &mut self.drawings,
            DrawingCommand::MoveDrawingsToLayer { ids, layer_id },
        );
    }

    pub fn delete_drawings(&mut self, ids: Vec<u64>) {
        let _ = execute_command(&mut self.drawings, DrawingCommand::DeleteDrawings { ids });
    }

    pub fn drawing_state(&self) -> Vec<DrawingState> {
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
    use crate::drawings::types::Drawing;
    match drawing {
        Drawing::HorizontalLine(_) => "hline",
        Drawing::VerticalLine(_) => "vline",
        Drawing::Ray(_) => "ray",
        Drawing::Rectangle(_) => "rectangle",
        Drawing::PriceRange(_) => "price_range",
        Drawing::TimeRange(_) => "time_range",
        Drawing::DateTimeRange(_) => "date_time_range",
        Drawing::LongPosition(_) => "long",
        Drawing::ShortPosition(_) => "short",
        Drawing::FibRetracement(_) => "fib",
        Drawing::Triangle(_) => "triangle",
        Drawing::Circle(_) => "circle",
        Drawing::Ellipse(_) => "ellipse",
        Drawing::Text(_) => "text",
        Drawing::BrushStroke(_) => "brush",
        Drawing::HighlightStroke(_) => "highlighter",
    }
}

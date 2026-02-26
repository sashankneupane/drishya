//! Command layer placeholder for drawing actions.
//!
//! Why this file exists now:
//! - It gives us a dedicated seam for undo/redo-friendly operations
//!   (`AddLine`, `MoveLine`, `DeleteDrawing`, ...).
//! - It prevents UI event code from mutating `DrawingStore` directly once
//!   interactions become richer (selection, drag handles, keyboard edits).
//!
//! Current state:
//! - Chart interactions now use this command surface instead of mutating the
//!   store directly.
//! - The API is intentionally small but structured to support undo/redo later.

use crate::drawings::{
    store::DrawingStore,
    types::{DrawingId, StrokeType},
};

#[derive(Debug, Clone)]
pub enum DrawingCommand {
    AddHorizontalLine {
        price: f64,
    },
    AddVerticalLine {
        index: f32,
    },
    AddRay {
        start_index: f32,
        end_index: f32,
        start_price: f64,
        end_price: f64,
    },
    AddRectangle {
        start_index: f32,
        end_index: f32,
        top_price: f64,
        bottom_price: f64,
    },
    AddPriceRange {
        start_index: f32,
        end_index: f32,
        top_price: f64,
        bottom_price: f64,
    },
    AddTimeRange {
        start_index: f32,
        end_index: f32,
        top_price: f64,
        bottom_price: f64,
    },
    AddDateTimeRange {
        start_index: f32,
        end_index: f32,
        top_price: f64,
        bottom_price: f64,
    },
    AddLongPosition {
        start_index: f32,
        end_index: f32,
        entry_price: f64,
        stop_price: f64,
        target_price: f64,
    },
    AddShortPosition {
        start_index: f32,
        end_index: f32,
        entry_price: f64,
        stop_price: f64,
        target_price: f64,
    },
    AddFibRetracement {
        start_index: f32,
        end_index: f32,
        start_price: f64,
        end_price: f64,
    },
    AddCircle {
        center_index: f32,
        radius_index: f32,
        center_price: f64,
        radius_price: f64,
    },
    AddTriangle {
        p1_index: f32,
        p2_index: f32,
        p3_index: f32,
        p1_price: f64,
        p2_price: f64,
        p3_price: f64,
    },
    AddEllipse {
        p1_index: f32,
        p2_index: f32,
        p3_index: f32,
        p1_price: f64,
        p2_price: f64,
        p3_price: f64,
    },
    AddText {
        index: f32,
        price: f64,
        text: String,
    },
    RemoveById {
        id: DrawingId,
    },
    ClearAll,
    SetDrawingStrokeColor {
        id: DrawingId,
        color: Option<String>,
    },
    SetDrawingFillColor {
        id: DrawingId,
        color: Option<String>,
    },
    SetDrawingLocked {
        id: DrawingId,
        locked: bool,
    },
    SetDrawingFillOpacity {
        id: DrawingId,
        opacity: Option<f32>,
    },
    SetDrawingStrokeWidth {
        id: DrawingId,
        width: Option<f32>,
    },
    SetDrawingStrokeType {
        id: DrawingId,
        stroke_type: Option<StrokeType>,
    },
    SetDrawingFontSize {
        id: DrawingId,
        font_size: Option<f32>,
    },
    SetDrawingTextContent {
        id: DrawingId,
        text: String,
    },
}

#[derive(Debug, Clone, Copy)]
pub enum DrawingCommandResult {
    Added { id: DrawingId },
    Removed { removed: bool },
    Cleared,
    Updated,
}

/// Applies a drawing command to the target store.
///
/// Centralizing execution keeps command semantics in one place and avoids
/// spreading mutation rules across UI/controller code.
pub fn execute_command(store: &mut DrawingStore, cmd: DrawingCommand) -> DrawingCommandResult {
    match cmd {
        DrawingCommand::AddHorizontalLine { price } => {
            let id = store.add_horizontal_line(price);
            DrawingCommandResult::Added { id }
        }
        DrawingCommand::AddVerticalLine { index } => {
            let id = store.add_vertical_line(index);
            DrawingCommandResult::Added { id }
        }
        DrawingCommand::AddRay {
            start_index,
            end_index,
            start_price,
            end_price,
        } => {
            let id = store.add_ray(start_index, end_index, start_price, end_price);
            DrawingCommandResult::Added { id }
        }
        DrawingCommand::AddRectangle {
            start_index,
            end_index,
            top_price,
            bottom_price,
        } => {
            let id = store.add_rectangle(start_index, end_index, top_price, bottom_price);
            DrawingCommandResult::Added { id }
        }
        DrawingCommand::AddPriceRange {
            start_index,
            end_index,
            top_price,
            bottom_price,
        } => {
            let id = store.add_price_range(start_index, end_index, top_price, bottom_price);
            DrawingCommandResult::Added { id }
        }
        DrawingCommand::AddTimeRange {
            start_index,
            end_index,
            top_price,
            bottom_price,
        } => {
            let id = store.add_time_range(start_index, end_index, top_price, bottom_price);
            DrawingCommandResult::Added { id }
        }
        DrawingCommand::AddDateTimeRange {
            start_index,
            end_index,
            top_price,
            bottom_price,
        } => {
            let id = store.add_date_time_range(start_index, end_index, top_price, bottom_price);
            DrawingCommandResult::Added { id }
        }
        DrawingCommand::AddLongPosition {
            start_index,
            end_index,
            entry_price,
            stop_price,
            target_price,
        } => {
            let id = store.add_long_position(
                start_index,
                end_index,
                entry_price,
                stop_price,
                target_price,
            );
            DrawingCommandResult::Added { id }
        }
        DrawingCommand::AddShortPosition {
            start_index,
            end_index,
            entry_price,
            stop_price,
            target_price,
        } => {
            let id = store.add_short_position(
                start_index,
                end_index,
                entry_price,
                stop_price,
                target_price,
            );
            DrawingCommandResult::Added { id }
        }
        DrawingCommand::AddFibRetracement {
            start_index,
            end_index,
            start_price,
            end_price,
        } => {
            let id = store.add_fib_retracement(start_index, end_index, start_price, end_price);
            DrawingCommandResult::Added { id }
        }
        DrawingCommand::AddCircle {
            center_index,
            radius_index,
            center_price,
            radius_price,
        } => {
            let id = store.add_circle(center_index, radius_index, center_price, radius_price);
            DrawingCommandResult::Added { id }
        }
        DrawingCommand::AddTriangle {
            p1_index,
            p2_index,
            p3_index,
            p1_price,
            p2_price,
            p3_price,
        } => {
            let id = store.add_triangle(p1_index, p2_index, p3_index, p1_price, p2_price, p3_price);
            DrawingCommandResult::Added { id }
        }
        DrawingCommand::AddEllipse {
            p1_index,
            p2_index,
            p3_index,
            p1_price,
            p2_price,
            p3_price,
        } => {
            let id = store.add_ellipse(p1_index, p2_index, p3_index, p1_price, p2_price, p3_price);
            DrawingCommandResult::Added { id }
        }
        DrawingCommand::AddText {
            index,
            price,
            text,
        } => {
            let id = store.add_text(index, price, text);
            DrawingCommandResult::Added { id }
        }
        DrawingCommand::RemoveById { id } => {
            let removed = store.remove(id);
            DrawingCommandResult::Removed { removed }
        }
        DrawingCommand::ClearAll => {
            store.clear();
            DrawingCommandResult::Cleared
        }
        DrawingCommand::SetDrawingStrokeColor { id, color } => {
            if let Some(d) = store.drawing_mut(id) {
                d.style_mut().stroke_color = color.filter(|s| !s.trim().is_empty());
            }
            DrawingCommandResult::Updated
        }
        DrawingCommand::SetDrawingFillColor { id, color } => {
            if let Some(d) = store.drawing_mut(id) {
                if d.supports_fill() {
                    d.style_mut().fill_color = color.filter(|s| !s.trim().is_empty());
                }
            }
            DrawingCommandResult::Updated
        }
        DrawingCommand::SetDrawingLocked { id, locked } => {
            if let Some(d) = store.drawing_mut(id) {
                d.style_mut().locked = locked;
            }
            DrawingCommandResult::Updated
        }
        DrawingCommand::SetDrawingFillOpacity { id, opacity } => {
            if let Some(d) = store.drawing_mut(id) {
                d.style_mut().fill_opacity = opacity;
            }
            DrawingCommandResult::Updated
        }
        DrawingCommand::SetDrawingStrokeWidth { id, width } => {
            if let Some(d) = store.drawing_mut(id) {
                d.style_mut().stroke_width = width;
            }
            DrawingCommandResult::Updated
        }
        DrawingCommand::SetDrawingStrokeType { id, stroke_type } => {
            if let Some(d) = store.drawing_mut(id) {
                d.style_mut().stroke_type = stroke_type;
            }
            DrawingCommandResult::Updated
        }
        DrawingCommand::SetDrawingFontSize { id, font_size } => {
            if let Some(d) = store.drawing_mut(id) {
                d.style_mut().font_size = font_size;
            }
            DrawingCommandResult::Updated
        }
        DrawingCommand::SetDrawingTextContent { id, text } => {
            if let Some(d) = store.drawing_mut(id) {
                if let crate::drawings::types::Drawing::Text(t) = d {
                    t.text = text;
                }
            }
            DrawingCommandResult::Updated
        }
    }
}

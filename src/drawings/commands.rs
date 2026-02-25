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

use crate::drawings::{store::DrawingStore, types::DrawingId};

#[derive(Debug, Clone, Copy)]
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
    RemoveById {
        id: DrawingId,
    },
    ClearAll,
}

#[derive(Debug, Clone, Copy)]
pub enum DrawingCommandResult {
    Added { id: DrawingId },
    Removed { removed: bool },
    Cleared,
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
        DrawingCommand::RemoveById { id } => {
            let removed = store.remove(id);
            DrawingCommandResult::Removed { removed }
        }
        DrawingCommand::ClearAll => {
            store.clear();
            DrawingCommandResult::Cleared
        }
    }
}

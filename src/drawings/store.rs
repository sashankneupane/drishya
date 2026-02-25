//! In-memory storage for user drawings.
//!
//! This store is intentionally minimal and deterministic: append, remove,
//! iterate. Higher-level semantics live in the command layer.

use crate::drawings::types::*;

#[derive(Debug, Default)]
pub struct DrawingStore {
    next_id: DrawingId,
    items: Vec<Drawing>,
}

impl DrawingStore {
    pub fn new() -> Self {
        Self {
            next_id: 1,
            items: Vec::new(),
        }
    }

    fn alloc_id(&mut self) -> DrawingId {
        // Monotonic IDs keep references stable even when items are deleted.
        let id = self.next_id;
        self.next_id += 1;
        id
    }

    pub fn add_horizontal_line(&mut self, price: f64) -> DrawingId {
        let id = self.alloc_id();
        self.items.push(Drawing::HorizontalLine(HorizontalLine { id, price }));
        id
    }

    pub fn add_vertical_line(&mut self, index: f32) -> DrawingId {
        let id = self.alloc_id();
        self.items.push(Drawing::VerticalLine(VerticalLine { id, index }));
        id
    }

    pub fn items(&self) -> &[Drawing] {
        &self.items
    }

    pub fn remove(&mut self, id: DrawingId) -> bool {
        let before = self.items.len();
        self.items.retain(|d| match d {
            Drawing::HorizontalLine(x) => x.id != id,
            Drawing::VerticalLine(x) => x.id != id,
        });
        self.items.len() != before
    }

    pub fn clear(&mut self) {
        self.items.clear();
    }
}

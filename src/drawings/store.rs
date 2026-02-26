//! In-memory storage for user drawings.
//!
//! This store is intentionally minimal and deterministic: append, remove,
//! iterate. Higher-level semantics live in the command layer.

use crate::drawings::types::{DrawingStyle, *};
use std::collections::HashSet;

#[derive(Debug, Default)]
pub struct DrawingStore {
    next_id: DrawingId,
    items: Vec<Drawing>,
    layer_order: Vec<DrawingLayerId>,
    hidden_layers: HashSet<DrawingLayerId>,
    hidden_groups: HashSet<DrawingGroupId>,
    hidden_drawings: HashSet<DrawingId>,
}

impl DrawingStore {
    pub fn new() -> Self {
        Self {
            next_id: 1,
            items: Vec::new(),
            layer_order: vec![DEFAULT_DRAWING_LAYER.to_string()],
            hidden_layers: HashSet::new(),
            hidden_groups: HashSet::new(),
            hidden_drawings: HashSet::new(),
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
        self.items.push(Drawing::HorizontalLine(HorizontalLine {
            id,
            price,
            layer_id: DEFAULT_DRAWING_LAYER.to_string(),
            group_id: None,
            style: DrawingStyle::default(),
        }));
        id
    }

    pub fn add_vertical_line(&mut self, index: f32) -> DrawingId {
        let id = self.alloc_id();
        self.items.push(Drawing::VerticalLine(VerticalLine {
            id,
            index,
            layer_id: DEFAULT_DRAWING_LAYER.to_string(),
            group_id: None,
            style: DrawingStyle::default(),
        }));
        id
    }

    pub fn add_ray(
        &mut self,
        start_index: f32,
        end_index: f32,
        start_price: f64,
        end_price: f64,
    ) -> DrawingId {
        let id = self.alloc_id();
        let (start_index, end_index, start_price, end_price) = if start_index <= end_index {
            (start_index, end_index, start_price, end_price)
        } else {
            (end_index, start_index, end_price, start_price)
        };

        self.items.push(Drawing::Ray(Ray {
            id,
            start_index,
            end_index,
            start_price,
            end_price,
            layer_id: DEFAULT_DRAWING_LAYER.to_string(),
            group_id: None,
            style: DrawingStyle::default(),
        }));
        id
    }

    pub fn add_rectangle(
        &mut self,
        start_index: f32,
        end_index: f32,
        top_price: f64,
        bottom_price: f64,
    ) -> DrawingId {
        let id = self.alloc_id();
        let (start_index, end_index) = if start_index <= end_index {
            (start_index, end_index)
        } else {
            (end_index, start_index)
        };
        let (top_price, bottom_price) = if top_price >= bottom_price {
            (top_price, bottom_price)
        } else {
            (bottom_price, top_price)
        };

        self.items.push(Drawing::Rectangle(Rectangle {
            id,
            start_index,
            end_index,
            top_price,
            bottom_price,
            layer_id: DEFAULT_DRAWING_LAYER.to_string(),
            group_id: None,
            style: DrawingStyle::default(),
        }));
        id
    }

    pub fn add_price_range(
        &mut self,
        start_index: f32,
        end_index: f32,
        top_price: f64,
        bottom_price: f64,
    ) -> DrawingId {
        let id = self.alloc_id();
        let (start_index, end_index) = if start_index <= end_index {
            (start_index, end_index)
        } else {
            (end_index, start_index)
        };
        let (top_price, bottom_price) = if top_price >= bottom_price {
            (top_price, bottom_price)
        } else {
            (bottom_price, top_price)
        };

        self.items.push(Drawing::PriceRange(PriceRange {
            id,
            start_index,
            end_index,
            top_price,
            bottom_price,
            layer_id: DEFAULT_DRAWING_LAYER.to_string(),
            group_id: None,
            style: DrawingStyle::default(),
        }));
        id
    }

    pub fn add_time_range(
        &mut self,
        start_index: f32,
        end_index: f32,
        top_price: f64,
        bottom_price: f64,
    ) -> DrawingId {
        let id = self.alloc_id();
        let (start_index, end_index) = if start_index <= end_index {
            (start_index, end_index)
        } else {
            (end_index, start_index)
        };
        let (top_price, bottom_price) = if top_price >= bottom_price {
            (top_price, bottom_price)
        } else {
            (bottom_price, top_price)
        };

        self.items.push(Drawing::TimeRange(TimeRange {
            id,
            start_index,
            end_index,
            top_price,
            bottom_price,
            layer_id: DEFAULT_DRAWING_LAYER.to_string(),
            group_id: None,
            style: DrawingStyle::default(),
        }));
        id
    }

    pub fn add_date_time_range(
        &mut self,
        start_index: f32,
        end_index: f32,
        top_price: f64,
        bottom_price: f64,
    ) -> DrawingId {
        let id = self.alloc_id();
        let (start_index, end_index) = if start_index <= end_index {
            (start_index, end_index)
        } else {
            (end_index, start_index)
        };
        let (top_price, bottom_price) = if top_price >= bottom_price {
            (top_price, bottom_price)
        } else {
            (bottom_price, top_price)
        };

        self.items.push(Drawing::DateTimeRange(DateTimeRange {
            id,
            start_index,
            end_index,
            top_price,
            bottom_price,
            layer_id: DEFAULT_DRAWING_LAYER.to_string(),
            group_id: None,
            style: DrawingStyle::default(),
        }));
        id
    }

    pub fn add_long_position(
        &mut self,
        start_index: f32,
        end_index: f32,
        entry_price: f64,
        stop_price: f64,
        target_price: f64,
    ) -> DrawingId {
        let id = self.alloc_id();
        let (start_index, end_index) = if start_index <= end_index {
            (start_index, end_index)
        } else {
            (end_index, start_index)
        };
        let stop_price = stop_price.min(entry_price);
        let target_price = target_price.max(entry_price);

        self.items.push(Drawing::LongPosition(LongPosition {
            id,
            start_index,
            end_index,
            entry_price,
            stop_price,
            target_price,
            layer_id: DEFAULT_DRAWING_LAYER.to_string(),
            group_id: None,
            style: DrawingStyle::default(),
        }));
        id
    }

    pub fn add_short_position(
        &mut self,
        start_index: f32,
        end_index: f32,
        entry_price: f64,
        stop_price: f64,
        target_price: f64,
    ) -> DrawingId {
        let id = self.alloc_id();
        let (start_index, end_index) = if start_index <= end_index {
            (start_index, end_index)
        } else {
            (end_index, start_index)
        };
        let stop_price = stop_price.max(entry_price);
        let target_price = target_price.min(entry_price);

        self.items.push(Drawing::ShortPosition(ShortPosition {
            id,
            start_index,
            end_index,
            entry_price,
            stop_price,
            target_price,
            layer_id: DEFAULT_DRAWING_LAYER.to_string(),
            group_id: None,
            style: DrawingStyle::default(),
        }));
        id
    }

    pub fn add_fib_retracement(
        &mut self,
        start_index: f32,
        end_index: f32,
        start_price: f64,
        end_price: f64,
    ) -> DrawingId {
        let id = self.alloc_id();
        self.items.push(Drawing::FibRetracement(FibRetracement {
            id,
            start_index,
            end_index,
            start_price,
            end_price,
            layer_id: DEFAULT_DRAWING_LAYER.to_string(),
            group_id: None,
            style: DrawingStyle::default(),
        }));
        id
    }

    pub fn add_circle(
        &mut self,
        center_index: f32,
        radius_index: f32,
        center_price: f64,
        radius_price: f64,
    ) -> DrawingId {
        let id = self.alloc_id();
        self.items.push(Drawing::Circle(Circle {
            id,
            center_index,
            center_price,
            radius_index,
            radius_price,
            layer_id: DEFAULT_DRAWING_LAYER.to_string(),
            group_id: None,
            style: DrawingStyle::default(),
        }));
        id
    }

    pub fn add_triangle(
        &mut self,
        p1_index: f32,
        p2_index: f32,
        p3_index: f32,
        p1_price: f64,
        p2_price: f64,
        p3_price: f64,
    ) -> DrawingId {
        let id = self.alloc_id();
        self.items.push(Drawing::Triangle(Triangle {
            id,
            p1_index,
            p1_price,
            p2_index,
            p2_price,
            p3_index,
            p3_price,
            layer_id: DEFAULT_DRAWING_LAYER.to_string(),
            group_id: None,
            style: DrawingStyle::default(),
        }));
        id
    }

    pub fn add_ellipse(
        &mut self,
        p1_index: f32,
        p2_index: f32,
        p3_index: f32,
        p1_price: f64,
        p2_price: f64,
        p3_price: f64,
    ) -> DrawingId {
        let id = self.alloc_id();
        self.items.push(Drawing::Ellipse(Ellipse {
            id,
            p1_index,
            p1_price,
            p2_index,
            p2_price,
            p3_index,
            p3_price,
            layer_id: DEFAULT_DRAWING_LAYER.to_string(),
            group_id: None,
            style: DrawingStyle::default(),
        }));
        id
    }

    pub fn add_text(&mut self, index: f32, price: f64, text: String) -> DrawingId {
        let id = self.alloc_id();
        self.items.push(Drawing::Text(Text {
            id,
            index,
            price,
            text: text.is_empty().then(|| "Text".to_string()).unwrap_or(text),
            layer_id: DEFAULT_DRAWING_LAYER.to_string(),
            group_id: None,
            style: DrawingStyle::default(),
        }));
        id
    }

    pub fn items(&self) -> &[Drawing] {
        &self.items
    }

    pub fn drawing(&self, id: DrawingId) -> Option<&Drawing> {
        self.items.iter().find(|item| item.id() == id)
    }

    pub fn drawing_mut(&mut self, id: DrawingId) -> Option<&mut Drawing> {
        self.items.iter_mut().find(|item| item.id() == id)
    }

    pub fn remove(&mut self, id: DrawingId) -> bool {
        let before = self.items.len();
        self.items.retain(|item| item.id() != id);
        self.items.len() != before
    }

    pub fn clear(&mut self) {
        self.items.clear();
    }

    pub fn ensure_layer(&mut self, layer_id: &str) {
        if layer_id.trim().is_empty() {
            return;
        }
        if !self.layer_order.iter().any(|item| item == layer_id) {
            self.layer_order.push(layer_id.to_string());
        }
    }

    pub fn set_layer_order<I>(&mut self, ordered_layers: I)
    where
        I: IntoIterator<Item = String>,
    {
        let mut next = Vec::new();
        for layer in ordered_layers {
            if layer.trim().is_empty() || next.iter().any(|v| v == &layer) {
                continue;
            }
            next.push(layer);
        }

        if !next.iter().any(|v| v == DEFAULT_DRAWING_LAYER) {
            next.push(DEFAULT_DRAWING_LAYER.to_string());
        }

        for item in &self.items {
            if !next.iter().any(|v| v == item.layer_id()) {
                next.push(item.layer_id().to_string());
            }
        }

        self.layer_order = next;
    }

    pub fn layer_order(&self) -> &[DrawingLayerId] {
        &self.layer_order
    }

    pub fn set_layer_visible(&mut self, layer_id: &str, visible: bool) {
        self.ensure_layer(layer_id);
        if visible {
            self.hidden_layers.remove(layer_id);
        } else {
            self.hidden_layers.insert(layer_id.to_string());
        }
    }

    pub fn set_group_visible(&mut self, group_id: &str, visible: bool) {
        if group_id.trim().is_empty() {
            return;
        }

        if visible {
            self.hidden_groups.remove(group_id);
        } else {
            self.hidden_groups.insert(group_id.to_string());
        }
    }

    pub fn set_drawing_layer(&mut self, id: DrawingId, layer_id: &str) -> bool {
        if layer_id.trim().is_empty() {
            return false;
        }

        self.ensure_layer(layer_id);
        if let Some(item) = self.items.iter_mut().find(|item| item.id() == id) {
            item.set_layer_id(layer_id);
            true
        } else {
            false
        }
    }

    pub fn set_drawing_group(&mut self, id: DrawingId, group_id: Option<&str>) -> bool {
        if let Some(item) = self.items.iter_mut().find(|item| item.id() == id) {
            item.set_group_id(group_id.filter(|v| !v.trim().is_empty()));
            true
        } else {
            false
        }
    }

    pub fn set_drawing_visible(&mut self, id: DrawingId, visible: bool) -> bool {
        if self.items.iter().any(|item| item.id() == id) {
            if visible {
                self.hidden_drawings.remove(&id);
            } else {
                self.hidden_drawings.insert(id);
            }
            true
        } else {
            false
        }
    }

    pub fn is_drawing_visible(&self, id: DrawingId) -> bool {
        !self.hidden_drawings.contains(&id)
    }

    pub fn visible_items_in_paint_order(&self) -> Vec<&Drawing> {
        let mut out = Vec::new();

        for layer in &self.layer_order {
            if self.hidden_layers.contains(layer) {
                continue;
            }

            for item in &self.items {
                if item.layer_id() != layer {
                    continue;
                }

                if let Some(group_id) = item.group_id() {
                    if self.hidden_groups.contains(group_id) {
                        continue;
                    }
                }

                if self.hidden_drawings.contains(&item.id()) {
                    continue;
                }

                out.push(item);
            }
        }

        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn layer_visibility_filters_items() {
        let mut store = DrawingStore::new();
        let a = store.add_horizontal_line(100.0);
        let b = store.add_vertical_line(4.0);

        assert!(store.set_drawing_layer(a, "a"));
        assert!(store.set_drawing_layer(b, "b"));
        store.set_layer_order(vec!["a".to_string(), "b".to_string()]);
        store.set_layer_visible("a", false);

        let visible = store.visible_items_in_paint_order();
        assert_eq!(visible.len(), 1);
        assert_eq!(visible[0].id(), b);
    }

    #[test]
    fn group_visibility_filters_items() {
        let mut store = DrawingStore::new();
        let a = store.add_horizontal_line(100.0);
        let b = store.add_vertical_line(4.0);

        assert!(store.set_drawing_group(a, Some("group-a")));
        assert!(store.set_drawing_group(b, Some("group-b")));
        store.set_group_visible("group-b", false);

        let visible = store.visible_items_in_paint_order();
        assert_eq!(visible.len(), 1);
        assert_eq!(visible[0].id(), a);
    }
}

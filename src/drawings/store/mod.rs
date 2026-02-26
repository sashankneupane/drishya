//! In-memory storage for user drawings.
//!
//! This store is intentionally minimal and deterministic: append, remove,
//! iterate. Higher-level semantics live in the command layer.

pub mod create;
pub mod ordering;
pub mod queries;
#[cfg(test)]
#[path = "tests.rs"]
mod regression_tests;
pub mod update;
pub mod visibility;

use crate::{
    drawings::types::{DrawingStyle, *},
    types::Candle,
};
use std::collections::{HashMap, HashSet};

#[derive(Debug, Default)]
pub struct DrawingStore {
    next_id: DrawingId,
    items: Vec<Drawing>,
    layers: HashMap<DrawingLayerId, DrawingLayer>,
    groups: HashMap<DrawingGroupId, DrawingGroup>,
    layer_order: Vec<DrawingLayerId>,
    hidden_layers: HashSet<DrawingLayerId>,
    hidden_groups: HashSet<DrawingGroupId>,
    hidden_drawings: HashSet<DrawingId>,
    x_anchor_timestamps: HashMap<DrawingId, Vec<i64>>,
}

impl DrawingStore {
    pub fn new() -> Self {
        let mut layers = HashMap::new();
        let default_layer_id = DEFAULT_DRAWING_LAYER.to_string();
        layers.insert(
            default_layer_id.clone(),
            DrawingLayer {
                id: default_layer_id.clone(),
                name: "Drawings".to_string(),
                visible: true,
                locked: false,
                order: 0,
            },
        );

        Self {
            next_id: 1,
            items: Vec::new(),
            layers,
            groups: HashMap::new(),
            layer_order: vec![default_layer_id],
            hidden_layers: HashSet::new(),
            hidden_groups: HashSet::new(),
            hidden_drawings: HashSet::new(),
            x_anchor_timestamps: HashMap::new(),
        }
    }

    pub fn layers(&self) -> &HashMap<DrawingLayerId, DrawingLayer> {
        &self.layers
    }

    pub fn groups(&self) -> &HashMap<DrawingGroupId, DrawingGroup> {
        &self.groups
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
        is_up: bool,
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
            is_up,
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
        is_up: bool,
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
            is_up,
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
        is_up: bool,
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
            is_up,
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
        entry_index: f32,
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
            entry_index,
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
        entry_index: f32,
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
            entry_index,
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
            text: if text.is_empty() {
                "Text".to_string()
            } else {
                text
            },
            layer_id: DEFAULT_DRAWING_LAYER.to_string(),
            group_id: None,
            style: DrawingStyle::default(),
        }));
        id
    }

    pub fn add_brush_stroke(&mut self, points: Vec<StrokePoint>) -> DrawingId {
        let id = self.alloc_id();
        self.items.push(Drawing::BrushStroke(BrushStroke {
            id,
            points,
            layer_id: DEFAULT_DRAWING_LAYER.to_string(),
            group_id: None,
            style: DrawingStyle::default(),
        }));
        id
    }

    pub fn add_highlight_stroke(&mut self, points: Vec<StrokePoint>) -> DrawingId {
        let id = self.alloc_id();
        self.items.push(Drawing::HighlightStroke(HighlightStroke {
            id,
            points,
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
        self.x_anchor_timestamps.remove(&id);
        self.items.iter_mut().find(|item| item.id() == id)
    }

    pub fn remove(&mut self, id: DrawingId) -> bool {
        let before = self.items.len();
        self.items.retain(|item| item.id() != id);
        self.x_anchor_timestamps.remove(&id);
        self.items.len() != before
    }

    pub fn clear(&mut self) {
        self.items.clear();
        self.x_anchor_timestamps.clear();
    }

    pub(crate) fn replace_persisted_drawings(
        &mut self,
        drawings: Vec<Drawing>,
        hidden_drawings: HashSet<DrawingId>,
    ) {
        self.items = drawings;
        self.hidden_drawings = hidden_drawings
            .into_iter()
            .filter(|id| self.items.iter().any(|item| item.id() == *id))
            .collect();
        self.x_anchor_timestamps.clear();
        self.next_id = self.items.iter().map(Drawing::id).max().unwrap_or(0) + 1;
        let layer_order = self
            .items
            .iter()
            .map(|item| item.layer_id().to_string())
            .collect::<Vec<_>>();
        self.set_layer_order(layer_order);
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
        if let Some(layer) = self.layers.get_mut(layer_id) {
            layer.visible = visible;
        }
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
        if let Some(group) = self.groups.get_mut(group_id) {
            group.visible = visible;
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

    pub fn create_layer(&mut self, id: DrawingLayerId, name: String) {
        if id.trim().is_empty() {
            return;
        }
        if !self.layers.contains_key(&id) {
            self.layers.insert(
                id.clone(),
                DrawingLayer {
                    id: id.clone(),
                    name,
                    visible: true,
                    locked: false,
                    order: self.layers.len() as i32,
                },
            );
            if !self.layer_order.contains(&id) {
                self.layer_order.push(id);
            }
        }
    }

    pub fn delete_layer(&mut self, id: &str) {
        if id == DEFAULT_DRAWING_LAYER {
            return; // Cannot delete default layer
        }

        if self.layers.remove(id).is_some() {
            self.layer_order.retain(|l| l != id);
            self.hidden_layers.remove(id);

            // Rehome drawings to default layer
            for item in &mut self.items {
                if item.layer_id() == id {
                    item.set_layer_id(DEFAULT_DRAWING_LAYER);
                }
            }

            // Rehome groups to default layer
            for group in self.groups.values_mut() {
                if group.layer_id == id {
                    group.layer_id = DEFAULT_DRAWING_LAYER.to_string();
                }
            }
        }
    }

    pub fn update_layer(
        &mut self,
        id: &str,
        name: Option<String>,
        visible: Option<bool>,
        locked: Option<bool>,
    ) {
        if let Some(layer) = self.layers.get_mut(id) {
            if let Some(n) = name {
                layer.name = n;
            }
            if let Some(v) = visible {
                layer.visible = v;
                if v {
                    self.hidden_layers.remove(id);
                } else {
                    self.hidden_layers.insert(id.to_string());
                }
            }
            if let Some(l) = locked {
                layer.locked = l;
            }
        }
    }

    pub fn create_group(
        &mut self,
        id: DrawingGroupId,
        name: String,
        layer_id: DrawingLayerId,
        parent_group_id: Option<DrawingGroupId>,
    ) {
        if id.trim().is_empty() {
            return;
        }
        self.ensure_layer(&layer_id);
        if !self.groups.contains_key(&id) {
            self.groups.insert(
                id.clone(),
                DrawingGroup {
                    id,
                    name,
                    layer_id,
                    parent_group_id,
                    visible: true,
                    locked: false,
                    order: self.groups.len() as i32,
                },
            );
        }
    }

    pub fn delete_group(&mut self, id: &str) {
        if self.groups.remove(id).is_some() {
            self.hidden_groups.remove(id);

            // Policy: Cascade delete drawings in this group
            self.items.retain(|item| item.group_id() != Some(id));

            // Reparent sub-groups
            for group in self.groups.values_mut() {
                if group.parent_group_id.as_deref() == Some(id) {
                    group.parent_group_id = None;
                }
            }
        }
    }

    pub fn update_group(
        &mut self,
        id: &str,
        name: Option<String>,
        visible: Option<bool>,
        locked: Option<bool>,
    ) {
        if let Some(group) = self.groups.get_mut(id) {
            if let Some(n) = name {
                group.name = n;
            }
            if let Some(v) = visible {
                group.visible = v;
                if v {
                    self.hidden_groups.remove(id);
                } else {
                    self.hidden_groups.insert(id.to_string());
                }
            }
            if let Some(l) = locked {
                group.locked = l;
            }
        }
    }

    pub fn reproject_x_to_timestamps(&mut self, old_candles: &[Candle], new_candles: &[Candle]) {
        if old_candles.is_empty() || new_candles.is_empty() {
            return;
        }

        for drawing in &mut self.items {
            let id = drawing.id();
            let anchor_timestamps = if let Some(cached) = self.x_anchor_timestamps.get(&id) {
                cached.clone()
            } else {
                let collected = collect_anchor_timestamps(drawing, old_candles);
                self.x_anchor_timestamps.insert(id, collected.clone());
                collected
            };
            apply_anchor_timestamps(drawing, &anchor_timestamps, new_candles);
        }
    }
}

fn index_to_timestamp(index: f32, candles: &[Candle]) -> Option<i64> {
    if candles.is_empty() {
        return None;
    }
    let idx = index.round() as i64;
    let first = candles.first()?;
    let last = candles.last()?;
    if idx <= 0 {
        return Some(first.ts);
    }
    let last_idx = candles.len().saturating_sub(1) as i64;
    if idx <= last_idx {
        return candles.get(idx as usize).map(|c| c.ts);
    }
    let step = inferred_time_step_seconds(candles);
    let future_steps = idx - last_idx;
    Some(last.ts.saturating_add(future_steps.saturating_mul(step)))
}

fn nearest_index_for_timestamp(ts: i64, candles: &[Candle]) -> Option<f32> {
    if candles.is_empty() {
        return None;
    }
    let first = candles.first()?;
    let last = candles.last()?;
    if ts <= first.ts {
        return Some(0.0);
    }
    if ts >= last.ts {
        let step = inferred_time_step_seconds(candles);
        if step <= 0 {
            return Some(candles.len().saturating_sub(1) as f32);
        }
        let offset_steps = ((ts - last.ts) as f64 / step as f64).round() as f32;
        return Some(candles.len().saturating_sub(1) as f32 + offset_steps.max(0.0));
    }

    match candles.binary_search_by_key(&ts, |c| c.ts) {
        Ok(idx) => Some(idx as f32),
        Err(insert) => {
            let idx = if insert == 0 {
                0
            } else if insert >= candles.len() {
                candles.len() - 1
            } else {
                let left = candles[insert - 1].ts;
                let right = candles[insert].ts;
                if (ts - left).abs() <= (right - ts).abs() {
                    insert - 1
                } else {
                    insert
                }
            };
            Some(idx as f32)
        }
    }
}

fn inferred_time_step_seconds(candles: &[Candle]) -> i64 {
    for pair in candles.windows(2).rev() {
        let delta = pair[1].ts - pair[0].ts;
        if delta > 0 {
            return delta;
        }
    }
    60
}

fn collect_anchor_timestamps(drawing: &Drawing, candles: &[Candle]) -> Vec<i64> {
    let mut out = Vec::new();
    let mut collect = |index: f32| {
        if let Some(ts) = index_to_timestamp(index, candles) {
            out.push(ts);
        }
    };
    match drawing {
        Drawing::HorizontalLine(_) => {}
        Drawing::VerticalLine(item) => collect(item.index),
        Drawing::Ray(item) => {
            collect(item.start_index);
            collect(item.end_index);
        }
        Drawing::Rectangle(item) => {
            collect(item.start_index);
            collect(item.end_index);
        }
        Drawing::PriceRange(item) => {
            collect(item.start_index);
            collect(item.end_index);
        }
        Drawing::TimeRange(item) => {
            collect(item.start_index);
            collect(item.end_index);
        }
        Drawing::DateTimeRange(item) => {
            collect(item.start_index);
            collect(item.end_index);
        }
        Drawing::LongPosition(item) => {
            collect(item.start_index);
            collect(item.end_index);
            collect(item.entry_index);
        }
        Drawing::ShortPosition(item) => {
            collect(item.start_index);
            collect(item.end_index);
            collect(item.entry_index);
        }
        Drawing::FibRetracement(item) => {
            collect(item.start_index);
            collect(item.end_index);
        }
        Drawing::Circle(item) => {
            collect(item.center_index);
            collect(item.radius_index);
        }
        Drawing::Triangle(item) => {
            collect(item.p1_index);
            collect(item.p2_index);
            collect(item.p3_index);
        }
        Drawing::Ellipse(item) => {
            collect(item.p1_index);
            collect(item.p2_index);
            collect(item.p3_index);
        }
        Drawing::Text(item) => collect(item.index),
        Drawing::BrushStroke(item) => {
            for p in &item.points {
                collect(p.index);
            }
        }
        Drawing::HighlightStroke(item) => {
            for p in &item.points {
                collect(p.index);
            }
        }
    }
    out
}

fn apply_anchor_timestamps(drawing: &mut Drawing, anchor_timestamps: &[i64], candles: &[Candle]) {
    let mut cursor = 0usize;
    let mut map_next = || {
        let ts = *anchor_timestamps.get(cursor)?;
        cursor += 1;
        nearest_index_for_timestamp(ts, candles)
    };

    match drawing {
        Drawing::HorizontalLine(_) => {}
        Drawing::VerticalLine(item) => {
            if let Some(x) = map_next() {
                item.index = x;
            }
        }
        Drawing::Ray(item) => {
            if let Some(x) = map_next() {
                item.start_index = x;
            }
            if let Some(x) = map_next() {
                item.end_index = x;
            }
        }
        Drawing::Rectangle(item) => {
            if let Some(x) = map_next() {
                item.start_index = x;
            }
            if let Some(x) = map_next() {
                item.end_index = x;
            }
        }
        Drawing::PriceRange(item) => {
            if let Some(x) = map_next() {
                item.start_index = x;
            }
            if let Some(x) = map_next() {
                item.end_index = x;
            }
        }
        Drawing::TimeRange(item) => {
            if let Some(x) = map_next() {
                item.start_index = x;
            }
            if let Some(x) = map_next() {
                item.end_index = x;
            }
        }
        Drawing::DateTimeRange(item) => {
            if let Some(x) = map_next() {
                item.start_index = x;
            }
            if let Some(x) = map_next() {
                item.end_index = x;
            }
        }
        Drawing::LongPosition(item) => {
            if let Some(x) = map_next() {
                item.start_index = x;
            }
            if let Some(x) = map_next() {
                item.end_index = x;
            }
            if let Some(x) = map_next() {
                item.entry_index = x;
            }
        }
        Drawing::ShortPosition(item) => {
            if let Some(x) = map_next() {
                item.start_index = x;
            }
            if let Some(x) = map_next() {
                item.end_index = x;
            }
            if let Some(x) = map_next() {
                item.entry_index = x;
            }
        }
        Drawing::FibRetracement(item) => {
            if let Some(x) = map_next() {
                item.start_index = x;
            }
            if let Some(x) = map_next() {
                item.end_index = x;
            }
        }
        Drawing::Circle(item) => {
            if let Some(x) = map_next() {
                item.center_index = x;
            }
            if let Some(x) = map_next() {
                item.radius_index = x;
            }
        }
        Drawing::Triangle(item) => {
            if let Some(x) = map_next() {
                item.p1_index = x;
            }
            if let Some(x) = map_next() {
                item.p2_index = x;
            }
            if let Some(x) = map_next() {
                item.p3_index = x;
            }
        }
        Drawing::Ellipse(item) => {
            if let Some(x) = map_next() {
                item.p1_index = x;
            }
            if let Some(x) = map_next() {
                item.p2_index = x;
            }
            if let Some(x) = map_next() {
                item.p3_index = x;
            }
        }
        Drawing::Text(item) => {
            if let Some(x) = map_next() {
                item.index = x;
            }
        }
        Drawing::BrushStroke(item) => {
            for p in &mut item.points {
                if let Some(x) = map_next() {
                    p.index = x;
                }
            }
        }
        Drawing::HighlightStroke(item) => {
            for p in &mut item.points {
                if let Some(x) = map_next() {
                    p.index = x;
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn candle(ts: i64) -> Candle {
        Candle {
            ts,
            open: 100.0,
            high: 101.0,
            low: 99.0,
            close: 100.0,
            volume: 1000.0,
        }
    }

    #[test]
    fn reproject_preserves_future_anchor_indices_across_roundtrip() {
        let old = vec![candle(0), candle(60), candle(120), candle(180)];
        let new = vec![
            candle(0),
            candle(300),
            candle(600),
            candle(900),
            candle(1200),
        ];

        let mut store = DrawingStore::new();
        let id = store.add_rectangle(2.0, 8.0, 110.0, 90.0);

        store.reproject_x_to_timestamps(&old, &new);
        store.reproject_x_to_timestamps(&new, &old);

        let Some(Drawing::Rectangle(r)) = store.drawing(id) else {
            panic!("expected rectangle");
        };
        assert!((r.start_index - 2.0).abs() < 1e-6);
        assert!((r.end_index - 8.0).abs() < 1e-6);
    }

    #[test]
    fn reproject_roundtrip_preserves_future_anchors_for_all_drawing_kinds() {
        let old = vec![candle(0), candle(60), candle(120), candle(180)];
        let new = vec![candle(0), candle(300), candle(600), candle(900)];

        let mut store = DrawingStore::new();
        let ids = vec![
            store.add_vertical_line(8.0),
            store.add_ray(2.0, 8.0, 100.0, 101.0),
            store.add_rectangle(2.0, 8.0, 110.0, 90.0),
            store.add_price_range(2.0, 8.0, 110.0, 90.0, true),
            store.add_time_range(2.0, 8.0, 110.0, 90.0, true),
            store.add_date_time_range(2.0, 8.0, 110.0, 90.0, true),
            store.add_long_position(2.0, 8.0, 5.0, 100.0, 95.0, 110.0),
            store.add_short_position(2.0, 8.0, 5.0, 100.0, 105.0, 90.0),
            store.add_fib_retracement(2.0, 8.0, 100.0, 101.0),
            store.add_circle(2.0, 8.0, 100.0, 101.0),
            store.add_triangle(2.0, 8.0, 10.0, 100.0, 101.0, 102.0),
            store.add_ellipse(2.0, 8.0, 10.0, 100.0, 101.0, 102.0),
            store.add_text(8.0, 100.0, "x".to_string()),
            store.add_brush_stroke(vec![
                StrokePoint {
                    index: 2.0,
                    price: 100.0,
                },
                StrokePoint {
                    index: 8.0,
                    price: 101.0,
                },
                StrokePoint {
                    index: 10.0,
                    price: 102.0,
                },
            ]),
            store.add_highlight_stroke(vec![
                StrokePoint {
                    index: 2.0,
                    price: 100.0,
                },
                StrokePoint {
                    index: 8.0,
                    price: 101.0,
                },
                StrokePoint {
                    index: 10.0,
                    price: 102.0,
                },
            ]),
        ];

        let before: Vec<Vec<f32>> = ids
            .iter()
            .map(|id| x_indices(store.drawing(*id).expect("drawing exists")))
            .collect();

        store.reproject_x_to_timestamps(&old, &new);
        store.reproject_x_to_timestamps(&new, &old);

        let after: Vec<Vec<f32>> = ids
            .iter()
            .map(|id| x_indices(store.drawing(*id).expect("drawing exists")))
            .collect();

        for (lhs, rhs) in before.iter().zip(after.iter()) {
            assert_eq!(lhs.len(), rhs.len());
            for (a, b) in lhs.iter().zip(rhs.iter()) {
                assert!((a - b).abs() < 1e-6);
            }
        }
    }

    fn x_indices(d: &Drawing) -> Vec<f32> {
        match d {
            Drawing::HorizontalLine(_) => Vec::new(),
            Drawing::VerticalLine(v) => vec![v.index],
            Drawing::Ray(r) => vec![r.start_index, r.end_index],
            Drawing::Rectangle(r) => vec![r.start_index, r.end_index],
            Drawing::PriceRange(r) => vec![r.start_index, r.end_index],
            Drawing::TimeRange(r) => vec![r.start_index, r.end_index],
            Drawing::DateTimeRange(r) => vec![r.start_index, r.end_index],
            Drawing::LongPosition(p) => vec![p.start_index, p.end_index, p.entry_index],
            Drawing::ShortPosition(p) => vec![p.start_index, p.end_index, p.entry_index],
            Drawing::FibRetracement(f) => vec![f.start_index, f.end_index],
            Drawing::Circle(c) => vec![c.center_index, c.radius_index],
            Drawing::Triangle(t) => vec![t.p1_index, t.p2_index, t.p3_index],
            Drawing::Ellipse(e) => vec![e.p1_index, e.p2_index, e.p3_index],
            Drawing::Text(t) => vec![t.index],
            Drawing::BrushStroke(s) => s.points.iter().map(|p| p.index).collect(),
            Drawing::HighlightStroke(s) => s.points.iter().map(|p| p.index).collect(),
        }
    }

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

        store.create_group(
            "group-a".to_string(),
            "Group A".to_string(),
            DEFAULT_DRAWING_LAYER.to_string(),
            None,
        );
        store.create_group(
            "group-b".to_string(),
            "Group B".to_string(),
            DEFAULT_DRAWING_LAYER.to_string(),
            None,
        );
        assert!(store.set_drawing_group(a, Some("group-a")));
        assert!(store.set_drawing_group(b, Some("group-b")));
        store.set_group_visible("group-b", false);

        let visible = store.visible_items_in_paint_order();
        assert_eq!(visible.len(), 1);
        assert_eq!(visible[0].id(), a);
    }
}

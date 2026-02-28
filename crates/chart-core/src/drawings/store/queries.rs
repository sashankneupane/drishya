use crate::drawings::types::{Drawing, DrawingGroup, DrawingId};

use super::DrawingStore;

impl DrawingStore {
    pub fn group_effective_visible(&self, group_id: &str) -> bool {
        if self.hidden_groups.contains(group_id) {
            return false;
        }
        if let Some(group) = self.groups.get(group_id) {
            if !group.visible {
                return false;
            }
            if let Some(parent_id) = &group.parent_group_id {
                return self.group_effective_visible(parent_id);
            }
            true
        } else {
            true
        }
    }

    pub fn group_effective_locked(&self, group_id: &str) -> bool {
        if let Some(group) = self.groups.get(group_id) {
            if group.locked {
                return true;
            }
            if let Some(parent_id) = &group.parent_group_id {
                return self.group_effective_locked(parent_id);
            }
            false
        } else {
            false
        }
    }

    pub fn layer_effective_visible(&self, layer_id: &str) -> bool {
        !self.hidden_layers.contains(layer_id)
            && self.layers.get(layer_id).map(|l| l.visible).unwrap_or(true)
    }

    pub fn layer_effective_locked(&self, layer_id: &str) -> bool {
        self.layers.get(layer_id).map(|l| l.locked).unwrap_or(false)
    }

    pub fn drawing_effective_locked(&self, drawing_id: DrawingId) -> bool {
        if let Some(drawing) = self.drawing(drawing_id) {
            if self.layer_effective_locked(drawing.layer_id()) {
                return true;
            }
            if let Some(group_id) = drawing.group_id() {
                if self.group_effective_locked(group_id) {
                    return true;
                }
            }
        }
        false
    }

    pub fn visible_items_in_paint_order(&self) -> Vec<&Drawing> {
        let mut out = Vec::new();

        for layer_id in &self.layer_order {
            if !self.layer_effective_visible(layer_id) {
                continue;
            }

            let mut layer_groups: Vec<&DrawingGroup> = self
                .groups
                .values()
                .filter(|g| g.layer_id == *layer_id)
                .collect();
            layer_groups.sort_by_key(|g| g.order);

            let layer_drawings: Vec<&Drawing> = self
                .items
                .iter()
                .filter(|d| d.layer_id() == layer_id)
                .collect();

            for group in layer_groups {
                if !self.group_effective_visible(&group.id) {
                    continue;
                }

                for drawing in &layer_drawings {
                    if drawing.group_id() == Some(&group.id)
                        && !self.hidden_drawings.contains(&drawing.id())
                    {
                        out.push(*drawing);
                    }
                }
            }

            for drawing in &layer_drawings {
                if drawing.group_id().is_none() && !self.hidden_drawings.contains(&drawing.id()) {
                    out.push(*drawing);
                }
            }
        }

        out
    }
}

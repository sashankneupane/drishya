use wasm_bindgen::prelude::*;

use crate::api::wasm::chart_handle::WasmChart;
use crate::api::wasm::dto::drawings::{
    DrawingTreeState, GroupTreeState, LayerTreeState, ObjectTreeState, PaneTreeState,
    SeriesTreeState,
};

#[wasm_bindgen]
impl WasmChart {
    pub fn object_tree_state_json(&self) -> Result<String, JsValue> {
        let mut panes = vec![PaneTreeState {
            id: "price".to_string(),
            visible: true,
        }];
        panes.extend(
            self.chart
                .registered_named_panes()
                .into_iter()
                .map(|id| PaneTreeState {
                    visible: self.chart.is_pane_visible(&id),
                    id,
                }),
        );

        let series = self
            .chart
            .plot_series_state()
            .into_iter()
            .map(|item| SeriesTreeState {
                id: item.id,
                name: item.name,
                pane_id: item.pane_id,
                visible: item.visible,
                deleted: item.deleted,
            })
            .collect();

        let drawings = self
            .chart
            .drawing_state()
            .into_iter()
            .map(|item| DrawingTreeState {
                locked: self.chart.is_drawing_locked(item.id),
                id: item.id,
                kind: item.kind,
                layer_id: item.layer_id,
                group_id: item.group_id,
                visible: item.visible,
            })
            .collect();

        let layers = self
            .chart
            .drawings()
            .layers()
            .values()
            .map(|l| LayerTreeState {
                id: l.id.clone(),
                name: l.name.clone(),
                visible: l.visible,
                locked: l.locked,
                order: l.order,
            })
            .collect();

        let groups = self
            .chart
            .drawings()
            .groups()
            .values()
            .map(|g| GroupTreeState {
                id: g.id.clone(),
                name: g.name.clone(),
                layer_id: g.layer_id.clone(),
                parent_group_id: g.parent_group_id.clone(),
                visible: g.visible,
                locked: g.locked,
                order: g.order,
            })
            .collect();

        let state = ObjectTreeState {
            panes,
            series,
            layers,
            groups,
            drawings,
        };

        serde_json::to_string(&state)
            .map_err(|e| JsValue::from_str(&format!("Failed to serialize object tree state: {e}")))
    }
}

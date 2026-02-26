use wasm_bindgen::prelude::*;

use crate::api::wasm::chart_handle::{pane_id_label, WasmChart};
use crate::api::wasm::dto::persistence::PanesSnapshotDto;
use crate::api::wasm::parse::json::parse_json;
use crate::chart::plots::PaneLayoutState;

#[wasm_bindgen]
impl WasmChart {
    /// Sets pane size ratio weight for layout. Use `price` for the main pane,
    /// or the named pane id such as `rsi` / `momentum`.
    pub fn set_pane_weight(&mut self, pane_id: &str, ratio: f32) {
        self.chart.set_pane_weight(pane_id, ratio);
    }

    /// Sets many pane weight ratios in one call from a JSON object map.
    /// Example: {"price": 3.0, "rsi": 1.0, "momentum": 1.0}
    pub fn set_pane_weights_json(&mut self, json: &str) -> Result<(), JsValue> {
        let weights: std::collections::BTreeMap<String, f32> =
            parse_json(json, "pane-weights JSON")?;
        self.chart.set_pane_weights(weights);
        Ok(())
    }

    /// Restores default pane sizing ratios.
    pub fn reset_pane_weights(&mut self) {
        self.chart.clear_pane_weights();
    }

    /// Sets pane visibility (`true` visible, `false` hidden). Price pane cannot be hidden.
    pub fn set_pane_visible(&mut self, pane_id: &str, visible: bool) {
        self.chart.set_pane_visibility(pane_id, visible);
    }

    /// Sets series visibility (`true` visible, `false` hidden).
    /// Explicitly registers a named pane in the engine registry.
    pub fn register_pane(&mut self, pane_id: &str) {
        self.chart.register_named_pane(pane_id);
    }

    /// Unregisters a named pane from the engine registry.
    pub fn unregister_pane(&mut self, pane_id: &str) {
        self.chart.unregister_named_pane(pane_id);
    }

    /// Returns registered named panes as JSON array.
    pub fn registered_panes_json(&self) -> Result<String, JsValue> {
        serde_json::to_string(&self.chart.registered_named_panes())
            .map_err(|e| JsValue::from_str(&format!("Failed to serialize registered panes: {e}")))
    }

    /// Collapses/expands a pane. Collapsed panes keep a small fixed height.
    pub fn set_pane_collapsed(&mut self, pane_id: &str, collapsed: bool) {
        self.chart.set_pane_collapsed(pane_id, collapsed);
    }

    /// Toggles y-axis labels per pane.
    pub fn set_pane_y_axis_visible(&mut self, pane_id: &str, visible: bool) {
        self.chart.set_pane_y_axis_visible(pane_id, visible);
    }

    /// Sets pane min/max height constraints in pixels. Pass <= 0 to clear a bound.
    pub fn set_pane_height_constraints(
        &mut self,
        pane_id: &str,
        min_height_px: f32,
        max_height_px: f32,
    ) {
        let min_bound = if min_height_px > 0.0 {
            Some(min_height_px)
        } else {
            None
        };
        let max_bound = if max_height_px > 0.0 {
            Some(max_height_px)
        } else {
            None
        };
        self.chart
            .set_pane_height_constraints(pane_id, min_bound, max_bound);
    }

    /// Moves a named pane up in display order.
    pub fn move_pane_up(&mut self, pane_id: &str) -> bool {
        self.chart.move_named_pane_up(pane_id)
    }

    /// Moves a named pane down in display order.
    pub fn move_pane_down(&mut self, pane_id: &str) -> bool {
        self.chart.move_named_pane_down(pane_id)
    }

    /// Sets full named-pane order from JSON array. `price` is ignored and stays first.
    pub fn set_pane_order_json(&mut self, json: &str) -> Result<(), JsValue> {
        let order: Vec<String> = parse_json(json, "pane-order JSON")?;
        self.chart.set_pane_order(order);
        Ok(())
    }

    /// Exports pane layout state for persistence.
    pub fn pane_state_json(&self) -> Result<String, JsValue> {
        let state = self.chart.export_pane_layout_state();
        serde_json::to_string(&state)
            .map_err(|e| JsValue::from_str(&format!("Failed to serialize pane state: {e}")))
    }

    /// Restores pane layout state from JSON.
    pub fn restore_pane_state_json(&mut self, json: &str) -> Result<(), JsValue> {
        let state: PaneLayoutState = parse_json(json, "pane-state JSON")?;
        self.chart.restore_pane_layout_state(state);
        Ok(())
    }

    /// Clears all pane customization and reverts to defaults.
    pub fn reset_pane_layout_state(&mut self) {
        self.chart.clear_pane_layout_state();
    }

    /// Returns current pane layout geometry as JSON for interaction overlays.
    pub fn pane_layouts_json(&self) -> Result<String, JsValue> {
        let layout = self.chart.current_layout();
        let panes = layout
            .panes
            .iter()
            .map(|pane| {
                serde_json::json!({
                    "id": pane_id_label(&pane.id),
                    "x": pane.rect.x,
                    "y": pane.rect.y,
                    "w": pane.rect.w,
                    "h": pane.rect.h,
                    "yAxisVisible": pane.y_axis == crate::layout::AxisVisibilityPolicy::Visible,
                })
            })
            .collect::<Vec<_>>();

        serde_json::to_string(&serde_json::json!({ "panes": panes }))
            .map_err(|e| JsValue::from_str(&format!("Failed to serialize pane layout: {e}")))
    }

    /// Exports pane persistence snapshot state as JSON.
    pub fn panes_snapshot_json(&self) -> Result<String, JsValue> {
        serde_json::to_string(&self.chart.export_panes_snapshot())
            .map_err(|e| JsValue::from_str(&format!("Failed to serialize pane snapshot: {e}")))
    }

    /// Restores pane persistence snapshot state from JSON.
    pub fn restore_panes_snapshot_json(&mut self, json: &str) -> Result<(), JsValue> {
        let snapshot: PanesSnapshotDto = parse_json(json, "panes-snapshot JSON")?;
        self.chart.restore_panes_snapshot(&snapshot);
        Ok(())
    }
}

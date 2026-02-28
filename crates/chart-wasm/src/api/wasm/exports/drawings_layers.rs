use wasm_bindgen::prelude::*;

use crate::api::wasm::chart_handle::WasmChart;

#[wasm_bindgen]
impl WasmChart {
    /// Assigns a drawing to a layer id. Creates layer if needed.
    pub fn set_drawing_layer(&mut self, drawing_id: u64, layer_id: &str) -> bool {
        self.chart.set_drawing_layer(drawing_id, layer_id)
    }

    /// Assigns or clears a drawing group id.
    pub fn set_drawing_group(&mut self, drawing_id: u64, group_id: &str) -> bool {
        let group = if group_id.trim().is_empty() {
            None
        } else {
            Some(group_id)
        };
        self.chart.set_drawing_group(drawing_id, group)
    }

    /// Sets layer visibility (`true` visible, `false` hidden).
    pub fn set_drawing_layer_visible(&mut self, layer_id: &str, visible: bool) {
        self.chart.set_drawing_layer_visible(layer_id, visible);
    }
    /// Sets group visibility (`true` visible, `false` hidden).
    pub fn set_drawing_group_visible(&mut self, group_id: &str, visible: bool) {
        self.chart.set_drawing_group_visible(group_id, visible);
    }

    /// Sets full drawing layer order from JSON array.
    pub fn set_drawing_layer_order_json(&mut self, json: &str) -> Result<(), JsValue> {
        let order: Vec<String> = serde_json::from_str(json)
            .map_err(|e| JsValue::from_str(&format!("Invalid drawing-layer-order JSON: {e}")))?;
        self.chart.set_drawing_layer_order(order);
        Ok(())
    }

    /// Returns current drawing layer order as JSON array.
    pub fn drawing_layer_order_json(&self) -> Result<String, JsValue> {
        serde_json::to_string(&self.chart.drawing_layer_order()).map_err(|e| {
            JsValue::from_str(&format!("Failed to serialize drawing layer order: {e}"))
        })
    }
    pub fn create_drawing_layer(&mut self, id: String, name: String) {
        self.chart.create_drawing_layer(id, name);
    }

    pub fn delete_drawing_layer(&mut self, id: String) {
        self.chart.delete_drawing_layer(id);
    }

    pub fn update_drawing_layer(&mut self, id: String, json: &str) -> Result<(), JsValue> {
        let val: serde_json::Value =
            serde_json::from_str(json).map_err(|e| JsValue::from_str(&e.to_string()))?;
        let name = val
            .get("name")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let visible = val.get("visible").and_then(|v| v.as_bool());
        let locked = val.get("locked").and_then(|v| v.as_bool());
        self.chart.update_drawing_layer(id, name, visible, locked);
        Ok(())
    }

    pub fn create_drawing_group(
        &mut self,
        id: String,
        name: String,
        layer_id: String,
        parent_group_id: Option<String>,
    ) {
        self.chart
            .create_drawing_group(id, name, layer_id, parent_group_id);
    }

    pub fn delete_drawing_group(&mut self, id: String) {
        self.chart.delete_drawing_group(id);
    }

    pub fn update_drawing_group(&mut self, id: String, json: &str) -> Result<(), JsValue> {
        let val: serde_json::Value =
            serde_json::from_str(json).map_err(|e| JsValue::from_str(&e.to_string()))?;
        let name = val
            .get("name")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let visible = val.get("visible").and_then(|v| v.as_bool());
        let locked = val.get("locked").and_then(|v| v.as_bool());
        self.chart.update_drawing_group(id, name, visible, locked);
        Ok(())
    }

    pub fn move_drawings_to_group(
        &mut self,
        ids_json: &str,
        group_id: Option<String>,
    ) -> Result<(), JsValue> {
        let ids: Vec<u64> = serde_json::from_str(ids_json)
            .map_err(|e| JsValue::from_str(&format!("Invalid IDs JSON: {e}")))?;
        self.chart.move_drawings_to_group(ids, group_id);
        Ok(())
    }

    pub fn move_drawings_to_layer(
        &mut self,
        ids_json: &str,
        layer_id: String,
    ) -> Result<(), JsValue> {
        let ids: Vec<u64> = serde_json::from_str(ids_json)
            .map_err(|e| JsValue::from_str(&format!("Invalid IDs JSON: {e}")))?;
        self.chart.move_drawings_to_layer(ids, layer_id);
        Ok(())
    }

    pub fn delete_drawings(&mut self, ids_json: &str) -> Result<(), JsValue> {
        let ids: Vec<u64> = serde_json::from_str(ids_json)
            .map_err(|e| JsValue::from_str(&format!("Invalid IDs JSON: {e}")))?;
        self.chart.delete_drawings(ids);
        Ok(())
    }
}

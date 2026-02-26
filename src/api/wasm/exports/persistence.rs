use wasm_bindgen::prelude::*;

use crate::api::wasm::{
    chart_handle::WasmChart,
    dto::{
        persistence::{
            ChartStateDto, ChartStateSnapshotDto, ObjectTreeSnapshotDto,
            RestoreChartStateOptionsDto,
        },
        persistence::{
            DrawingTreeSnapshotDto, GroupTreeSnapshotDto, LayerTreeSnapshotDto,
            PaneTreeSnapshotDto, SeriesTreeSnapshotDto,
        },
    },
    parse::json::parse_json,
};

#[wasm_bindgen]
impl WasmChart {
    pub fn chart_state_snapshot_json(&self) -> Result<String, JsValue> {
        let snapshot = ChartStateSnapshotDto {
            saved_at_unix_ms: js_sys::Date::now() as u64,
            chart_state: ChartStateDto {
                viewport: self.chart.export_viewport_snapshot(),
                panes: self.chart.export_panes_snapshot(),
                appearance: self.chart.export_appearance_snapshot(),
                drawings: self.chart.export_drawing_snapshots(),
                object_tree: build_object_tree(&self.chart),
                selection: Some(self.chart.export_selection_snapshot()),
            },
        };
        serde_json::to_string(&snapshot)
            .map_err(|e| JsValue::from_str(&format!("Failed to serialize chart snapshot: {e}")))
    }

    pub fn restore_chart_state_json(&mut self, json: &str) -> Result<(), JsValue> {
        let snapshot: ChartStateSnapshotDto = parse_json(json, "chart-state snapshot JSON")?;
        self.restore_chart_state_snapshot(snapshot, RestoreChartStateOptionsDto::all_enabled())
    }

    pub fn restore_chart_state_partial_json(
        &mut self,
        json: &str,
        options_json: &str,
    ) -> Result<(), JsValue> {
        let snapshot: ChartStateSnapshotDto = parse_json(json, "chart-state snapshot JSON")?;
        let options: RestoreChartStateOptionsDto =
            parse_json(options_json, "restore chart-state options JSON")?;
        self.restore_chart_state_snapshot(snapshot, options)
    }
}

impl WasmChart {
    fn restore_chart_state_snapshot(
        &mut self,
        snapshot: ChartStateSnapshotDto,
        options: RestoreChartStateOptionsDto,
    ) -> Result<(), JsValue> {
        validate_snapshot(&snapshot, &options).map_err(|e| JsValue::from_str(&e))?;
        let state = snapshot.chart_state;
        if options.appearance {
            self.chart
                .restore_appearance_snapshot(&state.appearance)
                .map_err(|e| JsValue::from_str(&format!("Appearance restore failed: {e}")))?;
        }
        if options.panes {
            self.chart.restore_panes_snapshot(&state.panes);
        }
        if options.viewport {
            self.chart.restore_viewport_snapshot(&state.viewport);
        }
        if options.drawings {
            self.chart
                .restore_drawing_snapshots(&state.drawings)
                .map_err(|e| JsValue::from_str(&format!("Drawings restore failed: {e}")))?;
        }
        if options.selection {
            if let Some(selection) = state.selection.as_ref() {
                self.chart.restore_selection_snapshot(selection);
            }
        }
        Ok(())
    }
}

fn validate_snapshot(
    snapshot: &ChartStateSnapshotDto,
    options: &RestoreChartStateOptionsDto,
) -> Result<(), String> {
    if options.viewport {
        let vp = &snapshot.chart_state.viewport;
        if !vp.world_start_x.is_finite() || !vp.world_end_x.is_finite() {
            return Err(
                "Invalid chart-state snapshot: viewport world range must be finite numbers"
                    .to_string(),
            );
        }
        if vp.world_end_x <= vp.world_start_x {
            return Err(
                "Invalid chart-state snapshot: viewport.world_end_x must be greater than viewport.world_start_x"
                    .to_string(),
            );
        }
        if let Some(zoom) = vp.y_zoom_factor {
            if !zoom.is_finite() || zoom <= 0.0 {
                return Err(
                    "Invalid chart-state snapshot: viewport.y_zoom_factor must be a positive finite number"
                        .to_string(),
                );
            }
        }
        if let Some(pan) = vp.y_pan_offset {
            if !pan.is_finite() {
                return Err(
                    "Invalid chart-state snapshot: viewport.y_pan_offset must be a finite number"
                        .to_string(),
                );
            }
        }
    }

    if options.panes {
        for pane in &snapshot.chart_state.panes.panes {
            if pane.id.trim().is_empty() {
                return Err(
                    "Invalid chart-state snapshot: pane.id must be a non-empty string".to_string(),
                );
            }
            if !pane.weight.is_finite() || pane.weight <= 0.0 {
                return Err(format!(
                    "Invalid chart-state snapshot: pane '{}' has invalid weight (must be > 0)",
                    pane.id
                ));
            }
        }
    }

    if options.drawings {
        for drawing in &snapshot.chart_state.drawings {
            if drawing.kind.trim().is_empty() {
                return Err(format!(
                    "Invalid chart-state snapshot: drawing {} has empty kind",
                    drawing.id
                ));
            }
            if drawing.layer_id.trim().is_empty() {
                return Err(format!(
                    "Invalid chart-state snapshot: drawing {} has empty layer_id",
                    drawing.id
                ));
            }
        }
    }

    Ok(())
}

fn build_object_tree(chart: &crate::chart::Chart) -> ObjectTreeSnapshotDto {
    let mut panes = vec![PaneTreeSnapshotDto {
        id: "price".to_string(),
        visible: true,
    }];
    panes.extend(
        chart
            .registered_named_panes()
            .into_iter()
            .map(|id| PaneTreeSnapshotDto {
                visible: chart.is_pane_visible(&id),
                id,
            }),
    );

    let series = chart
        .plot_series_state()
        .into_iter()
        .map(|item| SeriesTreeSnapshotDto {
            id: item.id,
            name: item.name,
            pane_id: item.pane_id,
            visible: item.visible,
            deleted: item.deleted,
        })
        .collect();

    let drawings = chart
        .drawing_state()
        .into_iter()
        .map(|item| DrawingTreeSnapshotDto {
            locked: chart.is_drawing_locked(item.id),
            id: item.id,
            kind: item.kind,
            layer_id: item.layer_id,
            group_id: item.group_id,
            visible: item.visible,
        })
        .collect();

    let layers = chart
        .drawings()
        .layers()
        .values()
        .map(|l| LayerTreeSnapshotDto {
            id: l.id.clone(),
            name: l.name.clone(),
            visible: l.visible,
            locked: l.locked,
            order: l.order,
        })
        .collect();

    let groups = chart
        .drawings()
        .groups()
        .values()
        .map(|g| GroupTreeSnapshotDto {
            id: g.id.clone(),
            name: g.name.clone(),
            layer_id: g.layer_id.clone(),
            parent_group_id: g.parent_group_id.clone(),
            visible: g.visible,
            locked: g.locked,
            order: g.order,
        })
        .collect();

    ObjectTreeSnapshotDto {
        panes,
        series,
        layers,
        groups,
        drawings,
    }
}

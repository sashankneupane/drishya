use crate::api::wasm::chart_handle::{pane_id_label, WasmChart};
use crate::chart::scene::helpers::{
    nearest_candle_index, series_value_at_index, timestamp_for_world_x,
};
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

#[derive(Serialize, Deserialize)]
pub struct CrosshairPaneReadoutDto {
    pub pane_id: String,
    pub value: f64,
}

#[derive(Serialize, Deserialize)]
pub struct CrosshairSyncSnapshotDto {
    pub x: f32,
    pub index: Option<usize>,
    pub timestamp: Option<i64>,
    pub readouts: Vec<CrosshairPaneReadoutDto>,
}

#[derive(Serialize, Deserialize)]
pub struct CrosshairSyncPositionDto {
    pub x: f32,
    pub timestamp: Option<i64>,
}

#[wasm_bindgen]
impl WasmChart {
    pub fn crosshair_sync_position_json(&self) -> Result<String, JsValue> {
        let chart = &self.chart;
        let layout = chart.current_layout();

        let mut snapshot = CrosshairSyncPositionDto {
            x: 0.0,
            timestamp: None,
        };

        let crosshair = match chart.crosshair {
            Some(c) => c,
            None => {
                return serde_json::to_string(&snapshot).map_err(|e| {
                    JsValue::from_str(&format!(
                        "Failed to serialize crosshair sync position: {}",
                        e
                    ))
                });
            }
        };

        snapshot.x = crosshair.x;
        let plot_w = layout.plot.w.max(1.0);
        if let Some(vp) = &chart.viewport {
            let world_x = vp.pixel_x_to_world_x(crosshair.x, layout.plot.x, plot_w);
            snapshot.timestamp = timestamp_for_world_x(world_x as f64, &chart.candles);
        }

        serde_json::to_string(&snapshot).map_err(|e| {
            JsValue::from_str(&format!(
                "Failed to serialize crosshair sync position: {}",
                e
            ))
        })
    }

    pub fn crosshair_sync_snapshot_json(&self) -> Result<String, JsValue> {
        let chart = &self.chart;
        let layout = chart.current_layout();

        let mut snapshot = CrosshairSyncSnapshotDto {
            x: 0.0,
            index: None,
            timestamp: None,
            readouts: Vec::new(),
        };

        let crosshair = match chart.crosshair {
            Some(c) => c,
            None => {
                return serde_json::to_string(&snapshot).map_err(|e| {
                    JsValue::from_str(&format!("Failed to serialize crosshair snapshot: {}", e))
                });
            }
        };

        snapshot.x = crosshair.x;
        let plot_w = layout.plot.w.max(1.0);

        if let Some(vp) = &chart.viewport {
            let world_x = vp.pixel_x_to_world_x(crosshair.x, layout.plot.x, plot_w);
            snapshot.timestamp = timestamp_for_world_x(world_x as f64, &chart.candles);

            let visible_end = vp.world_end_x().ceil() as usize;

            let ts_price = crate::scale::TimeScale {
                pane: layout.price_pane().unwrap_or(layout.plot),
                world_start_x: vp.world_start_x(),
                world_end_x: vp.world_end_x(),
            };

            let idx = nearest_candle_index(crosshair.x, ts_price, visible_end);
            snapshot.index = idx;

            if let Some(index) = idx {
                let mut all_series = chart.collect_plot_series();
                let visible_start = vp.world_start_x().floor().max(0.0) as usize;
                all_series.extend(chart.collect_compare_series(visible_start));

                for pane in &layout.panes {
                    // Find a series in this pane
                    let series_in_pane = all_series.iter().find(|s| s.pane == pane.id && s.visible);
                    if let Some(series) = series_in_pane {
                        if let Some(val) = series_value_at_index(series, index) {
                            snapshot.readouts.push(CrosshairPaneReadoutDto {
                                pane_id: pane_id_label(&pane.id),
                                value: val,
                            });
                        }
                    } else if pane.id == crate::plots::model::PaneId::Price {
                        // Fallback to candle close if no specific series found in price pane
                        if let Some(candle) = chart.candles.get(index) {
                            let val = candle.close;
                            snapshot.readouts.push(CrosshairPaneReadoutDto {
                                pane_id: "price".to_string(),
                                value: val,
                            });
                        }
                    }
                }
            }
        }

        serde_json::to_string(&snapshot).map_err(|e| {
            JsValue::from_str(&format!("Failed to serialize crosshair snapshot: {}", e))
        })
    }
}

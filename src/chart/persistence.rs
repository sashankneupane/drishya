use std::collections::BTreeMap;

use crate::{
    api::wasm::dto::persistence::{
        AppearanceSnapshotDto, PaneSnapshotDto, PanesSnapshotDto, ViewportSnapshotDto,
    },
    chart::{appearance::ChartAppearanceConfig, plots::PaneLayoutState, Chart},
    render::styles::ThemeId,
};

impl Chart {
    pub fn export_viewport_snapshot(&self) -> ViewportSnapshotDto {
        let viewport = self
            .viewport
            .unwrap_or_else(|| crate::viewport::Viewport::new(self.candles.len().max(1)));
        ViewportSnapshotDto {
            world_start_x: viewport.world_start_x(),
            world_end_x: viewport.world_end_x(),
            y_zoom_factor: Some(self.pane_y_zoom_factor(&crate::plots::model::PaneId::Price)),
            y_pan_offset: Some(self.pane_y_pan_factor(&crate::plots::model::PaneId::Price)),
        }
    }

    pub fn restore_viewport_snapshot(&mut self, snapshot: &ViewportSnapshotDto) {
        self.set_viewport_world_range(snapshot.world_start_x, snapshot.world_end_x);

        if let Some(y_zoom) = snapshot.y_zoom_factor {
            self.set_pane_y_zoom_factor(&crate::plots::model::PaneId::Price, y_zoom);
        }
        if let Some(y_pan) = snapshot.y_pan_offset {
            self.set_pane_y_pan_factor(&crate::plots::model::PaneId::Price, y_pan);
        }
    }

    pub fn export_panes_snapshot(&self) -> PanesSnapshotDto {
        let state = self.export_pane_layout_state();
        let mut ids = vec!["price".to_string()];
        ids.extend(state.registered.clone());

        let panes = ids
            .into_iter()
            .map(|id| PaneSnapshotDto {
                id: id.clone(),
                visible: id == "price" || !state.hidden.contains(&id),
                weight: state.weights.get(&id).copied().unwrap_or(if id == "price" {
                    3.0
                } else {
                    1.0
                }),
                collapsed: state.collapsed.contains(&id),
                y_axis_visible: state.y_axis_visible.get(&id).copied().unwrap_or(true),
                min_height_px: state.min_heights.get(&id).copied(),
                max_height_px: state.max_heights.get(&id).copied(),
            })
            .collect();

        PanesSnapshotDto {
            order: state.order,
            panes,
        }
    }

    pub fn restore_panes_snapshot(&mut self, snapshot: &PanesSnapshotDto) {
        let mut registered = Vec::new();
        let mut weights = BTreeMap::new();
        let mut hidden = Vec::new();
        let mut collapsed = Vec::new();
        let mut y_axis_visible = BTreeMap::new();
        let mut min_heights = BTreeMap::new();
        let mut max_heights = BTreeMap::new();

        for pane in &snapshot.panes {
            let pane_id = pane.id.trim();
            if pane_id.is_empty() || pane_id.eq_ignore_ascii_case("price") {
                continue;
            }
            if !registered.iter().any(|item: &String| item == pane_id) {
                registered.push(pane_id.to_string());
            }
            weights.insert(pane_id.to_string(), pane.weight.max(0.1));
            if !pane.visible {
                hidden.push(pane_id.to_string());
            }
            if pane.collapsed {
                collapsed.push(pane_id.to_string());
            }
            y_axis_visible.insert(pane_id.to_string(), pane.y_axis_visible);
            if let Some(min_height) = pane.min_height_px {
                min_heights.insert(pane_id.to_string(), min_height.max(1.0));
            }
            if let Some(max_height) = pane.max_height_px {
                max_heights.insert(
                    pane_id.to_string(),
                    max_height.max(min_heights.get(pane_id).copied().unwrap_or(1.0)),
                );
            }
        }

        let mut order = snapshot
            .order
            .iter()
            .map(|pane_id| pane_id.trim().to_string())
            .filter(|pane_id| !pane_id.is_empty() && !pane_id.eq_ignore_ascii_case("price"))
            .collect::<Vec<_>>();
        order.retain(|pane_id| {
            registered
                .iter()
                .any(|registered_id| registered_id == pane_id)
        });
        for pane_id in &registered {
            if !order.iter().any(|id| id == pane_id) {
                order.push(pane_id.clone());
            }
        }

        let state = PaneLayoutState {
            registered,
            order,
            weights,
            hidden,
            collapsed,
            y_axis_visible,
            min_heights,
            max_heights,
        };
        self.restore_pane_layout_state(state);
    }

    pub fn export_appearance_snapshot(&self) -> AppearanceSnapshotDto {
        AppearanceSnapshotDto {
            theme: match self.theme() {
                ThemeId::Light => "light".to_string(),
                ThemeId::Dark => "dark".to_string(),
            },
            config: serde_json::to_value(self.appearance_config()).unwrap_or_else(|_| {
                serde_json::json!({
                    "background": "#030712",
                    "candle_up": "#22c55e",
                    "candle_down": "#ef4444"
                })
            }),
        }
    }

    pub fn restore_appearance_snapshot(
        &mut self,
        snapshot: &AppearanceSnapshotDto,
    ) -> Result<(), String> {
        let theme = match snapshot.theme.trim().to_ascii_lowercase().as_str() {
            "light" => ThemeId::Light,
            _ => ThemeId::Dark,
        };
        self.set_theme(theme);
        let config: ChartAppearanceConfig = serde_json::from_value(snapshot.config.clone())
            .map_err(|e| format!("Invalid appearance config: {e}"))?;
        config.validate()?;
        self.set_appearance_config(config);
        Ok(())
    }
}

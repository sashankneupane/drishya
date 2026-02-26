use super::{pane_id_label, PlotSeriesState};
use crate::chart::Chart;

impl Chart {
    pub fn plot_series_state(&self) -> Vec<PlotSeriesState> {
        self.plot_providers
            .iter()
            .flat_map(|provider| provider.build_series(&self.candles))
            .map(|series| {
                let deleted = self.deleted_series.contains(&series.id);
                let visible =
                    !deleted && series.visible && !self.hidden_series.contains(&series.id);
                PlotSeriesState {
                    id: series.id,
                    name: series.name,
                    pane_id: pane_id_label(&series.pane),
                    visible,
                    deleted,
                }
            })
            .collect()
    }

    pub fn is_series_visible(&self, series_id: &str) -> bool {
        let key = series_id.trim();
        if key.is_empty() {
            return false;
        }
        !self.hidden_series.contains(key) && !self.deleted_series.contains(key)
    }

    pub fn set_series_visibility(&mut self, series_id: &str, visible: bool) {
        let key = series_id.trim().to_string();
        if key.is_empty() || self.deleted_series.contains(&key) {
            return;
        }

        if visible {
            self.hidden_series.remove(&key);
        } else {
            self.hidden_series.insert(key);
        }
    }

    pub fn delete_series(&mut self, series_id: &str) {
        let key = series_id.trim().to_string();
        if key.is_empty() {
            return;
        }
        self.hidden_series.remove(&key);
        self.deleted_series.insert(key);
        if self.selected_series_id.as_deref() == Some(series_id) {
            self.selected_series_id = None;
        }
        self.prune_empty_registered_named_panes();
    }

    pub fn restore_series(&mut self, series_id: &str) {
        let key = series_id.trim().to_string();
        if key.is_empty() {
            return;
        }
        self.deleted_series.remove(&key);
        self.hidden_series.remove(&key);
        if let Some(pane_key) = self.series_pane_key(series_id) {
            self.ensure_named_pane_registered(&pane_key);
        }
    }
}

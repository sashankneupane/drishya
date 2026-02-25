//! Chart-facing plot provider management.

use crate::{
    layout::{compute_layout, AxisVisibilityPolicy, ChartLayout, PaneDescriptor, PaneHeightPolicy},
    plots::{model::PaneId, provider::PlotDataProvider},
};

use super::Chart;

impl Chart {
    pub fn add_plot_provider(&mut self, provider: Box<dyn PlotDataProvider>) {
        self.plot_providers.push(provider);
    }

    pub fn clear_plot_providers(&mut self) {
        self.plot_providers.clear();
    }

    pub(crate) fn collect_plot_series(&self) -> Vec<crate::plots::model::PlotSeries> {
        self.plot_providers
            .iter()
            .flat_map(|provider| provider.build_series(&self.candles))
            .collect()
    }

    pub(crate) fn pane_descriptors(&self) -> Vec<PaneDescriptor> {
        let series = self.collect_plot_series();
        let price_weight = self
            .pane_weights
            .get("price")
            .copied()
            .unwrap_or(3.0)
            .max(0.1);
        let mut panes = vec![PaneDescriptor {
            id: PaneId::Price,
            height: PaneHeightPolicy::Ratio(price_weight),
            y_axis: AxisVisibilityPolicy::Visible,
        }];

        for s in series {
            if matches!(s.pane, PaneId::Price) {
                continue;
            }

            if panes.iter().any(|pane| pane.id == s.pane) {
                continue;
            }

            let key = pane_weight_key(&s.pane);
            let ratio = self.pane_weights.get(&key).copied().unwrap_or(1.0).max(0.1);

            panes.push(PaneDescriptor {
                id: s.pane,
                height: PaneHeightPolicy::Ratio(ratio),
                y_axis: AxisVisibilityPolicy::Visible,
            });
        }

        if panes.len() == 1 {
            panes[0].height = PaneHeightPolicy::Auto;
        }

        panes
    }

    pub(crate) fn current_layout(&self) -> ChartLayout {
        let pane_specs = self.pane_descriptors();
        compute_layout(self.size, &pane_specs)
    }

    pub fn set_pane_weight(&mut self, pane_id: &str, ratio: f32) {
        if ratio <= 0.0 {
            return;
        }

        let key = if pane_id.eq_ignore_ascii_case("price") {
            "price".to_string()
        } else {
            pane_id.to_string()
        };

        self.pane_weights.insert(key, ratio.max(0.1));
    }

    pub fn set_pane_weights<I>(&mut self, pane_weights: I)
    where
        I: IntoIterator<Item = (String, f32)>,
    {
        for (pane_id, ratio) in pane_weights {
            self.set_pane_weight(&pane_id, ratio);
        }
    }

    pub fn clear_pane_weights(&mut self) {
        self.pane_weights.clear();
    }
}

fn pane_weight_key(pane: &PaneId) -> String {
    match pane {
        PaneId::Price => "price".to_string(),
        PaneId::Named(name) => name.clone(),
    }
}

//! Chart-facing plot provider management.

use crate::plots::{model::PaneId, provider::PlotDataProvider};

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

    pub(crate) fn has_named_pane_series(&self) -> bool {
        self.collect_plot_series()
            .iter()
            .any(|series| !matches!(series.pane, PaneId::Price))
    }
}

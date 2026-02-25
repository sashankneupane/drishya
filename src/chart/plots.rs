//! Chart-facing plot provider management.

use crate::{
    layout::{AxisVisibilityPolicy, PaneDescriptor, PaneHeightPolicy},
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
        let mut panes = vec![PaneDescriptor {
            id: PaneId::Price,
            height: PaneHeightPolicy::Ratio(3.0),
            y_axis: AxisVisibilityPolicy::Visible,
        }];

        for s in series {
            if matches!(s.pane, PaneId::Price) {
                continue;
            }

            if panes.iter().any(|pane| pane.id == s.pane) {
                continue;
            }

            panes.push(PaneDescriptor {
                id: s.pane,
                height: PaneHeightPolicy::Ratio(1.0),
                y_axis: AxisVisibilityPolicy::Visible,
            });
        }

        if panes.len() == 1 {
            panes[0].height = PaneHeightPolicy::Auto;
        }

        panes
    }
}

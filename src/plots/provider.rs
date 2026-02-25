//! Provider trait for supplying plot series to the chart.

use crate::{plots::model::PlotSeries, types::Candle};

pub trait PlotDataProvider {
    fn build_series(&self, candles: &[Candle]) -> Vec<PlotSeries>;
}

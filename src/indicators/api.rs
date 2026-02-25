//! Optional convenience API for attaching built-in indicators to a chart.

use crate::{chart::Chart, indicators::builtins::*};

pub fn add_sma(chart: &mut Chart, period: usize) {
    chart.add_plot_provider(Box::new(SmaProvider::new(period)));
}

pub fn add_bbands(chart: &mut Chart, period: usize, std_mult: f64) {
    chart.add_plot_provider(Box::new(BbandsProvider::new(period, std_mult)));
}

pub fn add_momentum_histogram(chart: &mut Chart) {
    chart.add_plot_provider(Box::new(MomentumHistogramProvider::new()));
}

pub fn add_rsi(chart: &mut Chart, period: usize) {
    chart.add_plot_provider(Box::new(RsiProvider::new(period)));
}

pub fn clear_builtins(chart: &mut Chart) {
    chart.clear_plot_providers();
}
//! Optional convenience API for attaching built-in indicators to a chart.

use crate::chart::Chart;
use crate::indicators::provider::ta_plot_provider::{
    TaAdxPlotProvider, TaAoHistogramPlotProvider, TaAtrPlotProvider, TaBbandsPlotProvider,
    TaEmaPlotProvider, TaMacdPlotProvider, TaObvPlotProvider, TaRsiPlotProvider, TaSmaPlotProvider,
    TaStochasticPlotProvider, TaVwapPlotProvider,
};

pub fn add_sma(chart: &mut Chart, period: usize) {
    chart.add_plot_provider(Box::new(TaSmaPlotProvider::new(period)));
}

pub fn add_ema(chart: &mut Chart, period: usize) {
    chart.add_plot_provider(Box::new(TaEmaPlotProvider::new(period)));
}

pub fn add_bbands(chart: &mut Chart, period: usize, std_mult: f64) {
    chart.add_plot_provider(Box::new(TaBbandsPlotProvider::new(period, std_mult)));
}

pub fn add_macd(chart: &mut Chart, fast: usize, slow: usize, signal: usize) {
    chart.register_named_pane("macd");
    chart.add_plot_provider(Box::new(TaMacdPlotProvider::new(fast, slow, signal)));
}

pub fn add_momentum_histogram(chart: &mut Chart) {
    chart.register_named_pane("momentum");
    chart.add_plot_provider(Box::new(TaAoHistogramPlotProvider::new()));
}

pub fn add_rsi(chart: &mut Chart, period: usize) {
    chart.register_named_pane("rsi");
    chart.add_plot_provider(Box::new(TaRsiPlotProvider::new(period)));
}

pub fn add_atr(chart: &mut Chart, period: usize) {
    chart.register_named_pane("atr");
    chart.add_plot_provider(Box::new(TaAtrPlotProvider::new(period)));
}

pub fn add_stochastic(chart: &mut Chart, k: usize, d: usize, smooth: usize) {
    chart.register_named_pane("stoch");
    chart.add_plot_provider(Box::new(TaStochasticPlotProvider::new(k, d, smooth)));
}

pub fn add_obv(chart: &mut Chart) {
    chart.register_named_pane("obv");
    chart.add_plot_provider(Box::new(TaObvPlotProvider::new()));
}

pub fn add_vwap(chart: &mut Chart) {
    chart.add_plot_provider(Box::new(TaVwapPlotProvider::new()));
}

pub fn add_adx(chart: &mut Chart, period: usize) {
    chart.register_named_pane("adx");
    chart.add_plot_provider(Box::new(TaAdxPlotProvider::new(period)));
}

pub fn clear_builtins(chart: &mut Chart) {
    chart.clear_plot_providers();
    chart.unregister_named_pane("rsi");
    chart.unregister_named_pane("momentum");
    chart.unregister_named_pane("macd");
    chart.unregister_named_pane("atr");
    chart.unregister_named_pane("stoch");
    chart.unregister_named_pane("obv");
    chart.unregister_named_pane("adx");
}

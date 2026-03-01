//! Optional convenience API for attaching built-in indicators to a chart.

use crate::chart::Chart;
use crate::indicators::contracts::IndicatorParamValue;
use crate::indicators::provider::ta_plot_provider::{
    TaAdxPlotProvider, TaAoHistogramPlotProvider, TaAtrPlotProvider, TaBbandsPlotProvider,
    TaCatalogPlotProvider, TaEmaPlotProvider, TaMacdPlotProvider, TaObvPlotProvider,
    TaRsiPlotProvider, TaSmaPlotProvider, TaStochasticPlotProvider, TaVwapPlotProvider,
};
use serde_json::Value;
use std::collections::HashMap;

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

pub fn add_indicator_with_params(
    chart: &mut Chart,
    indicator_id: &str,
    params: &HashMap<String, Value>,
) -> Result<(), String> {
    let id = indicator_id.trim().to_ascii_lowercase();
    let Some(meta) = ta_engine::metadata::find_indicator_meta(&id) else {
        return Err(format!(
            "Unsupported built-in indicator id '{}' for chart attachment",
            indicator_id
        ));
    };

    if meta.visual.output_visuals.iter().any(|v| {
        matches!(
            v.primitive,
            ta_engine::metadata::OutputVisualPrimitive::Markers
                | ta_engine::metadata::OutputVisualPrimitive::SignalFlag
        )
    }) {
        return Err(format!(
            "Indicator '{}' has event-like visuals and is not chart-plottable",
            id
        ));
    }

    if matches!(
        meta.visual.pane_hint,
        ta_engine::metadata::IndicatorPaneHint::SeparatePane
            | ta_engine::metadata::IndicatorPaneHint::Auto
    ) {
        chart.register_named_pane(meta.id);
    }

    let parsed_params = params
        .iter()
        .filter_map(|(key, value)| {
            let parsed = match value {
                Value::Bool(v) => Some(IndicatorParamValue::Bool(*v)),
                Value::Number(v) if v.is_i64() => v.as_i64().map(IndicatorParamValue::Int),
                Value::Number(v) => v.as_f64().map(IndicatorParamValue::Float),
                Value::String(v) => Some(IndicatorParamValue::Text(v.clone())),
                _ => None,
            }?;
            Some((key.clone(), parsed))
        })
        .collect::<Vec<_>>();

    chart.add_plot_provider(Box::new(TaCatalogPlotProvider::new(
        meta.id.to_string(),
        parsed_params,
    )));
    Ok(())
}

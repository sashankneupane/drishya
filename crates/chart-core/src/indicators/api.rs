//! Optional convenience API for attaching built-in indicators to a chart.

use crate::chart::Chart;
use crate::indicators::contracts::IndicatorParamValue;
use crate::indicators::error::IndicatorError;
use crate::indicators::provider::ta_plot_provider::TaCatalogPlotProvider;
use serde_json::Value;
use std::collections::HashMap;

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

    for required in meta.params.iter().filter(|param| param.required) {
        if !params.contains_key(required.name) {
            return Err(IndicatorError::MissingParameter {
                name: required.name.to_string(),
            }
            .to_string());
        }
    }

    let parsed_params = params
        .iter()
        .map(|(key, value)| {
            let parsed = match value {
                Value::Bool(v) => IndicatorParamValue::Bool(*v),
                Value::Number(v) if v.is_i64() => {
                    let Some(parsed) = v.as_i64() else {
                        return Err(IndicatorError::InvalidParameter {
                            name: key.clone(),
                            reason: "invalid integer value".to_string(),
                        });
                    };
                    IndicatorParamValue::Int(parsed)
                }
                Value::Number(v) => {
                    let Some(parsed) = v.as_f64() else {
                        return Err(IndicatorError::InvalidParameter {
                            name: key.clone(),
                            reason: "invalid float value".to_string(),
                        });
                    };
                    IndicatorParamValue::Float(parsed)
                }
                Value::String(v) => IndicatorParamValue::Text(v.clone()),
                _ => {
                    return Err(IndicatorError::InvalidParameter {
                        name: key.clone(),
                        reason: "unsupported JSON value type".to_string(),
                    });
                }
            };
            Ok((key.clone(), parsed))
        })
        .collect::<Result<Vec<_>, IndicatorError>>()
        .map_err(|e| e.to_string())?;

    chart.add_plot_provider(Box::new(TaCatalogPlotProvider::new(
        meta.id.to_string(),
        parsed_params,
    )));
    Ok(())
}

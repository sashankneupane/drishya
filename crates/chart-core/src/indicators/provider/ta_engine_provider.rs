//! Native indicator provider backed by `ta-engine` generic runtime compute.

use crate::indicators::contracts::{IndicatorParamValue, NormalizedMultiSeries, NormalizedSeries};
use crate::indicators::engine::types::IndicatorComputeRequest;
use crate::indicators::engine::IndicatorComputeProvider;
use crate::indicators::error::IndicatorError;

pub struct TaEngineProvider;

impl TaEngineProvider {
    pub fn new() -> Self {
        Self
    }
}

impl Default for TaEngineProvider {
    fn default() -> Self {
        Self::new()
    }
}

impl IndicatorComputeProvider for TaEngineProvider {
    fn compute(
        &self,
        request: &IndicatorComputeRequest,
    ) -> Result<NormalizedMultiSeries, IndicatorError> {
        request.validate()?;

        let params = serde_json::Value::Object(
            request
                .spec
                .params
                .iter()
                // Internal transport keys are used by chart workspace identity and
                // must never be forwarded to ta-engine runtime param validation.
                .filter(|(name, _)| !name.starts_with("__"))
                .map(|(name, value)| (name.clone(), param_value_to_json(value)))
                .collect(),
        );

        let runtime_request = ta_engine::ComputeIndicatorRequest {
            indicator_id: request.spec.id.0.clone(),
            params,
            ohlcv: ta_engine::OhlcvInput {
                timestamps: request.ohlcv.timestamps.clone(),
                open: request.ohlcv.open.clone(),
                high: request.ohlcv.high.clone(),
                low: request.ohlcv.low.clone(),
                close: request.ohlcv.close.clone(),
                volume: request.ohlcv.volume.clone(),
            },
            instance_id: None,
        };

        let runtime_out =
            ta_engine::compute_indicator(runtime_request).map_err(map_runtime_error)?;

        let mut lines = Vec::with_capacity(runtime_out.outputs.len());
        for output in runtime_out.outputs {
            if output.values.len() != request.ohlcv.timestamps.len() {
                return Err(IndicatorError::LineLengthMismatch {
                    expected: request.ohlcv.timestamps.len(),
                    got: output.values.len(),
                    line: output.name,
                });
            }
            lines.push(NormalizedSeries {
                name: output.name,
                timestamps: request.ohlcv.timestamps.clone(),
                values: output.values,
            });
        }

        let result = NormalizedMultiSeries { lines };
        result.validate()?;
        Ok(result)
    }
}

fn param_value_to_json(value: &IndicatorParamValue) -> serde_json::Value {
    match value {
        IndicatorParamValue::Int(v) => serde_json::Value::from(*v),
        IndicatorParamValue::Float(v) => serde_json::Value::from(*v),
        IndicatorParamValue::Bool(v) => serde_json::Value::from(*v),
        IndicatorParamValue::Text(v) => serde_json::Value::from(v.clone()),
    }
}

fn map_runtime_error(err: ta_engine::ComputeRuntimeError) -> IndicatorError {
    match err.code.as_str() {
        "unknown_indicator" | "unsupported_indicator" => {
            IndicatorError::UnsupportedIndicator { id: err.message }
        }
        "invalid_param" => IndicatorError::InvalidParameter {
            name: "params".to_string(),
            reason: err.message,
        },
        "missing_input_field" => IndicatorError::InvalidParameter {
            name: "input".to_string(),
            reason: err.message,
        },
        _ => IndicatorError::InvalidParameter {
            name: "runtime".to_string(),
            reason: err.message,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::indicators::contracts::{IndicatorId, IndicatorParamValue, IndicatorSpec};
    use crate::indicators::engine::types::{IndicatorComputeContext, OhlcvBatch};

    fn sample_request(
        id: &str,
        params: Vec<(String, IndicatorParamValue)>,
    ) -> IndicatorComputeRequest {
        IndicatorComputeRequest {
            context: IndicatorComputeContext {
                symbol: "BTCUSD".to_string(),
                timeframe: "1m".to_string(),
            },
            spec: IndicatorSpec {
                id: IndicatorId(id.to_string()),
                params,
            },
            ohlcv: OhlcvBatch {
                timestamps: (1..=30).collect(),
                open: (1..=30).map(|v| v as f64).collect(),
                high: (1..=30).map(|v| v as f64 + 1.0).collect(),
                low: (1..=30).map(|v| v as f64 - 1.0).collect(),
                close: (1..=30).map(|v| v as f64 + 0.5).collect(),
                volume: Some((1..=30).map(|v| 1000.0 + v as f64).collect()),
            },
        }
    }

    #[test]
    fn provider_computes_sma_with_expected_shape() {
        let provider = TaEngineProvider::new();
        let req = sample_request(
            "sma",
            vec![("period".to_string(), IndicatorParamValue::Int(5))],
        );
        let out = provider.compute(&req).unwrap();
        assert_eq!(out.lines.len(), 1);
        assert_eq!(out.lines[0].name, "result");
        assert_eq!(out.lines[0].timestamps.len(), req.ohlcv.len());
        assert_eq!(out.lines[0].values.len(), req.ohlcv.len());
    }

    #[test]
    fn provider_computes_macd_three_lines_with_stable_ordering() {
        let provider = TaEngineProvider::new();
        let req = sample_request(
            "macd",
            vec![
                ("fast_period".to_string(), IndicatorParamValue::Int(12)),
                ("slow_period".to_string(), IndicatorParamValue::Int(26)),
                ("signal_period".to_string(), IndicatorParamValue::Int(9)),
            ],
        );
        let out = provider.compute(&req).unwrap();
        let names: Vec<&str> = out.lines.iter().map(|l| l.name.as_str()).collect();
        assert_eq!(names, vec!["macd", "signal", "histogram"]);
        assert_eq!(out.lines[0].values.len(), req.ohlcv.len());
        assert_eq!(out.lines[1].values.len(), req.ohlcv.len());
        assert_eq!(out.lines[2].values.len(), req.ohlcv.len());
    }
}

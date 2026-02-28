//! Native indicator provider backed by `ta-engine`.

use crate::indicators::contracts::{
    IndicatorParamValue, IndicatorSpec, NormalizedMultiSeries, NormalizedSeries,
};
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
        let id = request.spec.id.0.as_str();
        let close = &request.ohlcv.close;
        let timestamps = request.ohlcv.timestamps.clone();

        let lines = match id {
            "sma" => {
                let period = get_usize_param(&request.spec, "period", Some(20))?;
                vec![make_line(
                    "sma",
                    timestamps,
                    ta_engine::rolling::rolling_mean(close, period),
                )]
            }
            "ema" => {
                let period = get_usize_param(&request.spec, "period", Some(20))?;
                vec![make_line(
                    "ema",
                    timestamps,
                    ta_engine::moving_averages::ema(close, period),
                )]
            }
            "rsi" => {
                let period = get_usize_param(&request.spec, "period", Some(14))?;
                vec![make_line(
                    "rsi",
                    timestamps,
                    ta_engine::momentum::rsi(close, period),
                )]
            }
            "macd" => {
                let fast = get_usize_param(&request.spec, "fast_period", Some(12))?;
                let slow = get_usize_param(&request.spec, "slow_period", Some(26))?;
                let signal = get_usize_param(&request.spec, "signal_period", Some(9))?;
                if fast >= slow {
                    return Err(IndicatorError::InvalidParameter {
                        name: "fast_period/slow_period".to_string(),
                        reason: "fast_period must be less than slow_period".to_string(),
                    });
                }
                let (macd, signal_line, histogram) = ta_engine::trend::macd(close, fast, slow, signal);
                vec![
                    make_line("macd", timestamps.clone(), macd),
                    make_line("signal", timestamps.clone(), signal_line),
                    make_line("histogram", timestamps, histogram),
                ]
            }
            "bbands" => {
                let period = get_usize_param(&request.spec, "period", Some(20))?;
                let std_dev = get_f64_param(&request.spec, "std_dev", Some(2.0))?;
                let (upper, middle, lower) = ta_engine::volatility::bbands(close, period, std_dev);
                vec![
                    make_line("upper", timestamps.clone(), upper),
                    make_line("middle", timestamps.clone(), middle),
                    make_line("lower", timestamps, lower),
                ]
            }
            _ => {
                return Err(IndicatorError::UnsupportedIndicator {
                    id: id.to_string(),
                });
            }
        };

        let result = NormalizedMultiSeries { lines };
        result.validate()?;
        Ok(result)
    }
}

fn get_usize_param(
    spec: &IndicatorSpec,
    name: &str,
    default: Option<usize>,
) -> Result<usize, IndicatorError> {
    match spec.params.iter().find(|(k, _)| k == name) {
        Some((_, IndicatorParamValue::Int(v))) if *v > 0 => Ok(*v as usize),
        Some((_, IndicatorParamValue::Int(_))) => Err(IndicatorError::InvalidParameter {
            name: name.to_string(),
            reason: "must be > 0".to_string(),
        }),
        Some(_) => Err(IndicatorError::InvalidParameter {
            name: name.to_string(),
            reason: "must be integer".to_string(),
        }),
        None => default.ok_or_else(|| IndicatorError::MissingParameter {
            name: name.to_string(),
        }),
    }
}

fn get_f64_param(
    spec: &IndicatorSpec,
    name: &str,
    default: Option<f64>,
) -> Result<f64, IndicatorError> {
    match spec.params.iter().find(|(k, _)| k == name) {
        Some((_, IndicatorParamValue::Float(v))) if *v >= 0.0 => Ok(*v),
        Some((_, IndicatorParamValue::Int(v))) if *v >= 0 => Ok(*v as f64),
        Some((_, IndicatorParamValue::Int(_))) | Some((_, IndicatorParamValue::Float(_))) => {
            Err(IndicatorError::InvalidParameter {
                name: name.to_string(),
                reason: "must be >= 0".to_string(),
            })
        }
        Some(_) => Err(IndicatorError::InvalidParameter {
            name: name.to_string(),
            reason: "must be numeric".to_string(),
        }),
        None => default.ok_or_else(|| IndicatorError::MissingParameter {
            name: name.to_string(),
        }),
    }
}

fn make_line(name: &str, timestamps: Vec<i64>, raw: Vec<f64>) -> NormalizedSeries {
    let values = raw
        .into_iter()
        .map(|v| if v.is_nan() { None } else { Some(v) })
        .collect();
    NormalizedSeries {
        name: name.to_string(),
        timestamps,
        values,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::indicators::contracts::IndicatorId;
    use crate::indicators::engine::types::{IndicatorComputeContext, OhlcvBatch};

    fn sample_request(id: &str, params: Vec<(String, IndicatorParamValue)>) -> IndicatorComputeRequest {
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
        let req = sample_request("sma", vec![("period".to_string(), IndicatorParamValue::Int(5))]);
        let out = provider.compute(&req).unwrap();
        assert_eq!(out.lines.len(), 1);
        assert_eq!(out.lines[0].name, "sma");
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

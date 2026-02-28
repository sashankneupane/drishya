//! Shared request/context types for indicator compute providers.

use crate::indicators::contracts::IndicatorSpec;
use crate::indicators::error::IndicatorError;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IndicatorComputeContext {
    pub symbol: String,
    pub timeframe: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct OhlcvBatch {
    pub timestamps: Vec<i64>,
    pub open: Vec<f64>,
    pub high: Vec<f64>,
    pub low: Vec<f64>,
    pub close: Vec<f64>,
    pub volume: Option<Vec<f64>>,
}

impl OhlcvBatch {
    pub fn len(&self) -> usize {
        self.timestamps.len()
    }

    pub fn is_empty(&self) -> bool {
        self.timestamps.is_empty()
    }

    pub fn validate(&self) -> Result<(), IndicatorError> {
        let expected = self.timestamps.len();
        if expected == 0 {
            return Err(IndicatorError::EmptySeries);
        }
        if self.timestamps.windows(2).any(|w| w[1] < w[0]) {
            return Err(IndicatorError::NonMonotonicTimestamps);
        }
        for (name, got) in [
            ("open", self.open.len()),
            ("high", self.high.len()),
            ("low", self.low.len()),
            ("close", self.close.len()),
        ] {
            if got != expected {
                return Err(IndicatorError::LineLengthMismatch {
                    expected,
                    got,
                    line: name.to_string(),
                });
            }
        }
        if let Some(volume) = self.volume.as_ref() {
            if volume.len() != expected {
                return Err(IndicatorError::LineLengthMismatch {
                    expected,
                    got: volume.len(),
                    line: "volume".to_string(),
                });
            }
        }
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct IndicatorComputeRequest {
    pub context: IndicatorComputeContext,
    pub spec: IndicatorSpec,
    pub ohlcv: OhlcvBatch,
}

impl IndicatorComputeRequest {
    pub fn validate(&self) -> Result<(), IndicatorError> {
        self.ohlcv.validate()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_batch() -> OhlcvBatch {
        OhlcvBatch {
            timestamps: vec![1, 2, 3],
            open: vec![10.0, 11.0, 12.0],
            high: vec![11.0, 12.0, 13.0],
            low: vec![9.0, 10.0, 11.0],
            close: vec![10.5, 11.5, 12.5],
            volume: Some(vec![100.0, 200.0, 300.0]),
        }
    }

    #[test]
    fn ohlcv_validate_rejects_non_monotonic_timestamps() {
        let mut batch = sample_batch();
        batch.timestamps = vec![1, 3, 2];
        assert_eq!(
            batch.validate().unwrap_err(),
            IndicatorError::NonMonotonicTimestamps
        );
    }

    #[test]
    fn ohlcv_validate_rejects_mismatched_lengths() {
        let mut batch = sample_batch();
        batch.close.pop();
        assert_eq!(
            batch.validate().unwrap_err(),
            IndicatorError::LineLengthMismatch {
                expected: 3,
                got: 2,
                line: "close".to_string()
            }
        );
    }
}

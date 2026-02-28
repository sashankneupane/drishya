//! Canonical contracts between indicator compute providers and chart rendering.

use std::collections::HashSet;

use super::error::IndicatorError;

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct IndicatorId(pub String);

#[derive(Debug, Clone, PartialEq)]
pub enum IndicatorParamValue {
    Int(i64),
    Float(f64),
    Bool(bool),
    Text(String),
}

#[derive(Debug, Clone, PartialEq)]
pub struct IndicatorSpec {
    pub id: IndicatorId,
    pub params: Vec<(String, IndicatorParamValue)>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IndicatorParamSchema {
    pub name: String,
    pub kind: String,
    pub required: bool,
}

#[derive(Debug, Clone, PartialEq)]
pub struct NormalizedSeries {
    pub name: String,
    pub timestamps: Vec<i64>,
    pub values: Vec<Option<f64>>,
}

impl NormalizedSeries {
    pub fn validate(&self) -> Result<(), IndicatorError> {
        if self.name.trim().is_empty() {
            return Err(IndicatorError::EmptyLineName);
        }
        if self.timestamps.is_empty() || self.values.is_empty() {
            return Err(IndicatorError::EmptySeries);
        }
        if self.timestamps.len() != self.values.len() {
            return Err(IndicatorError::TimestampValueLengthMismatch {
                timestamps: self.timestamps.len(),
                values: self.values.len(),
            });
        }
        if self.timestamps.windows(2).any(|w| w[1] < w[0]) {
            return Err(IndicatorError::NonMonotonicTimestamps);
        }
        Ok(())
    }

    pub fn len(&self) -> usize {
        self.timestamps.len()
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct NormalizedMultiSeries {
    pub lines: Vec<NormalizedSeries>,
}

impl NormalizedMultiSeries {
    pub fn validate(&self) -> Result<(), IndicatorError> {
        let Some(primary) = self.lines.first() else {
            return Err(IndicatorError::EmptyMultiSeries);
        };
        primary.validate()?;

        let expected_len = primary.len();
        let expected_ts = &primary.timestamps;
        let mut seen = HashSet::new();
        seen.insert(primary.name.as_str());

        for line in self.lines.iter().skip(1) {
            line.validate()?;
            if !seen.insert(line.name.as_str()) {
                return Err(IndicatorError::DuplicateLineName {
                    line: line.name.clone(),
                });
            }
            if line.len() != expected_len {
                return Err(IndicatorError::LineLengthMismatch {
                    expected: expected_len,
                    got: line.len(),
                    line: line.name.clone(),
                });
            }
            if &line.timestamps != expected_ts {
                return Err(IndicatorError::LineTimestampMismatch {
                    line: line.name.clone(),
                });
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalized_series_rejects_mismatched_lengths() {
        let series = NormalizedSeries {
            name: "rsi".to_string(),
            timestamps: vec![1, 2, 3],
            values: vec![Some(1.0), Some(2.0)],
        };
        assert_eq!(
            series.validate().unwrap_err(),
            IndicatorError::TimestampValueLengthMismatch {
                timestamps: 3,
                values: 2
            }
        );
    }

    #[test]
    fn normalized_series_rejects_non_monotonic_timestamps() {
        let series = NormalizedSeries {
            name: "ema".to_string(),
            timestamps: vec![1, 3, 2],
            values: vec![Some(1.0), Some(2.0), Some(3.0)],
        };
        assert_eq!(
            series.validate().unwrap_err(),
            IndicatorError::NonMonotonicTimestamps
        );
    }

    #[test]
    fn normalized_multi_series_rejects_ordering_or_alignment_drift() {
        let primary = NormalizedSeries {
            name: "macd".to_string(),
            timestamps: vec![10, 20, 30],
            values: vec![Some(1.0), Some(2.0), Some(3.0)],
        };
        let drifted = NormalizedSeries {
            name: "signal".to_string(),
            timestamps: vec![10, 25, 30],
            values: vec![Some(1.0), Some(2.0), Some(3.0)],
        };
        let multi = NormalizedMultiSeries {
            lines: vec![primary, drifted],
        };
        assert_eq!(
            multi.validate().unwrap_err(),
            IndicatorError::LineTimestampMismatch {
                line: "signal".to_string()
            }
        );
    }
}

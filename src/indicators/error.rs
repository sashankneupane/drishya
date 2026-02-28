//! Typed errors for indicator contract validation and compute integration.

use std::fmt::{Display, Formatter};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum IndicatorError {
    EmptySeries,
    EmptyLineName,
    EmptyMultiSeries,
    TimestampValueLengthMismatch {
        timestamps: usize,
        values: usize,
    },
    NonMonotonicTimestamps,
    LineLengthMismatch {
        expected: usize,
        got: usize,
        line: String,
    },
    LineTimestampMismatch {
        line: String,
    },
    DuplicateLineName {
        line: String,
    },
    UnsupportedIndicator {
        id: String,
    },
    MissingParameter {
        name: String,
    },
    InvalidParameter {
        name: String,
        reason: String,
    },
}

impl Display for IndicatorError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            IndicatorError::EmptySeries => write!(f, "series must not be empty"),
            IndicatorError::EmptyLineName => write!(f, "series line name must not be empty"),
            IndicatorError::EmptyMultiSeries => {
                write!(f, "multi-series must include at least one line")
            }
            IndicatorError::TimestampValueLengthMismatch { timestamps, values } => {
                write!(
                    f,
                    "timestamps/value length mismatch: timestamps={}, values={}",
                    timestamps, values
                )
            }
            IndicatorError::NonMonotonicTimestamps => write!(f, "timestamps are not monotonic"),
            IndicatorError::LineLengthMismatch {
                expected,
                got,
                line,
            } => {
                write!(
                    f,
                    "line '{}' length mismatch: expected {}, got {}",
                    line, expected, got
                )
            }
            IndicatorError::LineTimestampMismatch { line } => {
                write!(
                    f,
                    "line '{}' timestamps do not align with primary line",
                    line
                )
            }
            IndicatorError::DuplicateLineName { line } => {
                write!(f, "duplicate line name in multi-series: '{}'", line)
            }
            IndicatorError::UnsupportedIndicator { id } => {
                write!(f, "unsupported indicator id '{}'", id)
            }
            IndicatorError::MissingParameter { name } => {
                write!(f, "missing required parameter '{}'", name)
            }
            IndicatorError::InvalidParameter { name, reason } => {
                write!(f, "invalid parameter '{}': {}", name, reason)
            }
        }
    }
}

impl std::error::Error for IndicatorError {}

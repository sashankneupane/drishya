use std::fmt;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum IndicatorError {
    EmptyInput,
    InvalidPeriod { period: usize },
    MismatchedLengths,
    NonMonotonicTimestamps,
}

impl fmt::Display for IndicatorError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            IndicatorError::EmptyInput => write!(f, "input series is empty"),
            IndicatorError::InvalidPeriod { period } => write!(f, "invalid period: {period}"),
            IndicatorError::MismatchedLengths => write!(f, "input lengths do not match"),
            IndicatorError::NonMonotonicTimestamps => write!(f, "timestamps are not monotonic"),
        }
    }
}

impl std::error::Error for IndicatorError {}

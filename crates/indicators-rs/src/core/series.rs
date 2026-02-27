use super::error::IndicatorError;

#[derive(Debug, Clone, PartialEq)]
pub struct Series {
    pub timestamps: Vec<i64>,
    pub values: Vec<Option<f64>>,
}

impl Series {
    pub fn new(timestamps: Vec<i64>, values: Vec<Option<f64>>) -> Result<Self, IndicatorError> {
        if timestamps.is_empty() || values.is_empty() {
            return Err(IndicatorError::EmptyInput);
        }
        if timestamps.len() != values.len() {
            return Err(IndicatorError::MismatchedLengths);
        }
        if timestamps.windows(2).any(|w| w[1] < w[0]) {
            return Err(IndicatorError::NonMonotonicTimestamps);
        }
        Ok(Self { timestamps, values })
    }

    pub fn len(&self) -> usize {
        self.timestamps.len()
    }

    pub fn is_empty(&self) -> bool {
        self.timestamps.is_empty()
    }
}

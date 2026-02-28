//! Indicator compute engine abstractions.

pub mod types;

use crate::indicators::contracts::NormalizedMultiSeries;
use crate::indicators::error::IndicatorError;

use self::types::IndicatorComputeRequest;

pub trait IndicatorComputeProvider {
    fn compute(
        &self,
        request: &IndicatorComputeRequest,
    ) -> Result<NormalizedMultiSeries, IndicatorError>;
}

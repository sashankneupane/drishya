use indicators_rs::core::{IndicatorError, Series};

#[test]
fn series_rejects_non_monotonic_timestamps() {
    let err = Series::new(vec![2, 1], vec![Some(1.0), Some(2.0)]).unwrap_err();
    assert_eq!(err, IndicatorError::NonMonotonicTimestamps);
}

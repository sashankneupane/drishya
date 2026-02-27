use crate::core::error::IndicatorError;

pub fn vwap(
    high: &[f64],
    low: &[f64],
    close: &[f64],
    volume: &[f64],
) -> Result<Vec<Option<f64>>, IndicatorError> {
    if high.is_empty() || low.is_empty() || close.is_empty() || volume.is_empty() {
        return Err(IndicatorError::EmptyInput);
    }
    if high.len() != low.len() || low.len() != close.len() || close.len() != volume.len() {
        return Err(IndicatorError::MismatchedLengths);
    }

    let mut out = vec![None; close.len()];
    let mut cumulative_pv = 0.0;
    let mut cumulative_vol = 0.0;
    for i in 0..close.len() {
        let typical = (high[i] + low[i] + close[i]) / 3.0;
        cumulative_pv += typical * volume[i];
        cumulative_vol += volume[i];
        out[i] = if cumulative_vol == 0.0 {
            None
        } else {
            Some(cumulative_pv / cumulative_vol)
        };
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::vwap;

    #[test]
    fn vwap_handles_zero_volume_prefix() {
        let high = vec![10.0, 11.0, 12.0];
        let low = vec![9.0, 10.0, 11.0];
        let close = vec![9.5, 10.5, 11.5];
        let volume = vec![0.0, 100.0, 100.0];
        let out = vwap(&high, &low, &close, &volume).unwrap();
        assert_eq!(out[0], None);
        assert!(out[1].is_some());
        assert!(out[2].unwrap() > out[1].unwrap() - 1.0);
    }
}

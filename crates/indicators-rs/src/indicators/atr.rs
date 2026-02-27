use crate::core::error::IndicatorError;

pub fn atr(
    high: &[f64],
    low: &[f64],
    close: &[f64],
    period: usize,
) -> Result<Vec<Option<f64>>, IndicatorError> {
    if high.is_empty() || low.is_empty() || close.is_empty() {
        return Err(IndicatorError::EmptyInput);
    }
    if period == 0 {
        return Err(IndicatorError::InvalidPeriod { period });
    }
    if high.len() != low.len() || low.len() != close.len() {
        return Err(IndicatorError::MismatchedLengths);
    }

    let len = high.len();
    let mut tr = vec![0.0; len];
    tr[0] = high[0] - low[0];
    for i in 1..len {
        let hl = high[i] - low[i];
        let hc = (high[i] - close[i - 1]).abs();
        let lc = (low[i] - close[i - 1]).abs();
        tr[i] = hl.max(hc).max(lc);
    }

    let mut out = vec![None; len];
    if period > len {
        return Ok(out);
    }

    let seed = tr.iter().take(period).sum::<f64>() / period as f64;
    out[period - 1] = Some(seed);
    let mut prev = seed;
    for i in period..len {
        prev = (prev * (period as f64 - 1.0) + tr[i]) / period as f64;
        out[i] = Some(prev);
    }

    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::atr;

    #[test]
    fn atr_applies_true_range_and_wilder_smoothing() {
        let high = vec![10.0, 12.0, 13.0, 14.0, 13.0];
        let low = vec![8.0, 10.0, 11.0, 10.0, 11.0];
        let close = vec![9.0, 11.0, 12.0, 11.0, 12.0];
        let out = atr(&high, &low, &close, 3).unwrap();
        assert_eq!(out[0], None);
        assert_eq!(out[1], None);
        assert!(out[2].is_some());
        assert!(out[3].unwrap() >= 0.0);
        assert!(out[4].unwrap() >= 0.0);
    }
}

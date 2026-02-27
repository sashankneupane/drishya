use crate::core::error::IndicatorError;

pub fn ema(values: &[f64], period: usize) -> Result<Vec<Option<f64>>, IndicatorError> {
    if values.is_empty() {
        return Err(IndicatorError::EmptyInput);
    }
    if period == 0 {
        return Err(IndicatorError::InvalidPeriod { period });
    }

    let mut out = vec![None; values.len()];
    if period > values.len() {
        return Ok(out);
    }

    let alpha = 2.0 / (period as f64 + 1.0);

    let seed_sum: f64 = values.iter().take(period).sum();
    let mut prev = seed_sum / period as f64;
    out[period - 1] = Some(prev);

    for i in period..values.len() {
        let next = alpha * values[i] + (1.0 - alpha) * prev;
        out[i] = Some(next);
        prev = next;
    }

    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::ema;

    #[test]
    fn ema_seeded_from_sma_window() {
        let v = vec![1.0, 2.0, 3.0, 4.0, 5.0];
        let out = ema(&v, 3).unwrap();
        assert_eq!(out[0], None);
        assert_eq!(out[1], None);
        assert_eq!(out[2], Some(2.0));
        assert!((out[3].unwrap() - 3.0).abs() < 1e-9);
        assert!((out[4].unwrap() - 4.0).abs() < 1e-9);
    }
}

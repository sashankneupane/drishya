use crate::core::error::IndicatorError;

pub fn rsi(values: &[f64], period: usize) -> Result<Vec<Option<f64>>, IndicatorError> {
    if values.is_empty() {
        return Err(IndicatorError::EmptyInput);
    }
    if period == 0 {
        return Err(IndicatorError::InvalidPeriod { period });
    }

    let len = values.len();
    let mut out = vec![None; len];
    if len <= period {
        return Ok(out);
    }

    let mut gain_sum = 0.0;
    let mut loss_sum = 0.0;
    for i in 1..=period {
        let delta = values[i] - values[i - 1];
        if delta >= 0.0 {
            gain_sum += delta;
        } else {
            loss_sum += -delta;
        }
    }

    let mut avg_gain = gain_sum / period as f64;
    let mut avg_loss = loss_sum / period as f64;
    out[period] = Some(rsi_from_avgs(avg_gain, avg_loss));

    for i in (period + 1)..len {
        let delta = values[i] - values[i - 1];
        let gain = delta.max(0.0);
        let loss = (-delta).max(0.0);
        avg_gain = (avg_gain * (period as f64 - 1.0) + gain) / period as f64;
        avg_loss = (avg_loss * (period as f64 - 1.0) + loss) / period as f64;
        out[i] = Some(rsi_from_avgs(avg_gain, avg_loss));
    }

    Ok(out)
}

fn rsi_from_avgs(avg_gain: f64, avg_loss: f64) -> f64 {
    if avg_loss == 0.0 {
        return 100.0;
    }
    let rs = avg_gain / avg_loss;
    100.0 - 100.0 / (1.0 + rs)
}

#[cfg(test)]
mod tests {
    use super::rsi;

    #[test]
    fn rsi_warmup_and_range() {
        let values = vec![
            100.0, 101.0, 102.0, 100.0, 99.0, 98.0, 100.0, 102.0, 101.0, 103.0, 104.0,
        ];
        let out = rsi(&values, 5).unwrap();
        assert_eq!(out[0], None);
        assert_eq!(out[4], None);
        assert!(out[5].is_some());
        for v in out.into_iter().flatten() {
            assert!((0.0..=100.0).contains(&v));
        }
    }

    #[test]
    fn rsi_returns_100_for_strict_uptrend() {
        let values = vec![1.0, 2.0, 3.0, 4.0, 5.0, 6.0];
        let out = rsi(&values, 3).unwrap();
        assert_eq!(out[3], Some(100.0));
        assert_eq!(out[4], Some(100.0));
        assert_eq!(out[5], Some(100.0));
    }
}

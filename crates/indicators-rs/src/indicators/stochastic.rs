use crate::core::error::IndicatorError;

#[derive(Debug, Clone, PartialEq)]
pub struct StochasticOutput {
    pub k: Vec<Option<f64>>,
    pub d: Vec<Option<f64>>,
}

pub fn stochastic(
    high: &[f64],
    low: &[f64],
    close: &[f64],
    k_period: usize,
    d_period: usize,
    smooth: usize,
) -> Result<StochasticOutput, IndicatorError> {
    if high.is_empty() || low.is_empty() || close.is_empty() {
        return Err(IndicatorError::EmptyInput);
    }
    if high.len() != low.len() || low.len() != close.len() {
        return Err(IndicatorError::MismatchedLengths);
    }
    if k_period == 0 {
        return Err(IndicatorError::InvalidPeriod { period: k_period });
    }
    if d_period == 0 {
        return Err(IndicatorError::InvalidPeriod { period: d_period });
    }
    if smooth == 0 {
        return Err(IndicatorError::InvalidPeriod { period: smooth });
    }

    let len = close.len();
    let mut raw_k = vec![None; len];
    for i in (k_period - 1)..len {
        let start = i + 1 - k_period;
        let hh = high[start..=i]
            .iter()
            .copied()
            .fold(f64::NEG_INFINITY, f64::max);
        let ll = low[start..=i].iter().copied().fold(f64::INFINITY, f64::min);
        let denom = hh - ll;
        raw_k[i] = if denom == 0.0 {
            Some(0.0)
        } else {
            Some(((close[i] - ll) / denom) * 100.0)
        };
    }

    let smoothed_k = rolling_sma_sparse(&raw_k, smooth);
    let d = rolling_sma_sparse(&smoothed_k, d_period);

    Ok(StochasticOutput { k: smoothed_k, d })
}

fn rolling_sma_sparse(values: &[Option<f64>], period: usize) -> Vec<Option<f64>> {
    let mut out = vec![None; values.len()];
    if period == 0 {
        return out;
    }
    for i in 0..values.len() {
        if i + 1 < period {
            continue;
        }
        let start = i + 1 - period;
        let window = &values[start..=i];
        if window.iter().any(Option::is_none) {
            continue;
        }
        let sum = window.iter().flatten().sum::<f64>();
        out[i] = Some(sum / period as f64);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::stochastic;
    use crate::core::IndicatorError;

    #[test]
    fn stochastic_outputs_are_aligned_and_bounded() {
        let high = vec![10.0, 11.0, 12.0, 13.0, 14.0, 13.0, 12.0];
        let low = vec![9.0, 9.5, 10.0, 10.5, 11.0, 10.0, 9.0];
        let close = vec![9.5, 10.8, 11.5, 12.8, 13.2, 11.4, 10.2];
        let out = stochastic(&high, &low, &close, 3, 3, 2).unwrap();
        assert_eq!(out.k.len(), close.len());
        assert_eq!(out.d.len(), close.len());
        for v in out.k.into_iter().chain(out.d.into_iter()).flatten() {
            assert!((0.0..=100.0).contains(&v));
        }
    }

    #[test]
    fn stochastic_rejects_invalid_periods() {
        let high = vec![1.0, 2.0];
        let low = vec![0.5, 1.5];
        let close = vec![0.8, 1.8];
        let err = stochastic(&high, &low, &close, 0, 2, 2).unwrap_err();
        assert_eq!(err, IndicatorError::InvalidPeriod { period: 0 });
    }
}

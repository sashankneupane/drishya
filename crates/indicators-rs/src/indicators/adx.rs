use crate::core::error::IndicatorError;

#[derive(Debug, Clone, PartialEq)]
pub struct AdxOutput {
    pub adx: Vec<Option<f64>>,
    pub plus_di: Vec<Option<f64>>,
    pub minus_di: Vec<Option<f64>>,
}

pub fn adx(
    high: &[f64],
    low: &[f64],
    close: &[f64],
    period: usize,
) -> Result<AdxOutput, IndicatorError> {
    if high.is_empty() || low.is_empty() || close.is_empty() {
        return Err(IndicatorError::EmptyInput);
    }
    if high.len() != low.len() || low.len() != close.len() {
        return Err(IndicatorError::MismatchedLengths);
    }
    if period == 0 {
        return Err(IndicatorError::InvalidPeriod { period });
    }

    let len = high.len();
    let mut tr = vec![0.0; len];
    let mut plus_dm = vec![0.0; len];
    let mut minus_dm = vec![0.0; len];
    for i in 1..len {
        let up = high[i] - high[i - 1];
        let down = low[i - 1] - low[i];
        plus_dm[i] = if up > down && up > 0.0 { up } else { 0.0 };
        minus_dm[i] = if down > up && down > 0.0 { down } else { 0.0 };
        let hl = high[i] - low[i];
        let hc = (high[i] - close[i - 1]).abs();
        let lc = (low[i] - close[i - 1]).abs();
        tr[i] = hl.max(hc).max(lc);
    }

    let atr = wilder_smooth(&tr, period);
    let p_dm = wilder_smooth(&plus_dm, period);
    let m_dm = wilder_smooth(&minus_dm, period);

    let mut plus_di = vec![None; len];
    let mut minus_di = vec![None; len];
    let mut dx = vec![None; len];
    for i in 0..len {
        if let (Some(a), Some(p), Some(m)) = (atr[i], p_dm[i], m_dm[i]) {
            if a == 0.0 {
                plus_di[i] = Some(0.0);
                minus_di[i] = Some(0.0);
                dx[i] = Some(0.0);
                continue;
            }
            let pdi = (p / a) * 100.0;
            let mdi = (m / a) * 100.0;
            plus_di[i] = Some(pdi);
            minus_di[i] = Some(mdi);
            let denom = pdi + mdi;
            dx[i] = if denom == 0.0 {
                Some(0.0)
            } else {
                Some(((pdi - mdi).abs() / denom) * 100.0)
            };
        }
    }

    let adx = wilder_smooth_sparse(&dx, period);
    Ok(AdxOutput {
        adx,
        plus_di,
        minus_di,
    })
}

fn wilder_smooth(values: &[f64], period: usize) -> Vec<Option<f64>> {
    let mut out = vec![None; values.len()];
    if period == 0 || period > values.len() {
        return out;
    }
    let mut smoothed = values.iter().take(period).sum::<f64>();
    out[period - 1] = Some(smoothed);
    for i in period..values.len() {
        smoothed = smoothed - (smoothed / period as f64) + values[i];
        out[i] = Some(smoothed);
    }
    out
}

fn wilder_smooth_sparse(values: &[Option<f64>], period: usize) -> Vec<Option<f64>> {
    let mut out = vec![None; values.len()];
    let first = values.iter().position(Option::is_some);
    let Some(start) = first else {
        return out;
    };
    let dense: Vec<f64> = values[start..].iter().flatten().copied().collect();
    if dense.len() < period {
        return out;
    }
    let mut sum = dense.iter().take(period).sum::<f64>();
    out[start + period - 1] = Some(sum / period as f64);
    for i in period..dense.len() {
        sum = sum - (sum / period as f64) + dense[i];
        out[start + i] = Some(sum / period as f64);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::adx;

    #[test]
    fn adx_returns_three_aligned_outputs() {
        let high = vec![10.0, 11.0, 12.0, 11.0, 12.0, 13.0, 14.0, 13.5, 14.5];
        let low = vec![9.0, 10.0, 10.5, 10.0, 10.8, 11.5, 12.5, 12.7, 13.0];
        let close = vec![9.5, 10.8, 11.2, 10.3, 11.8, 12.7, 13.2, 13.0, 14.0];
        let out = adx(&high, &low, &close, 3).unwrap();
        assert_eq!(out.adx.len(), close.len());
        assert_eq!(out.plus_di.len(), close.len());
        assert_eq!(out.minus_di.len(), close.len());
        for v in out
            .adx
            .into_iter()
            .chain(out.plus_di)
            .chain(out.minus_di)
            .flatten()
        {
            assert!((0.0..=100.0).contains(&v));
        }
    }
}

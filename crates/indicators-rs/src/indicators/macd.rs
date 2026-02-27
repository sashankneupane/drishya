use crate::core::error::IndicatorError;
use crate::indicators::ema;

#[derive(Debug, Clone, PartialEq)]
pub struct MacdOutput {
    pub line: Vec<Option<f64>>,
    pub signal: Vec<Option<f64>>,
    pub histogram: Vec<Option<f64>>,
}

pub fn macd(
    values: &[f64],
    fast: usize,
    slow: usize,
    signal: usize,
) -> Result<MacdOutput, IndicatorError> {
    if values.is_empty() {
        return Err(IndicatorError::EmptyInput);
    }
    if fast == 0 {
        return Err(IndicatorError::InvalidPeriod { period: fast });
    }
    if slow == 0 {
        return Err(IndicatorError::InvalidPeriod { period: slow });
    }
    if signal == 0 {
        return Err(IndicatorError::InvalidPeriod { period: signal });
    }
    if fast >= slow {
        return Err(IndicatorError::InvalidPeriod { period: fast });
    }

    let fast_ema = ema(values, fast)?;
    let slow_ema = ema(values, slow)?;

    let line: Vec<Option<f64>> = fast_ema
        .iter()
        .zip(slow_ema.iter())
        .map(|(f, s)| match (f, s) {
            (Some(fv), Some(sv)) => Some(fv - sv),
            _ => None,
        })
        .collect();

    let line_values: Vec<f64> = line.iter().flatten().copied().collect();
    let signal_sparse = ema(&line_values, signal)?;
    let first_line_idx = line.iter().position(Option::is_some);

    let mut signal_full = vec![None; values.len()];
    if let Some(start) = first_line_idx {
        for (i, maybe) in signal_sparse.into_iter().enumerate() {
            signal_full[start + i] = maybe;
        }
    }

    let histogram: Vec<Option<f64>> = line
        .iter()
        .zip(signal_full.iter())
        .map(|(l, s)| match (l, s) {
            (Some(lv), Some(sv)) => Some(lv - sv),
            _ => None,
        })
        .collect();

    Ok(MacdOutput {
        line,
        signal: signal_full,
        histogram,
    })
}

#[cfg(test)]
mod tests {
    use super::macd;

    #[test]
    fn macd_has_stable_multi_output_lengths() {
        let values = vec![1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0];
        let out = macd(&values, 3, 6, 3).unwrap();
        assert_eq!(out.line.len(), values.len());
        assert_eq!(out.signal.len(), values.len());
        assert_eq!(out.histogram.len(), values.len());
    }

    #[test]
    fn macd_histogram_equals_line_minus_signal() {
        let values = vec![
            100.0, 101.0, 102.0, 101.5, 103.0, 104.0, 104.5, 105.0, 103.0, 102.0, 101.0, 102.0,
            103.0, 104.0,
        ];
        let out = macd(&values, 3, 6, 4).unwrap();
        for i in 0..values.len() {
            match (out.line[i], out.signal[i], out.histogram[i]) {
                (Some(l), Some(s), Some(h)) => assert!((h - (l - s)).abs() < 1e-10),
                (_, _, None) | (None, _, _) | (_, None, _) => {}
            }
        }
    }
}

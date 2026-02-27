use crate::core::error::IndicatorError;

pub fn sma(values: &[f64], period: usize) -> Result<Vec<Option<f64>>, IndicatorError> {
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

    let mut sum = 0.0;
    for i in 0..values.len() {
        sum += values[i];
        if i >= period {
            sum -= values[i - period];
        }
        if i + 1 >= period {
            out[i] = Some(sum / period as f64);
        }
    }

    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::sma;

    #[test]
    fn sma_basic() {
        let v = vec![1.0, 2.0, 3.0, 4.0, 5.0];
        let out = sma(&v, 3).unwrap();
        assert_eq!(out, vec![None, None, Some(2.0), Some(3.0), Some(4.0)]);
    }
}

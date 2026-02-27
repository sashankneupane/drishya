use crate::core::error::IndicatorError;

pub fn obv(close: &[f64], volume: &[f64]) -> Result<Vec<Option<f64>>, IndicatorError> {
    if close.is_empty() || volume.is_empty() {
        return Err(IndicatorError::EmptyInput);
    }
    if close.len() != volume.len() {
        return Err(IndicatorError::MismatchedLengths);
    }

    let mut out = vec![None; close.len()];
    let mut running = 0.0;
    out[0] = Some(running);
    for i in 1..close.len() {
        if close[i] > close[i - 1] {
            running += volume[i];
        } else if close[i] < close[i - 1] {
            running -= volume[i];
        }
        out[i] = Some(running);
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::obv;

    #[test]
    fn obv_accumulates_on_close_direction() {
        let close = vec![10.0, 11.0, 10.5, 10.5, 12.0];
        let volume = vec![100.0, 50.0, 30.0, 20.0, 80.0];
        let out = obv(&close, &volume).unwrap();
        assert_eq!(
            out,
            vec![Some(0.0), Some(50.0), Some(20.0), Some(20.0), Some(100.0)]
        );
    }
}

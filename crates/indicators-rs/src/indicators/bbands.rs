use crate::core::error::IndicatorError;
use crate::indicators::sma;

#[derive(Debug, Clone, PartialEq)]
pub struct BbandsOutput {
    pub upper: Vec<Option<f64>>,
    pub middle: Vec<Option<f64>>,
    pub lower: Vec<Option<f64>>,
}

pub fn bbands(
    values: &[f64],
    period: usize,
    std_mult: f64,
) -> Result<BbandsOutput, IndicatorError> {
    if values.is_empty() {
        return Err(IndicatorError::EmptyInput);
    }
    if period == 0 {
        return Err(IndicatorError::InvalidPeriod { period });
    }

    let middle = sma(values, period)?;
    let mut upper = vec![None; values.len()];
    let mut lower = vec![None; values.len()];

    if period <= values.len() {
        for i in (period - 1)..values.len() {
            let mean = middle[i].expect("middle has value when period window is complete");
            let start = i + 1 - period;
            let variance = values[start..=i]
                .iter()
                .map(|v| {
                    let d = *v - mean;
                    d * d
                })
                .sum::<f64>()
                / period as f64;
            let std = variance.sqrt();
            upper[i] = Some(mean + std_mult * std);
            lower[i] = Some(mean - std_mult * std);
        }
    }

    Ok(BbandsOutput {
        upper,
        middle,
        lower,
    })
}

#[cfg(test)]
mod tests {
    use super::bbands;

    #[test]
    fn bbands_emit_aligned_triple_output() {
        let values = vec![1.0, 2.0, 3.0, 4.0, 5.0];
        let out = bbands(&values, 3, 2.0).unwrap();
        assert_eq!(out.upper.len(), values.len());
        assert_eq!(out.middle.len(), values.len());
        assert_eq!(out.lower.len(), values.len());
        assert_eq!(out.upper[1], None);
        assert!(out.upper[2].unwrap() > out.middle[2].unwrap());
        assert!(out.lower[2].unwrap() < out.middle[2].unwrap());
    }
}

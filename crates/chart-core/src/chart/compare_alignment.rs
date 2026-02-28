use crate::types::Candle;

pub struct AlignedCompareSeries {
    pub id: String,
    pub values: Vec<Option<f64>>,
}

pub fn align_compare_series(
    primary_candles: &[Candle],
    compare_series: &[crate::chart::compare::CompareSeries],
) -> Vec<AlignedCompareSeries> {
    if primary_candles.is_empty() {
        return Vec::new();
    }

    compare_series
        .iter()
        .map(|s| {
            let mut aligned_values = vec![None; primary_candles.len()];
            let mut p_idx = 0;
            let mut s_idx = 0;

            // Two-pointer alignment: O(N + K) where N=primary.len(), K=series.len()
            // Requires both to be sorted by timestamp (primary is always sorted).
            while p_idx < primary_candles.len() && s_idx < s.candles.len() {
                let pts = primary_candles[p_idx].ts;
                let sts = s.candles[s_idx].ts;

                if pts == sts {
                    aligned_values[p_idx] = Some(s.candles[s_idx].close);
                    p_idx += 1;
                    s_idx += 1;
                } else if pts < sts {
                    p_idx += 1;
                } else {
                    s_idx += 1;
                }
            }

            AlignedCompareSeries {
                id: s.id.clone(),
                values: aligned_values,
            }
        })
        .collect()
}

pub fn normalize_aligned_series(series: &mut [AlignedCompareSeries], basis_idx: usize) {
    for s in series {
        let basis = s
            .values
            .iter()
            .enumerate()
            .skip(basis_idx)
            .find_map(|(_, v)| *v)
            .or_else(|| {
                s.values
                    .iter()
                    .enumerate()
                    .take(basis_idx)
                    .rev()
                    .find_map(|(_, v)| *v)
            });
        if let Some(basis) = basis.filter(|b| b.abs() > 1e-9) {
            for v in s.values.iter_mut().flatten() {
                *v = (*v / basis - 1.0) * 100.0;
            }
        }
    }
}

pub fn rebase_normalized_series_to_primary_price(
    series: &mut [AlignedCompareSeries],
    primary_basis_price: f64,
) {
    if !primary_basis_price.is_finite() || primary_basis_price.abs() <= 1e-9 {
        return;
    }
    for s in series {
        for v in s.values.iter_mut().flatten() {
            *v = primary_basis_price * (1.0 + (*v / 100.0));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_align_and_normalize() {
        let primary = vec![
            Candle {
                ts: 100,
                open: 10.0,
                high: 12.0,
                low: 9.0,
                close: 10.0,
                volume: 100.0,
            },
            Candle {
                ts: 200,
                open: 11.0,
                high: 15.0,
                low: 10.0,
                close: 11.0,
                volume: 100.0,
            },
            Candle {
                ts: 300,
                open: 12.0,
                high: 20.0,
                low: 11.0,
                close: 12.0,
                volume: 100.0,
            },
        ];

        let compare = vec![crate::chart::compare::CompareSeries {
            id: "s1".to_string(),
            symbol: "S1".to_string(),
            name: "S1".to_string(),
            visible: true,
            color: "red".to_string(),
            candles: vec![
                Candle {
                    ts: 100,
                    open: 100.0,
                    high: 110.0,
                    low: 90.0,
                    close: 105.0,
                    volume: 100.0,
                },
                Candle {
                    ts: 300,
                    open: 105.0,
                    high: 120.0,
                    low: 100.0,
                    close: 115.5,
                    volume: 100.0,
                },
            ],
        }];

        let mut aligned = align_compare_series(&primary, &compare);
        assert_eq!(aligned.len(), 1);
        assert_eq!(aligned[0].values, vec![Some(105.0), None, Some(115.5)]);

        // Normalize at basis_idx = 0 (basis = 105.0)
        normalize_aligned_series(&mut aligned, 0);
        // (105 / 105 - 1) * 100 = 0
        // (115.5 / 105 - 1) * 100 = (1.1 - 1) * 100 = 10%
        assert!((aligned[0].values[0].unwrap() - 0.0).abs() < 1e-5);
        assert!((aligned[0].values[2].unwrap() - 10.0).abs() < 1e-5);
    }

    #[test]
    fn rebase_places_compare_on_primary_price_scale() {
        let mut aligned = vec![AlignedCompareSeries {
            id: "s1".to_string(),
            values: vec![Some(0.0), Some(10.0), Some(-5.0)],
        }];
        rebase_normalized_series_to_primary_price(&mut aligned, 60_000.0);
        let v = &aligned[0].values;
        assert!((v[0].unwrap() - 60_000.0).abs() < 1e-6);
        assert!((v[1].unwrap() - 66_000.0).abs() < 1e-6);
        assert!((v[2].unwrap() - 57_000.0).abs() < 1e-6);
    }
}

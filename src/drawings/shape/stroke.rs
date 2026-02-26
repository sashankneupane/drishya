use crate::drawings::types::StrokePoint;

/// Simplifies a series of points using a simple distance-based filter.
pub fn simplify_points(points: Vec<StrokePoint>, tolerance: f32) -> Vec<StrokePoint> {
    if points.len() <= 2 {
        return points;
    }

    let mut simplified = Vec::with_capacity(points.len());
    simplified.push(points[0].clone());

    let mut last_point = &points[0];

    // Naive distance-based simplification for now.
    // In a real charting app, we might want RDP or similar,
    // but distance-based is often enough for real-time freehand.
    for p in points.iter().take(points.len() - 1).skip(1) {
        // We use a normalized distance or just separate thresholds since index and price have different scales.
        // A better way is to simplify in pixels, but here we only have world coords.
        let dx = (p.index - last_point.index).abs();
        let dy = (p.price - last_point.price).abs();

        // Very conservative thresholds to avoid losing detail.
        if dx > tolerance || dy > (tolerance as f64 * 0.01) {
            simplified.push(p.clone());
            last_point = p;
        }
    }

    if let Some(last) = points.last() {
        simplified.push(last.clone());
    }
    simplified
}

/// Normalizes points (e.g., ensuring minimum distance between points or resampling).
pub fn normalize_points(points: Vec<StrokePoint>) -> Vec<StrokePoint> {
    // For now, normalization just ensures we don't have duplicate consecutive points.
    let mut normalized: Vec<StrokePoint> = Vec::with_capacity(points.len());
    for p in points {
        if let Some(last) = normalized.last() {
            if (p.index - last.index).abs() < 1e-6 && (p.price - last.price).abs() < 1e-9 {
                continue;
            }
        }
        normalized.push(p);
    }
    normalized
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_simplify_points() {
        let points = vec![
            StrokePoint {
                index: 0.0,
                price: 100.0,
            },
            StrokePoint {
                index: 0.0,
                price: 100.0,
            },
            StrokePoint {
                index: 0.1,
                price: 100.001,
            }, // Should be removed
            StrokePoint {
                index: 1.0,
                price: 101.0,
            },
            StrokePoint {
                index: 1.1,
                price: 101.001,
            }, // Should be removed
            StrokePoint {
                index: 2.0,
                price: 102.0,
            },
        ];

        // With tolerance 0.5, points at 0.1 and 1.1 should be filtered out
        // Price tolerance is 0.5 * 0.01 = 0.005. 0.001 < 0.005.
        let simplified = simplify_points(points, 0.5);
        assert_eq!(simplified.len(), 3);
        assert_eq!(simplified[0].index, 0.0);
        assert_eq!(simplified[1].index, 1.0);
        assert_eq!(simplified[2].index, 2.0);
    }

    #[test]
    fn test_normalize_points_removes_duplicates() {
        let points = vec![
            StrokePoint {
                index: 1.0,
                price: 100.0,
            },
            StrokePoint {
                index: 1.0,
                price: 100.0,
            }, // Duplicate
            StrokePoint {
                index: 2.0,
                price: 101.0,
            },
        ];
        let normalized = normalize_points(points);
        assert_eq!(normalized.len(), 2);
        assert_eq!(normalized[0].index, 1.0);
        assert_eq!(normalized[1].index, 2.0);
    }
}

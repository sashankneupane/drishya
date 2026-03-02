use crate::{
    plots::model::{PaneId, PlotPrimitive, PlotSeries},
    scale::TimeScale,
};

pub(crate) fn series_value_at_index(series: &PlotSeries, index: usize) -> Option<f64> {
    // Prefer later primitives so readouts pick the main signal line
    // (e.g. RSI value) over static guide lines (e.g. 70/30).
    for primitive in series.primitives.iter().rev() {
        match primitive {
            PlotPrimitive::Line { values, .. } | PlotPrimitive::Histogram { values, .. } => {
                if let Some(v) = values.get(index).and_then(|v| *v) {
                    return Some(v);
                }
            }
            PlotPrimitive::Band { upper, lower, .. } => {
                let u = upper.get(index).and_then(|v| *v);
                let l = lower.get(index).and_then(|v| *v);
                if let (Some(u), Some(l)) = (u, l) {
                    return Some((u + l) * 0.5);
                }
                if let Some(v) = u.or(l) {
                    return Some(v);
                }
            }
            PlotPrimitive::Markers { points, .. } => {
                if let Some(point) = points.iter().find(|p| p.index == index) {
                    return Some(point.value);
                }
            }
        }
    }
    None
}

pub(crate) fn nearest_candle_index(x: f32, ts: TimeScale, total_len: usize) -> Option<usize> {
    if total_len == 0 {
        return None;
    }

    let span = ts.world_span();
    if span <= 0.0 || ts.pane.w <= 0.0 {
        return Some(0);
    }

    let u = ((x - ts.pane.x) as f64 / ts.pane.w as f64).clamp(0.0, 1.0);
    let world_x = ts.world_start_x + u * span;
    let idx = world_x.floor() as isize;
    let clamped = idx.clamp(0, total_len as isize - 1);
    Some(clamped as usize)
}

pub(crate) fn compute_pane_value_bounds(
    series: &[PlotSeries],
    pane: &PaneId,
    visible_start: usize,
    visible_end: usize,
) -> Option<(f64, f64)> {
    let mut min_v = f64::INFINITY;
    let mut max_v = f64::NEG_INFINITY;

    for s in series {
        if &s.pane != pane || !s.visible {
            continue;
        }

        for primitive in &s.primitives {
            match primitive {
                PlotPrimitive::Line { values, .. } | PlotPrimitive::Histogram { values, .. } => {
                    for idx in visible_start..visible_end {
                        if let Some(v) = values.get(idx).and_then(|v| *v) {
                            min_v = min_v.min(v);
                            max_v = max_v.max(v);
                        }
                    }
                }
                PlotPrimitive::Band { upper, lower, .. } => {
                    for idx in visible_start..visible_end {
                        if let Some(v) = upper.get(idx).and_then(|v| *v) {
                            min_v = min_v.min(v);
                            max_v = max_v.max(v);
                        }
                        if let Some(v) = lower.get(idx).and_then(|v| *v) {
                            min_v = min_v.min(v);
                            max_v = max_v.max(v);
                        }
                    }
                }
                PlotPrimitive::Markers { points, .. } => {
                    for p in points {
                        if (visible_start..visible_end).contains(&p.index) {
                            min_v = min_v.min(p.value);
                            max_v = max_v.max(p.value);
                        }
                    }
                }
            }
        }
    }

    if !min_v.is_finite() || !max_v.is_finite() {
        None
    } else {
        let pad = ((max_v - min_v) * 0.08).max(1e-6);
        Some((min_v - pad, max_v + pad))
    }
}

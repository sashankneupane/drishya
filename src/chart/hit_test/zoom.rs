pub(super) fn apply_y_zoom(min: f64, max: f64, zoom_factor: f32, pan_factor: f32) -> (f64, f64) {
    let center = (min + max) * 0.5;
    let half = ((max - min) * 0.5).max(1e-9);
    let zoomed_half = half / zoom_factor.max(1e-6) as f64;
    let pan_delta = zoomed_half * pan_factor as f64;
    (
        center - zoomed_half - pan_delta,
        center + zoomed_half - pan_delta,
    )
}

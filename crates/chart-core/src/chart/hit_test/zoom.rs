pub(super) fn apply_y_zoom(
    min: f64,
    max: f64,
    zoom_factor: f32,
    pan_factor: f32,
    mode: crate::scale::PriceAxisMode,
    baseline: Option<f64>,
) -> (f64, f64) {
    crate::scale::apply_axis_zoom_pan(min, max, zoom_factor, pan_factor, mode, baseline)
}

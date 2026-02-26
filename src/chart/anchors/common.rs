use crate::render::{
    primitives::DrawCommand,
    styles::{FillStyle, StrokeStyle},
};

#[allow(dead_code)]
pub(super) fn anchor_cmd_default(cx: f32, cy: f32, anchor_r: f32) -> DrawCommand {
    DrawCommand::Ellipse {
        cx,
        cy,
        rx: anchor_r,
        ry: anchor_r,
        rotation: 0.0,
        fill: Some(FillStyle::token(
            crate::render::styles::ColorToken::DrawingPrimary,
        )),
        stroke: Some(StrokeStyle::token(
            crate::render::styles::ColorToken::DrawingPrimary,
            1.0,
        )),
    }
}

#[allow(dead_code)]
pub(super) fn anchor_cmd_with_color(
    cx: f32,
    cy: f32,
    anchor_r: f32,
    stroke_color: &str,
) -> DrawCommand {
    let fill = FillStyle::css(stroke_color.to_string());
    let stroke = StrokeStyle::css(stroke_color.to_string(), 1.0);
    DrawCommand::Ellipse {
        cx,
        cy,
        rx: anchor_r,
        ry: anchor_r,
        rotation: 0.0,
        fill: Some(fill),
        stroke: Some(stroke),
    }
}

pub(super) fn apply_price_pane_y_zoom(
    min: f64,
    max: f64,
    zoom_factor: f32,
    pan_factor: f32,
    mode: crate::scale::PriceAxisMode,
    baseline: Option<f64>,
) -> (f64, f64) {
    crate::scale::apply_axis_zoom_pan(min, max, zoom_factor, pan_factor, mode, baseline)
}

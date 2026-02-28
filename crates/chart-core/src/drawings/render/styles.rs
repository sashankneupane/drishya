use crate::{
    drawings::types::Drawing,
    render::styles::{ColorToken, FillStyle, StrokeStyle},
};

/// Convert hex color (#RRGGBB or #RGB) to rgba(r,g,b,opacity).
pub(super) fn color_with_opacity(hex: &str, opacity: f32) -> String {
    let s = hex.trim().trim_start_matches('#');
    let (r, g, b) = if s.len() == 6 {
        let r = u8::from_str_radix(&s[0..2], 16).unwrap_or(255);
        let g = u8::from_str_radix(&s[2..4], 16).unwrap_or(255);
        let b = u8::from_str_radix(&s[4..6], 16).unwrap_or(255);
        (r, g, b)
    } else if s.len() == 3 {
        let r = u8::from_str_radix(&s[0..1].repeat(2), 16).unwrap_or(255);
        let g = u8::from_str_radix(&s[1..2].repeat(2), 16).unwrap_or(255);
        let b = u8::from_str_radix(&s[2..3].repeat(2), 16).unwrap_or(255);
        (r, g, b)
    } else {
        return hex.to_string();
    };
    format!("rgba({},{},{},{})", r, g, b, opacity.clamp(0.0, 1.0))
}

pub(super) fn stroke_dash_from_drawing(d: &Drawing) -> Option<Vec<f64>> {
    d.style().stroke_type.and_then(|t| {
        t.dash_array()
            .map(|a| a.iter().map(|&f| f as f64).collect())
    })
}

/// Resolve stroke style: drawing override or token fallback.
pub(super) fn stroke_for_drawing(
    d: &Drawing,
    fallback: ColorToken,
    default_width: f32,
) -> StrokeStyle {
    let width = d.style().stroke_width.unwrap_or(default_width);
    let dash = stroke_dash_from_drawing(d);
    if let Some(ref c) = d.style().stroke_color {
        StrokeStyle::css_with_dash(c.clone(), width, dash)
    } else {
        StrokeStyle::token_with_dash(fallback, width, dash)
    }
}

/// Resolve stroke style: drawing override or custom fallback (e.g. hardcoded CSS).
pub(super) fn stroke_for_drawing_or_fallback(d: &Drawing, fallback: StrokeStyle) -> StrokeStyle {
    let width = d.style().stroke_width.unwrap_or(fallback.width);
    let dash = stroke_dash_from_drawing(d).or(fallback.dash.clone());
    if let Some(ref c) = d.style().stroke_color {
        StrokeStyle::css_with_dash(c.clone(), width, dash)
    } else {
        StrokeStyle {
            color: fallback.color,
            width,
            dash,
        }
    }
}

/// Resolve fill style for fill-capable drawings from drawing override.
/// Returns None when fill_color is None (transparent) or for non-fill-capable shapes.
/// Applies fill_opacity when set to make the chart visible underneath.
pub(super) fn fill_for_drawing(d: &Drawing) -> Option<FillStyle> {
    if !d.supports_fill() {
        return None;
    }
    match d.style().fill_color {
        Some(ref c) => {
            let color_str = match d.style().fill_opacity {
                Some(a) => color_with_opacity(c, a.clamp(0.0, 1.0)),
                None => c.clone(),
            };
            Some(FillStyle::css(color_str))
        }
        None => None,
    }
}

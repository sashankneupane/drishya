//! Drawing overlay scene builder.
//!
//! Drawings are converted into generic `DrawCommand`s so they can be rendered
//! by any backend, just like candles and axes.

use crate::{
    drawings::shape::fib as fib_shape,
    drawings::{store::DrawingStore, types::Drawing},
    layout::ChartLayout,
    render::primitives::DrawCommand,
    render::styles::{ColorToken, FillStyle, StrokeStyle, TextAlign, TextStyle},
    render::ticks::{HumanTimeFormatter, TimeLabelFormatter},
    scale::PriceScale,
    types::{Candle, Point, Rect},
    viewport::Viewport,
};

/// Convert hex color (#RRGGBB or #RGB) to rgba(r,g,b,opacity).
fn color_with_opacity(hex: &str, opacity: f32) -> String {
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

fn stroke_dash_from_drawing(d: &Drawing) -> Option<Vec<f64>> {
    d.style()
        .stroke_type
        .and_then(|t| t.dash_array().map(|a| a.iter().map(|&f| f as f64).collect()))
}

/// Resolve stroke style: drawing override or token fallback.
fn stroke_for_drawing(
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
fn stroke_for_drawing_or_fallback(d: &Drawing, fallback: StrokeStyle) -> StrokeStyle {
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
fn fill_for_drawing(d: &Drawing) -> Option<FillStyle> {
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
        None => None, // Transparent: no fill
    }
}

pub fn build_drawing_commands(
    store: &DrawingStore,
    layout: ChartLayout,
    ps: PriceScale,
    viewport: Option<Viewport>,
    candles: &[Candle],
    selected_drawing_id: Option<u64>,
) -> Vec<DrawCommand> {
    let mut out = Vec::new();
    let Some(price_pane) = layout.price_pane() else {
        return out;
    };

    let drawings = store.visible_items_in_paint_order();

    for d in drawings {
        match d {
            Drawing::HorizontalLine(h) => {
                let selected = selected_drawing_id == Some(h.id);
                let stroke = stroke_for_drawing(
                    d,
                    ColorToken::DrawingPrimary,
                    if selected { 2.0 } else { 1.0 },
                );
                let y = ps.y_for_price(h.price);
                if y >= price_pane.y && y <= price_pane.bottom() {
                    out.push(DrawCommand::PushClip { rect: price_pane });
                    out.push(DrawCommand::Line {
                        from: Point { x: price_pane.x, y },
                        to: Point {
                            x: price_pane.right(),
                            y,
                        },
                        stroke,
                    });
                    out.push(DrawCommand::PopClip);

                    let label_h = 16.0f32;
                    let label_y = (y - label_h * 0.5)
                        .clamp(layout.y_axis.y, layout.y_axis.bottom() - label_h);
                    out.push(DrawCommand::Rect {
                        rect: Rect {
                            x: layout.y_axis.x + 1.0,
                            y: label_y,
                            w: layout.y_axis.w - 2.0,
                            h: label_h,
                        },
                        fill: Some(FillStyle::token(ColorToken::PaneBorder)),
                        stroke: None,
                    });
                    out.push(DrawCommand::Text {
                        pos: Point {
                            x: layout.y_axis.x + layout.y_axis.w - 4.0,
                            y: label_y + 12.0,
                        },
                        text: format!("{:.2}", h.price),
                        style: TextStyle::token(
                            ColorToken::DrawingPrimaryText,
                            11.0,
                            TextAlign::Right,
                        ),
                    });
                }
            }
            Drawing::VerticalLine(v) => {
                let selected = selected_drawing_id == Some(v.id);
                let stroke = stroke_for_drawing(
                    d,
                    ColorToken::DrawingSecondary,
                    if selected { 2.0 } else { 1.0 },
                );
                if let Some(vp) = viewport {
                    let x = vp.world_x_to_pixel_x(v.index, price_pane.x, price_pane.w);
                    if x >= price_pane.x && x <= price_pane.right() {
                        let bottom_y = layout.plot_bottom();

                        out.push(DrawCommand::PushClip { rect: layout.plot });
                        out.push(DrawCommand::Line {
                            from: Point { x, y: price_pane.y },
                            to: Point { x, y: bottom_y },
                            stroke,
                        });
                        out.push(DrawCommand::PopClip);

                        let ts_text = format_vertical_time_label(v.index, candles);
                        let label_w = 86.0f32;
                        let label_h = 16.0f32;
                        let label_x = (x - label_w * 0.5)
                            .clamp(layout.x_axis.x, layout.x_axis.right() - label_w);
                        out.push(DrawCommand::Rect {
                            rect: Rect {
                                x: label_x,
                                y: layout.x_axis.y + 2.0,
                                w: label_w,
                                h: label_h,
                            },
                            fill: Some(FillStyle::token(ColorToken::PaneBorder)),
                            stroke: None,
                        });
                        out.push(DrawCommand::Text {
                            pos: Point {
                                x: label_x + label_w * 0.5,
                                y: layout.x_axis.y + 13.0,
                            },
                            text: ts_text,
                            style: TextStyle::token(
                                ColorToken::DrawingSecondaryText,
                                10.0,
                                TextAlign::Center,
                            ),
                        });
                    }
                }
            }
            Drawing::Ray(ray) => {
                let selected = selected_drawing_id == Some(ray.id);
                let stroke = stroke_for_drawing(
                    d,
                    ColorToken::DrawingSecondary,
                    if selected { 2.0 } else { 1.0 },
                );
                if let Some(vp) = viewport {
                    let start_x =
                        vp.world_x_to_pixel_x(ray.start_index, price_pane.x, price_pane.w);
                    let end_x = vp.world_x_to_pixel_x(ray.end_index, price_pane.x, price_pane.w);
                    if (end_x - start_x).abs() > 0.5 {
                        let start_y = ps.y_for_price(ray.start_price);
                        let end_y = ps.y_for_price(ray.end_price);
                        let slope = (end_y - start_y) / (end_x - start_x);
                        let x_right = price_pane.right();
                        let y_right = end_y + slope * (x_right - end_x);

                        out.push(DrawCommand::PushClip { rect: price_pane });
                        out.push(DrawCommand::Line {
                            from: Point {
                                x: start_x,
                                y: start_y,
                            },
                            to: Point {
                                x: x_right,
                                y: y_right,
                            },
                            stroke,
                        });
                        out.push(DrawCommand::PopClip);
                    }
                }
            }
            Drawing::Rectangle(r) => {
                let selected = selected_drawing_id == Some(r.id);
                let fill = fill_for_drawing(d);
                let stroke = stroke_for_drawing(
                    d,
                    ColorToken::DrawingPrimary,
                    if selected { 2.0 } else { 1.0 },
                );
                if let Some(vp) = viewport {
                    let left_x = vp.world_x_to_pixel_x(r.start_index, price_pane.x, price_pane.w);
                    let right_x = vp.world_x_to_pixel_x(r.end_index, price_pane.x, price_pane.w);
                    let top_y = ps.y_for_price(r.top_price);
                    let bottom_y = ps.y_for_price(r.bottom_price);

                    let rect = rect_from_edges(left_x, right_x, top_y, bottom_y);
                    out.push(DrawCommand::PushClip { rect: price_pane });
                    out.push(DrawCommand::Rect {
                        rect,
                        fill,
                        stroke: Some(stroke),
                    });
                    out.push(DrawCommand::PopClip);
                }
            }
            Drawing::PriceRange(r) => {
                let selected = selected_drawing_id == Some(r.id);
                let fill = fill_for_drawing(d);
                let stroke = stroke_for_drawing(
                    d,
                    ColorToken::DrawingSecondary,
                    if selected { 2.0 } else { 1.0 },
                );
                if let Some(vp) = viewport {
                    let left_x = vp.world_x_to_pixel_x(r.start_index, price_pane.x, price_pane.w);
                    let right_x = vp.world_x_to_pixel_x(r.end_index, price_pane.x, price_pane.w);
                    let top_y = ps.y_for_price(r.top_price);
                    let bottom_y = ps.y_for_price(r.bottom_price);
                    let rect = rect_from_edges(left_x, right_x, top_y, bottom_y);

                    out.push(DrawCommand::PushClip { rect: price_pane });
                    out.push(DrawCommand::Rect {
                        rect,
                        fill,
                        stroke: Some(stroke),
                    });
                    out.push(DrawCommand::PopClip);

                    let price_span = (r.top_price - r.bottom_price).abs();
                    let percent = if r.bottom_price.abs() > 1e-9 {
                        (price_span / r.bottom_price.abs()) * 100.0
                    } else {
                        0.0
                    };
                    out.push(DrawCommand::Text {
                        pos: Point {
                            x: rect.x + 4.0,
                            y: (rect.y + 12.0)
                                .clamp(price_pane.y + 12.0, price_pane.bottom() - 2.0),
                        },
                        text: format!("Range {:.2} ({:.2}%)", price_span, percent),
                        style: TextStyle::token(
                            ColorToken::DrawingSecondaryText,
                            10.0,
                            TextAlign::Left,
                        ),
                    });
                }
            }
            Drawing::TimeRange(r) => {
                let selected = selected_drawing_id == Some(r.id);
                let fill = fill_for_drawing(d);
                let stroke = stroke_for_drawing(
                    d,
                    ColorToken::DrawingSecondary,
                    if selected { 2.0 } else { 1.0 },
                );
                if let Some(vp) = viewport {
                    let left_x = vp.world_x_to_pixel_x(r.start_index, price_pane.x, price_pane.w);
                    let right_x = vp.world_x_to_pixel_x(r.end_index, price_pane.x, price_pane.w);
                    let top_y = ps.y_for_price(r.top_price);
                    let bottom_y = ps.y_for_price(r.bottom_price);
                    let rect = rect_from_edges(left_x, right_x, top_y, bottom_y);

                    out.push(DrawCommand::PushClip { rect: price_pane });
                    out.push(DrawCommand::Rect {
                        rect,
                        fill,
                        stroke: Some(stroke),
                    });
                    out.push(DrawCommand::PopClip);

                    let bars = (r.end_index - r.start_index).abs().round() as usize;
                    let duration =
                        format_time_duration_from_indices(r.start_index, r.end_index, candles);
                    out.push(DrawCommand::Text {
                        pos: Point {
                            x: rect.x + 4.0,
                            y: (rect.y + 12.0)
                                .clamp(price_pane.y + 12.0, price_pane.bottom() - 2.0),
                        },
                        text: format!("{bars} bars {duration}"),
                        style: TextStyle::token(
                            ColorToken::DrawingSecondaryText,
                            10.0,
                            TextAlign::Left,
                        ),
                    });
                }
            }
            Drawing::DateTimeRange(r) => {
                let selected = selected_drawing_id == Some(r.id);
                let fill = fill_for_drawing(d);
                let stroke = stroke_for_drawing(
                    d,
                    ColorToken::DrawingSecondary,
                    if selected { 2.0 } else { 1.0 },
                );
                if let Some(vp) = viewport {
                    let left_x = vp.world_x_to_pixel_x(r.start_index, price_pane.x, price_pane.w);
                    let right_x = vp.world_x_to_pixel_x(r.end_index, price_pane.x, price_pane.w);
                    let top_y = ps.y_for_price(r.top_price);
                    let bottom_y = ps.y_for_price(r.bottom_price);
                    let rect = rect_from_edges(left_x, right_x, top_y, bottom_y);

                    out.push(DrawCommand::PushClip { rect: price_pane });
                    out.push(DrawCommand::Rect {
                        rect,
                        fill,
                        stroke: Some(stroke),
                    });
                    out.push(DrawCommand::PopClip);

                    let price_span = (r.top_price - r.bottom_price).abs();
                    let percent = if r.bottom_price.abs() > 1e-9 {
                        (price_span / r.bottom_price.abs()) * 100.0
                    } else {
                        0.0
                    };
                    let bars = (r.end_index - r.start_index).abs().round() as usize;
                    let duration =
                        format_time_duration_from_indices(r.start_index, r.end_index, candles);
                    out.push(DrawCommand::Text {
                        pos: Point {
                            x: rect.x + 4.0,
                            y: (rect.y + 12.0)
                                .clamp(price_pane.y + 12.0, price_pane.bottom() - 2.0),
                        },
                        text: format!(
                            "{bars} bars {duration} | {:.2} ({:.2}%)",
                            price_span, percent
                        ),
                        style: TextStyle::token(
                            ColorToken::DrawingSecondaryText,
                            10.0,
                            TextAlign::Left,
                        ),
                    });
                }
            }
            Drawing::LongPosition(p) => {
                let selected = selected_drawing_id == Some(p.id);
                let reward_fill = fill_for_drawing(d);
                let risk_fill = fill_for_drawing(d);
                let stroke = stroke_for_drawing(
                    d,
                    ColorToken::DrawingPrimary,
                    if selected { 2.0 } else { 1.0 },
                );
                if let Some(vp) = viewport {
                    let left_x = vp.world_x_to_pixel_x(p.start_index, price_pane.x, price_pane.w);
                    let right_x = vp.world_x_to_pixel_x(p.end_index, price_pane.x, price_pane.w);
                    let entry_y = ps.y_for_price(p.entry_price);
                    let stop_y = ps.y_for_price(p.stop_price);
                    let target_y = ps.y_for_price(p.target_price);

                    let reward_rect = rect_from_edges(left_x, right_x, target_y, entry_y);
                    let risk_rect = rect_from_edges(left_x, right_x, entry_y, stop_y);
                    out.push(DrawCommand::PushClip { rect: price_pane });
                    out.push(DrawCommand::Rect {
                        rect: reward_rect,
                        fill: reward_fill,
                        stroke: None,
                    });
                    out.push(DrawCommand::Rect {
                        rect: risk_rect,
                        fill: risk_fill,
                        stroke: None,
                    });
                    out.push(DrawCommand::Line {
                        from: Point {
                            x: reward_rect.x,
                            y: entry_y,
                        },
                        to: Point {
                            x: reward_rect.right(),
                            y: entry_y,
                        },
                        stroke: stroke.clone(),
                    });
                    out.push(DrawCommand::Rect {
                        rect: rect_from_edges(left_x, right_x, target_y, stop_y),
                        fill: None,
                        stroke: Some(stroke),
                    });
                    out.push(DrawCommand::Text {
                        pos: Point {
                            x: right_x,
                            y: target_y - 4.0,
                        },
                        text: "LONG".to_string(),
                        style: TextStyle::token(
                            ColorToken::DrawingPrimaryText,
                            10.0,
                            TextAlign::Right,
                        ),
                    });
                    out.push(DrawCommand::PopClip);
                }
            }
            Drawing::ShortPosition(p) => {
                let selected = selected_drawing_id == Some(p.id);
                let reward_fill = fill_for_drawing(d);
                let risk_fill = fill_for_drawing(d);
                let stroke = stroke_for_drawing(
                    d,
                    ColorToken::DrawingSecondary,
                    if selected { 2.0 } else { 1.0 },
                );
                if let Some(vp) = viewport {
                    let left_x = vp.world_x_to_pixel_x(p.start_index, price_pane.x, price_pane.w);
                    let right_x = vp.world_x_to_pixel_x(p.end_index, price_pane.x, price_pane.w);
                    let entry_y = ps.y_for_price(p.entry_price);
                    let stop_y = ps.y_for_price(p.stop_price);
                    let target_y = ps.y_for_price(p.target_price);

                    let reward_rect = rect_from_edges(left_x, right_x, entry_y, target_y);
                    let risk_rect = rect_from_edges(left_x, right_x, stop_y, entry_y);
                    out.push(DrawCommand::PushClip { rect: price_pane });
                    out.push(DrawCommand::Rect {
                        rect: reward_rect,
                        fill: reward_fill,
                        stroke: None,
                    });
                    out.push(DrawCommand::Rect {
                        rect: risk_rect,
                        fill: risk_fill,
                        stroke: None,
                    });
                    out.push(DrawCommand::Line {
                        from: Point {
                            x: reward_rect.x,
                            y: entry_y,
                        },
                        to: Point {
                            x: reward_rect.right(),
                            y: entry_y,
                        },
                        stroke: stroke.clone(),
                    });
                    out.push(DrawCommand::Rect {
                        rect: rect_from_edges(left_x, right_x, stop_y, target_y),
                        fill: None,
                        stroke: Some(stroke),
                    });
                    out.push(DrawCommand::Text {
                        pos: Point {
                            x: right_x,
                            y: target_y + 12.0,
                        },
                        text: "SHORT".to_string(),
                        style: TextStyle::token(
                            ColorToken::DrawingSecondaryText,
                            10.0,
                            TextAlign::Right,
                        ),
                    });
                    out.push(DrawCommand::PopClip);
                }
            }
            Drawing::FibRetracement(fib) => {
                let selected = selected_drawing_id == Some(fib.id);
                let band_fill_override = d.style().fill_color.as_ref().map(|c| FillStyle::css(c.clone()));
                let edge_stroke_width = if selected { 2.0 } else { 1.25 };
                if let Some(vp) = viewport {
                    let left_x = vp.world_x_to_pixel_x(fib.start_index, price_pane.x, price_pane.w);
                    let right_x = vp.world_x_to_pixel_x(fib.end_index, price_pane.x, price_pane.w);
                    let x_left = left_x.min(right_x);
                    let x_right = left_x.max(right_x);

                    out.push(DrawCommand::PushClip { rect: price_pane });
                    let mut levels: Vec<(f64, f64, f32)> = fib_shape::levels()
                        .iter()
                        .map(|level| {
                            let price = fib_shape::level_price(fib, *level);
                            (*level, price, ps.y_for_price(price))
                        })
                        .collect();
                    levels.sort_by(|a, b| a.2.total_cmp(&b.2));

                    // TradingView-like zone fills between consecutive levels.
                    for (i, pair) in levels.windows(2).enumerate() {
                        let y1 = pair[0].2;
                        let y2 = pair[1].2;
                        let band = rect_from_edges(x_left, x_right, y1, y2);
                        let fill = band_fill_override.clone().unwrap_or_else(|| {
                            let fill = if i % 2 == 0 {
                                "rgba(56,189,248,0.10)"
                            } else {
                                "rgba(59,130,246,0.06)"
                            };
                            FillStyle::css(fill.to_string())
                        });
                        out.push(DrawCommand::Rect {
                            rect: band,
                            fill: Some(fill),
                            stroke: None,
                        });
                    }

                    for (level, level_price, y) in levels {
                        let major = (level - 0.0).abs() < 1e-9
                            || (level - 0.5).abs() < 1e-9
                            || (level - 1.0).abs() < 1e-9;
                        let fallback = StrokeStyle::css(
                            if major {
                                "rgba(125,211,252,0.88)"
                            } else {
                                "rgba(125,211,252,0.62)"
                            }
                            .to_string(),
                            if selected {
                                2.0
                            } else if major {
                                1.25
                            } else {
                                1.0
                            },
                        );
                        let stroke = stroke_for_drawing_or_fallback(d, fallback);
                        out.push(DrawCommand::Line {
                            from: Point { x: x_left, y },
                            to: Point { x: x_right, y },
                            stroke,
                        });
                        out.push(DrawCommand::Text {
                            pos: Point {
                                x: x_right - 2.0,
                                y: y - 2.0,
                            },
                            text: format!("{:>6.1}%  {:.2}", level * 100.0, level_price),
                            style: TextStyle::css(
                                "rgba(186,230,253,0.92)".to_string(),
                                10.0,
                                TextAlign::Right,
                            ),
                        });
                    }
                    let y_top = ps.y_for_price(fib.start_price);
                    let y_bottom = ps.y_for_price(fib.end_price);
                    let edge_stroke = stroke_for_drawing_or_fallback(
                        d,
                        StrokeStyle::css("rgba(96,165,250,0.92)".to_string(), edge_stroke_width),
                    );
                    out.push(DrawCommand::Line {
                        from: Point {
                            x: x_left,
                            y: y_top,
                        },
                        to: Point {
                            x: x_right,
                            y: y_top,
                        },
                        stroke: edge_stroke.clone(),
                    });
                    out.push(DrawCommand::Line {
                        from: Point {
                            x: x_left,
                            y: y_bottom,
                        },
                        to: Point {
                            x: x_right,
                            y: y_bottom,
                        },
                        stroke: edge_stroke,
                    });
                    out.push(DrawCommand::PopClip);
                }
            }
            Drawing::Circle(c) => {
                let selected = selected_drawing_id == Some(c.id);
                let fill = fill_for_drawing(d);
                let stroke = stroke_for_drawing(
                    d,
                    ColorToken::DrawingPrimary,
                    if selected { 2.0 } else { 1.0 },
                );
                if let Some(vp) = viewport {
                    let cx = vp.world_x_to_pixel_x(c.center_index, price_pane.x, price_pane.w);
                    let rpx = vp.world_x_to_pixel_x(c.radius_index, price_pane.x, price_pane.w);
                    let cy = ps.y_for_price(c.center_price);
                    let rpy = ps.y_for_price(c.radius_price);
                    let r_px = ((rpx - cx).powi(2) + (rpy - cy).powi(2)).sqrt().max(1.0);

                    out.push(DrawCommand::PushClip { rect: price_pane });
                    out.push(DrawCommand::Ellipse {
                        cx,
                        cy,
                        rx: r_px,
                        ry: r_px,
                        rotation: 0.0,
                        fill,
                        stroke: Some(stroke),
                    });
                    out.push(DrawCommand::PopClip);
                }
            }
            Drawing::Triangle(t) => {
                let selected = selected_drawing_id == Some(t.id);
                let fill = fill_for_drawing(d);
                let stroke = stroke_for_drawing(
                    d,
                    ColorToken::DrawingPrimary,
                    if selected { 2.0 } else { 1.0 },
                );
                if let Some(vp) = viewport {
                    let x1 = vp.world_x_to_pixel_x(t.p1_index, price_pane.x, price_pane.w);
                    let x2 = vp.world_x_to_pixel_x(t.p2_index, price_pane.x, price_pane.w);
                    let x3 = vp.world_x_to_pixel_x(t.p3_index, price_pane.x, price_pane.w);
                    let y1 = ps.y_for_price(t.p1_price);
                    let y2 = ps.y_for_price(t.p2_price);
                    let y3 = ps.y_for_price(t.p3_price);

                    out.push(DrawCommand::PushClip { rect: price_pane });
                    out.push(DrawCommand::Polygon {
                        points: vec![
                            Point { x: x1, y: y1 },
                            Point { x: x2, y: y2 },
                            Point { x: x3, y: y3 },
                        ],
                        fill,
                        stroke: Some(stroke),
                    });
                    out.push(DrawCommand::PopClip);
                }
            }
            Drawing::Ellipse(e) => {
                let selected = selected_drawing_id == Some(e.id);
                let fill = fill_for_drawing(d);
                let stroke = stroke_for_drawing(
                    d,
                    ColorToken::DrawingPrimary,
                    if selected { 2.0 } else { 1.0 },
                );
                if let Some(vp) = viewport {
                    // Compute center from midpoint of p1/p2 (diameter 1)
                    let x1 = vp.world_x_to_pixel_x(e.p1_index, price_pane.x, price_pane.w);
                    let x2 = vp.world_x_to_pixel_x(e.p2_index, price_pane.x, price_pane.w);
                    let x3 = vp.world_x_to_pixel_x(e.p3_index, price_pane.x, price_pane.w);
                    let y1 = ps.y_for_price(e.p1_price);
                    let y2 = ps.y_for_price(e.p2_price);
                    let y3 = ps.y_for_price(e.p3_price);
                    let cx = (x1 + x2) * 0.5;
                    let cy = (y1 + y2) * 0.5;
                    // Semi-axis a = half of diameter 1 (major axis)
                    let rx = ((x2 - x1).hypot(y2 - y1) * 0.5).max(1.0);
                    // Semi-axis b = perpendicular distance of p3 from center
                    let ry = ((x3 - cx).hypot(y3 - cy)).max(1.0);
                    // Angle of the major axis relative to +x screen axis
                    let rotation = (y2 - y1).atan2(x2 - x1);

                    out.push(DrawCommand::PushClip { rect: price_pane });
                    out.push(DrawCommand::Ellipse {
                        cx,
                        cy,
                        rx,
                        ry,
                        rotation,
                        fill,
                        stroke: Some(stroke),
                    });
                    out.push(DrawCommand::PopClip);
                }
            }
        }
    }

    out
}

pub fn build_preview_drawing_commands(
    drawing: &Drawing,
    layout: ChartLayout,
    ps: PriceScale,
    viewport: Option<Viewport>,
) -> Vec<DrawCommand> {
    let mut temp = DrawingStore::new();
    temp.ensure_layer("preview");
    temp.set_layer_order(vec!["preview".to_string()]);

    // Reuse the same renderer path by inserting a temporary preview drawing.
    // IDs and persistence are irrelevant for this transient visualization.
    match drawing {
        Drawing::HorizontalLine(item) => {
            temp.add_horizontal_line(item.price);
        }
        Drawing::VerticalLine(item) => {
            temp.add_vertical_line(item.index);
        }
        Drawing::Ray(item) => {
            temp.add_ray(
                item.start_index,
                item.end_index,
                item.start_price,
                item.end_price,
            );
        }
        Drawing::Rectangle(item) => {
            temp.add_rectangle(
                item.start_index,
                item.end_index,
                item.top_price,
                item.bottom_price,
            );
        }
        Drawing::PriceRange(item) => {
            temp.add_price_range(
                item.start_index,
                item.end_index,
                item.top_price,
                item.bottom_price,
            );
        }
        Drawing::TimeRange(item) => {
            temp.add_time_range(
                item.start_index,
                item.end_index,
                item.top_price,
                item.bottom_price,
            );
        }
        Drawing::DateTimeRange(item) => {
            temp.add_date_time_range(
                item.start_index,
                item.end_index,
                item.top_price,
                item.bottom_price,
            );
        }
        Drawing::LongPosition(item) => {
            temp.add_long_position(
                item.start_index,
                item.end_index,
                item.entry_price,
                item.stop_price,
                item.target_price,
            );
        }
        Drawing::ShortPosition(item) => {
            temp.add_short_position(
                item.start_index,
                item.end_index,
                item.entry_price,
                item.stop_price,
                item.target_price,
            );
        }
        Drawing::FibRetracement(item) => {
            temp.add_fib_retracement(
                item.start_index,
                item.end_index,
                item.start_price,
                item.end_price,
            );
        }
        Drawing::Circle(item) => {
            temp.add_circle(
                item.center_index,
                item.radius_index,
                item.center_price,
                item.radius_price,
            );
        }
        Drawing::Triangle(item) => {
            temp.add_triangle(
                item.p1_index,
                item.p2_index,
                item.p3_index,
                item.p1_price,
                item.p2_price,
                item.p3_price,
            );
        }
        Drawing::Ellipse(item) => {
            temp.add_ellipse(
                item.p1_index,
                item.p2_index,
                item.p3_index,
                item.p1_price,
                item.p2_price,
                item.p3_price,
            );
        }
    }

    if let Some(first) = temp.items().first().map(|item| item.id()) {
        let _ = temp.set_drawing_layer(first, "preview");
    }

    build_drawing_commands(&temp, layout, ps, viewport, &[], None)
}

fn rect_from_edges(x1: f32, x2: f32, y1: f32, y2: f32) -> Rect {
    let left = x1.min(x2);
    let right = x1.max(x2);
    let top = y1.min(y2);
    let bottom = y1.max(y2);
    Rect {
        x: left,
        y: top,
        w: (right - left).max(1.0),
        h: (bottom - top).max(1.0),
    }
}

fn format_vertical_time_label(index: f32, candles: &[Candle]) -> String {
    if candles.is_empty() {
        return String::new();
    }
    let idx = index.floor().max(0.0) as usize;
    let idx = idx.min(candles.len().saturating_sub(1));
    let ts = candles[idx].ts;
    HumanTimeFormatter.format_time(ts)
}

fn format_time_duration_from_indices(
    start_index: f32,
    end_index: f32,
    candles: &[Candle],
) -> String {
    if candles.is_empty() {
        return String::new();
    }

    let start_ts = timestamp_for_world_index(start_index, candles);
    let end_ts = timestamp_for_world_index(end_index, candles);
    let secs = (end_ts - start_ts).abs();

    if secs < 60 {
        format!("{secs}s")
    } else if secs < 3_600 {
        format!("{}m", secs / 60)
    } else if secs < 86_400 {
        format!("{}h {}m", secs / 3_600, (secs % 3_600) / 60)
    } else {
        format!("{}d {}h", secs / 86_400, (secs % 86_400) / 3_600)
    }
}

fn timestamp_for_world_index(index: f32, candles: &[Candle]) -> i64 {
    if candles.is_empty() {
        return 0;
    }
    let idx = index.floor().max(0.0) as usize;
    let idx = idx.min(candles.len().saturating_sub(1));
    candles[idx].ts
}

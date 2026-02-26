//! Drawing overlay scene builder.
//!
//! Drawings are converted into generic `DrawCommand`s so they can be rendered
//! by any backend, just like candles and axes.

pub mod builders;
pub mod preview;
pub mod styles;

use self::styles::{
    color_with_opacity, fill_for_drawing, stroke_for_drawing, stroke_for_drawing_or_fallback,
};
use crate::{
    chart::appearance::ChartAppearanceConfig,
    drawings::shape::fib as fib_shape,
    drawings::{store::DrawingStore, types::Drawing},
    layout::ChartLayout,
    render::primitives::DrawCommand,
    render::styles::{ColorRef, ColorToken, FillStyle, StrokeStyle, TextAlign, TextStyle},
    render::ticks::{HumanTimeFormatter, TimeLabelFormatter},
    scale::PriceScale,
    types::{Candle, Point, Rect},
    viewport::Viewport,
};

pub fn build_drawing_commands(
    store: &DrawingStore,
    layout: ChartLayout,
    ps: PriceScale,
    viewport: Option<Viewport>,
    candles: &[Candle],
    selected_drawing_id: Option<u64>,
    appearance_config: Option<&ChartAppearanceConfig>,
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
                let stroke = stroke_for_drawing(
                    d,
                    ColorToken::DrawingSecondary,
                    if selected { 2.0 } else { 1.0 },
                );
                if let Some(vp) = viewport {
                    let (candle_up, candle_down) = appearance_config
                        .map(|c| (c.candle_up.as_str(), c.candle_down.as_str()))
                        .unwrap_or(("#22c55e", "#ef4444"));
                    let semantic_fill = Some(FillStyle {
                        color: ColorRef::Css(color_with_opacity(
                            if r.is_up { candle_up } else { candle_down },
                            0.22,
                        )),
                    });
                    let fill = fill_for_drawing(d).or(semantic_fill);
                    let border = selected.then(|| stroke.clone());

                    let left_x = vp.world_x_to_pixel_x(r.start_index, price_pane.x, price_pane.w);
                    let right_x = vp.world_x_to_pixel_x(r.end_index, price_pane.x, price_pane.w);
                    let top_y = ps.y_for_price(r.top_price);
                    let bottom_y = ps.y_for_price(r.bottom_price);
                    let rect = rect_from_edges(left_x, right_x, top_y, bottom_y);

                    let price_span = (r.top_price - r.bottom_price).abs();
                    let percent = if r.bottom_price.abs() > 1e-9 {
                        (price_span / r.bottom_price.abs()) * 100.0
                    } else {
                        0.0
                    };
                    let bars = (r.end_index - r.start_index).abs().round() as usize;
                    let duration =
                        format_time_duration_from_indices(r.start_index, r.end_index, candles);

                    out.push(DrawCommand::PushClip { rect: price_pane });
                    out.push(DrawCommand::Rect {
                        rect,
                        fill,
                        stroke: border,
                    });
                    out.push(DrawCommand::PopClip);

                    let signed_span = if r.is_up { price_span } else { -price_span };
                    let signed_pct = if r.is_up { percent } else { -percent };
                    let label = format!(
                        "PRICE | {:+.2} ({:+.2}%) | {bars} bars {duration}",
                        signed_span, signed_pct
                    );
                    out.push(DrawCommand::Text {
                        pos: Point {
                            x: rect.x + 4.0,
                            y: (rect.center().y - 6.0)
                                .clamp(price_pane.y + 4.0, price_pane.bottom() - 14.0),
                        },
                        text: label,
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
                let stroke = stroke_for_drawing(
                    d,
                    ColorToken::DrawingSecondary,
                    if selected { 2.0 } else { 1.0 },
                );
                if let Some(vp) = viewport {
                    let (candle_up, candle_down) = appearance_config
                        .map(|c| (c.candle_up.as_str(), c.candle_down.as_str()))
                        .unwrap_or(("#22c55e", "#ef4444"));
                    let semantic_fill = Some(FillStyle {
                        color: ColorRef::Css(color_with_opacity(
                            if r.is_up { candle_up } else { candle_down },
                            0.22,
                        )),
                    });
                    let fill = fill_for_drawing(d).or(semantic_fill);
                    let border = selected.then(|| stroke.clone());

                    let left_x = vp.world_x_to_pixel_x(r.start_index, price_pane.x, price_pane.w);
                    let right_x = vp.world_x_to_pixel_x(r.end_index, price_pane.x, price_pane.w);
                    let top_y = ps.y_for_price(r.top_price);
                    let bottom_y = ps.y_for_price(r.bottom_price);
                    let rect = rect_from_edges(left_x, right_x, top_y, bottom_y);

                    let bars = (r.end_index - r.start_index).abs().round() as usize;
                    let duration =
                        format_time_duration_from_indices(r.start_index, r.end_index, candles);

                    out.push(DrawCommand::PushClip { rect: price_pane });
                    out.push(DrawCommand::Rect {
                        rect,
                        fill,
                        stroke: border,
                    });
                    out.push(DrawCommand::PopClip);

                    let label = format!("TIME | {bars} bars {duration}");
                    out.push(DrawCommand::Text {
                        pos: Point {
                            x: rect.x + 4.0,
                            y: (rect.center().y - 6.0)
                                .clamp(price_pane.y + 4.0, price_pane.bottom() - 14.0),
                        },
                        text: label,
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
                let stroke = stroke_for_drawing(
                    d,
                    ColorToken::DrawingSecondary,
                    if selected { 2.0 } else { 1.0 },
                );
                if let Some(vp) = viewport {
                    let (candle_up, candle_down) = appearance_config
                        .map(|c| (c.candle_up.as_str(), c.candle_down.as_str()))
                        .unwrap_or(("#22c55e", "#ef4444"));
                    let semantic_fill = Some(FillStyle {
                        color: ColorRef::Css(color_with_opacity(
                            if r.is_up { candle_up } else { candle_down },
                            0.22,
                        )),
                    });
                    let fill = fill_for_drawing(d).or(semantic_fill);
                    let border = selected.then(|| stroke.clone());

                    let left_x = vp.world_x_to_pixel_x(r.start_index, price_pane.x, price_pane.w);
                    let right_x = vp.world_x_to_pixel_x(r.end_index, price_pane.x, price_pane.w);
                    let top_y = ps.y_for_price(r.top_price);
                    let bottom_y = ps.y_for_price(r.bottom_price);
                    let rect = rect_from_edges(left_x, right_x, top_y, bottom_y);

                    let price_span = (r.top_price - r.bottom_price).abs();
                    let percent = if r.bottom_price.abs() > 1e-9 {
                        (price_span / r.bottom_price.abs()) * 100.0
                    } else {
                        0.0
                    };
                    let bars = (r.end_index - r.start_index).abs().round() as usize;
                    let duration =
                        format_time_duration_from_indices(r.start_index, r.end_index, candles);

                    out.push(DrawCommand::PushClip { rect: price_pane });
                    out.push(DrawCommand::Rect {
                        rect,
                        fill,
                        stroke: border,
                    });
                    out.push(DrawCommand::PopClip);

                    let signed_span = if r.is_up { price_span } else { -price_span };
                    let signed_pct = if r.is_up { percent } else { -percent };
                    let label = format!(
                        "DT | {bars} bars {duration} | {:+.2} ({:+.2}%)",
                        signed_span, signed_pct
                    );
                    out.push(DrawCommand::Text {
                        pos: Point {
                            x: rect.x + 4.0,
                            y: (rect.center().y - 6.0)
                                .clamp(price_pane.y + 4.0, price_pane.bottom() - 14.0),
                        },
                        text: label,
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
                let (candle_up, candle_down) = appearance_config
                    .map(|c| (c.candle_up.as_str(), c.candle_down.as_str()))
                    .unwrap_or(("#22c55e", "#ef4444"));
                let reward_fill = Some(FillStyle {
                    color: ColorRef::Css(color_with_opacity(candle_up, 0.22)),
                });
                let risk_fill = Some(FillStyle {
                    color: ColorRef::Css(color_with_opacity(candle_down, 0.22)),
                });
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

                    let reward_amount = p.target_price - p.entry_price;
                    let risk_amount = p.entry_price - p.stop_price;
                    let reward_pct = if p.entry_price > 0.0 {
                        (reward_amount / p.entry_price) * 100.0
                    } else {
                        0.0
                    };
                    let risk_pct = if p.entry_price > 0.0 {
                        (risk_amount / p.entry_price) * 100.0
                    } else {
                        0.0
                    };
                    let rr = if risk_amount > 1e-12 {
                        reward_amount / risk_amount
                    } else {
                        0.0
                    };

                    let lifecycle = simulate_long_position(
                        candles,
                        p.start_index,
                        p.end_index,
                        p.entry_price,
                        p.stop_price,
                        p.target_price,
                    );

                    let reward_rect = rect_from_edges(left_x, right_x, target_y, entry_y);
                    let risk_rect = rect_from_edges(left_x, right_x, entry_y, stop_y);
                    out.push(DrawCommand::PushClip { rect: price_pane });

                    if let Some(lc) = lifecycle {
                        let exit_p = lc.exit_price;
                        let exit_y = ps.y_for_price(exit_p);
                        let entry_x =
                            vp.world_x_to_pixel_x(lc.entry_idx as f32, price_pane.x, price_pane.w);
                        let exit_x =
                            vp.world_x_to_pixel_x(lc.exit_idx as f32, price_pane.x, price_pane.w);
                        let exited_rect = rect_from_edges(entry_x, exit_x, entry_y, exit_y);
                        let darker = Some(FillStyle {
                            color: ColorRef::Css(color_with_opacity(
                                if exit_p >= p.entry_price {
                                    candle_up
                                } else {
                                    candle_down
                                },
                                0.35,
                            )),
                        });
                        out.push(DrawCommand::Rect {
                            rect: exited_rect,
                            fill: darker,
                            stroke: None,
                        });
                    }

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
                    let rr_text = format!(
                        "LONG | RR {:.1}{}",
                        rr,
                        lifecycle
                            .map(|lc| {
                                format!(
                                    " | {}",
                                    format_time_duration_from_indices(
                                        lc.entry_idx as f32,
                                        lc.exit_idx as f32,
                                        candles
                                    )
                                )
                            })
                            .unwrap_or_else(|| " | pending".to_string())
                    );
                    out.push(DrawCommand::Text {
                        pos: Point {
                            x: right_x,
                            y: target_y - 4.0,
                        },
                        text: rr_text,
                        style: TextStyle::token(
                            ColorToken::DrawingPrimaryText,
                            10.0,
                            TextAlign::Right,
                        ),
                    });
                    let reward_label = format!("+{:.2} ({:.2}%)", reward_amount, reward_pct);
                    out.push(DrawCommand::Text {
                        pos: Point {
                            x: left_x + 4.0,
                            y: reward_rect.center().y - 5.0,
                        },
                        text: reward_label,
                        style: TextStyle::css(candle_up.to_string(), 9.0, TextAlign::Left),
                    });
                    let risk_label = format!("-{:.2} ({:.2}%)", risk_amount, risk_pct);
                    out.push(DrawCommand::Text {
                        pos: Point {
                            x: left_x + 4.0,
                            y: risk_rect.center().y - 5.0,
                        },
                        text: risk_label,
                        style: TextStyle::css(candle_down.to_string(), 9.0, TextAlign::Left),
                    });
                    out.push(DrawCommand::PopClip);
                }
            }
            Drawing::ShortPosition(p) => {
                let selected = selected_drawing_id == Some(p.id);
                let (candle_up, candle_down) = appearance_config
                    .map(|c| (c.candle_up.as_str(), c.candle_down.as_str()))
                    .unwrap_or(("#22c55e", "#ef4444"));
                let reward_fill = Some(FillStyle {
                    color: ColorRef::Css(color_with_opacity(candle_down, 0.22)),
                });
                let risk_fill = Some(FillStyle {
                    color: ColorRef::Css(color_with_opacity(candle_up, 0.22)),
                });
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

                    let reward_amount = p.entry_price - p.target_price;
                    let risk_amount = p.stop_price - p.entry_price;
                    let reward_pct = if p.entry_price > 0.0 {
                        (reward_amount / p.entry_price) * 100.0
                    } else {
                        0.0
                    };
                    let risk_pct = if p.entry_price > 0.0 {
                        (risk_amount / p.entry_price) * 100.0
                    } else {
                        0.0
                    };
                    let rr = if risk_amount > 1e-12 {
                        reward_amount / risk_amount
                    } else {
                        0.0
                    };

                    let lifecycle = simulate_short_position(
                        candles,
                        p.start_index,
                        p.end_index,
                        p.entry_price,
                        p.stop_price,
                        p.target_price,
                    );

                    let reward_rect = rect_from_edges(left_x, right_x, entry_y, target_y);
                    let risk_rect = rect_from_edges(left_x, right_x, stop_y, entry_y);
                    out.push(DrawCommand::PushClip { rect: price_pane });

                    if let Some(lc) = lifecycle {
                        let exit_p = lc.exit_price;
                        let exit_y = ps.y_for_price(exit_p);
                        let entry_x =
                            vp.world_x_to_pixel_x(lc.entry_idx as f32, price_pane.x, price_pane.w);
                        let exit_x =
                            vp.world_x_to_pixel_x(lc.exit_idx as f32, price_pane.x, price_pane.w);
                        let exited_rect = rect_from_edges(entry_x, exit_x, entry_y, exit_y);
                        let darker = Some(FillStyle {
                            color: ColorRef::Css(color_with_opacity(
                                if exit_p <= p.entry_price {
                                    candle_down
                                } else {
                                    candle_up
                                },
                                0.35,
                            )),
                        });
                        out.push(DrawCommand::Rect {
                            rect: exited_rect,
                            fill: darker,
                            stroke: None,
                        });
                    }

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
                    let rr_text = format!(
                        "SHORT | RR {:.1}{}",
                        rr,
                        lifecycle
                            .map(|lc| {
                                format!(
                                    " | {}",
                                    format_time_duration_from_indices(
                                        lc.entry_idx as f32,
                                        lc.exit_idx as f32,
                                        candles
                                    )
                                )
                            })
                            .unwrap_or_else(|| " | pending".to_string())
                    );
                    out.push(DrawCommand::Text {
                        pos: Point {
                            x: right_x,
                            y: target_y + 12.0,
                        },
                        text: rr_text,
                        style: TextStyle::token(
                            ColorToken::DrawingSecondaryText,
                            10.0,
                            TextAlign::Right,
                        ),
                    });
                    let reward_label = format!("+{:.2} ({:.2}%)", reward_amount, reward_pct);
                    out.push(DrawCommand::Text {
                        pos: Point {
                            x: left_x + 4.0,
                            y: reward_rect.center().y - 5.0,
                        },
                        text: reward_label,
                        style: TextStyle::css(candle_down.to_string(), 9.0, TextAlign::Left),
                    });
                    let risk_label = format!("-{:.2} ({:.2}%)", risk_amount, risk_pct);
                    out.push(DrawCommand::Text {
                        pos: Point {
                            x: left_x + 4.0,
                            y: risk_rect.center().y - 5.0,
                        },
                        text: risk_label,
                        style: TextStyle::css(candle_up.to_string(), 9.0, TextAlign::Left),
                    });
                    out.push(DrawCommand::PopClip);
                }
            }
            Drawing::Text(t) => {
                if let Some(vp) = viewport {
                    let x = vp.world_x_to_pixel_x(t.index, price_pane.x, price_pane.w);
                    let y = ps.y_for_price(t.price);
                    if x >= price_pane.x
                        && x <= price_pane.right()
                        && y >= price_pane.y
                        && y <= price_pane.bottom()
                    {
                        let text_color = d.style().stroke_color.as_deref().unwrap_or("#e5e7eb");
                        let size = d.style().font_size.unwrap_or(14.0);
                        let bg_color = d.style().fill_color.as_ref().map(|c| {
                            let alpha = d.style().fill_opacity.unwrap_or(0.9);
                            color_with_opacity(c, alpha)
                        });
                        out.push(DrawCommand::PushClip { rect: price_pane });
                        if let Some(ref bg) = bg_color {
                            let pad = 4.0;
                            let est_w = (t.text.len() as f32 * size * 0.6).max(40.0);
                            let h = size + pad * 2.0;
                            let rect = Rect {
                                x: x - 2.0,
                                y: y - h * 0.5,
                                w: est_w + pad,
                                h,
                            };
                            out.push(DrawCommand::Rect {
                                rect,
                                fill: Some(FillStyle::css(bg.clone())),
                                stroke: None,
                            });
                        }
                        out.push(DrawCommand::Text {
                            pos: Point {
                                x: x + 4.0,
                                y: y + size * 0.35,
                            },
                            text: t.text.clone(),
                            style: TextStyle::css(text_color.to_string(), size, TextAlign::Left),
                        });
                        out.push(DrawCommand::PopClip);
                    }
                }
            }
            Drawing::FibRetracement(fib) => {
                let selected = selected_drawing_id == Some(fib.id);
                let band_fill_override = d
                    .style()
                    .fill_color
                    .as_ref()
                    .map(|c| FillStyle::css(c.clone()));
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
            Drawing::BrushStroke(s) => {
                let selected = selected_drawing_id == Some(s.id);
                let stroke = stroke_for_drawing(
                    d,
                    ColorToken::DrawingPrimary,
                    if selected { 2.0 } else { 1.0 },
                );
                if let Some(vp) = viewport {
                    let pts: Vec<_> = s
                        .points
                        .iter()
                        .map(|p| {
                            let x = vp.world_x_to_pixel_x(p.index, price_pane.x, price_pane.w);
                            let y = ps.y_for_price(p.price);
                            Point { x, y }
                        })
                        .collect();
                    if pts.len() >= 2 {
                        out.push(DrawCommand::PushClip { rect: price_pane });
                        out.push(DrawCommand::Polyline {
                            points: pts,
                            stroke,
                        });
                        out.push(DrawCommand::PopClip);
                    }
                }
            }
            Drawing::HighlightStroke(s) => {
                let selected = selected_drawing_id == Some(s.id);
                let stroke = stroke_for_drawing(
                    d,
                    ColorToken::DrawingSecondary,
                    if selected { 2.0 } else { 1.0 },
                );
                let opacity = d.style().fill_opacity.unwrap_or(0.35);
                let stroke = match stroke.color {
                    ColorRef::Css(ref c) => {
                        let mut s = stroke.clone();
                        s.color = ColorRef::Css(color_with_opacity(c, opacity));
                        s
                    }
                    ColorRef::Token(_) => {
                        let mut s = stroke.clone();
                        // Fallback to a clear default if it's just a token
                        s.color = ColorRef::Css(color_with_opacity("#38bdf8", opacity));
                        s
                    }
                };
                if let Some(vp) = viewport {
                    let pts: Vec<_> = s
                        .points
                        .iter()
                        .map(|p| {
                            let x = vp.world_x_to_pixel_x(p.index, price_pane.x, price_pane.w);
                            let y = ps.y_for_price(p.price);
                            Point { x, y }
                        })
                        .collect();
                    if pts.len() >= 2 {
                        out.push(DrawCommand::PushClip { rect: price_pane });
                        out.push(DrawCommand::Polyline {
                            points: pts,
                            stroke,
                        });
                        out.push(DrawCommand::PopClip);
                    }
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
                item.is_up,
            );
        }
        Drawing::TimeRange(item) => {
            temp.add_time_range(
                item.start_index,
                item.end_index,
                item.top_price,
                item.bottom_price,
                item.is_up,
            );
        }
        Drawing::DateTimeRange(item) => {
            temp.add_date_time_range(
                item.start_index,
                item.end_index,
                item.top_price,
                item.bottom_price,
                item.is_up,
            );
        }
        Drawing::LongPosition(item) => {
            temp.add_long_position(
                item.start_index,
                item.end_index,
                item.entry_index,
                item.entry_price,
                item.stop_price,
                item.target_price,
            );
        }
        Drawing::ShortPosition(item) => {
            temp.add_short_position(
                item.start_index,
                item.end_index,
                item.entry_index,
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
        Drawing::Text(item) => {
            temp.add_text(item.index, item.price, item.text.clone());
        }
        Drawing::BrushStroke(item) => {
            temp.add_brush_stroke(item.points.clone());
        }
        Drawing::HighlightStroke(item) => {
            temp.add_highlight_stroke(item.points.clone());
        }
    }

    if let Some(first) = temp.items().first().map(|item| item.id()) {
        let _ = temp.set_drawing_layer(first, "preview");
    }

    build_drawing_commands(&temp, layout, ps, viewport, &[], None, None)
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

#[derive(Clone, Copy)]
struct PositionLifecycle {
    entry_idx: usize,
    exit_idx: usize,
    exit_price: f64,
}

fn index_window(start_index: f32, end_index: f32, len: usize) -> Option<(usize, usize)> {
    if len == 0 {
        return None;
    }
    let lo = start_index.min(end_index).floor().max(0.0) as usize;
    let hi = end_index.max(start_index).floor().max(0.0) as usize;
    let start = lo.min(len.saturating_sub(1));
    let end = hi.min(len.saturating_sub(1));
    if start > end {
        None
    } else {
        Some((start, end))
    }
}

fn simulate_long_position(
    candles: &[Candle],
    start_index: f32,
    end_index: f32,
    entry_price: f64,
    stop_price: f64,
    target_price: f64,
) -> Option<PositionLifecycle> {
    let (start, end) = index_window(start_index, end_index, candles.len())?;

    let mut entry_idx: Option<usize> = None;
    for (i, c) in candles.iter().enumerate().take(end + 1).skip(start) {
        if c.low <= entry_price && c.high >= entry_price {
            entry_idx = Some(i);
            break;
        }
    }
    let entry_idx = entry_idx?;

    for (i, c) in candles
        .iter()
        .enumerate()
        .take(end + 1)
        .skip(entry_idx.saturating_add(1))
    {
        let hit_stop = c.low <= stop_price;
        let hit_target = c.high >= target_price;
        if hit_stop {
            return Some(PositionLifecycle {
                entry_idx,
                exit_idx: i,
                exit_price: stop_price,
            });
        }
        if hit_target {
            return Some(PositionLifecycle {
                entry_idx,
                exit_idx: i,
                exit_price: target_price,
            });
        }
    }

    Some(PositionLifecycle {
        entry_idx,
        exit_idx: end,
        exit_price: candles[end].close,
    })
}

fn simulate_short_position(
    candles: &[Candle],
    start_index: f32,
    end_index: f32,
    entry_price: f64,
    stop_price: f64,
    target_price: f64,
) -> Option<PositionLifecycle> {
    let (start, end) = index_window(start_index, end_index, candles.len())?;

    let mut entry_idx: Option<usize> = None;
    for (i, c) in candles.iter().enumerate().take(end + 1).skip(start) {
        if c.low <= entry_price && c.high >= entry_price {
            entry_idx = Some(i);
            break;
        }
    }
    let entry_idx = entry_idx?;

    for (i, c) in candles
        .iter()
        .enumerate()
        .take(end + 1)
        .skip(entry_idx.saturating_add(1))
    {
        let hit_stop = c.high >= stop_price;
        let hit_target = c.low <= target_price;
        if hit_stop {
            return Some(PositionLifecycle {
                entry_idx,
                exit_idx: i,
                exit_price: stop_price,
            });
        }
        if hit_target {
            return Some(PositionLifecycle {
                entry_idx,
                exit_idx: i,
                exit_price: target_price,
            });
        }
    }

    Some(PositionLifecycle {
        entry_idx,
        exit_idx: end,
        exit_price: candles[end].close,
    })
}

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
                let y = ps.y_for_price(h.price);
                if y >= price_pane.y && y <= price_pane.bottom() {
                    out.push(DrawCommand::PushClip { rect: price_pane });
                    out.push(DrawCommand::Line {
                        from: Point { x: price_pane.x, y },
                        to: Point {
                            x: price_pane.right(),
                            y,
                        },
                        stroke: StrokeStyle::token(
                            ColorToken::DrawingPrimary,
                            if selected { 2.0 } else { 1.0 },
                        ),
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
                if let Some(vp) = viewport {
                    let x = vp.world_x_to_pixel_x(v.index, price_pane.x, price_pane.w);
                    if x >= price_pane.x && x <= price_pane.right() {
                        let bottom_y = layout.plot_bottom();

                        out.push(DrawCommand::PushClip { rect: layout.plot });
                        out.push(DrawCommand::Line {
                            from: Point { x, y: price_pane.y },
                            to: Point { x, y: bottom_y },
                            stroke: StrokeStyle::token(
                                ColorToken::DrawingSecondary,
                                if selected { 2.0 } else { 1.0 },
                            ),
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
                            stroke: StrokeStyle::token(
                                ColorToken::DrawingSecondary,
                                if selected { 2.0 } else { 1.0 },
                            ),
                        });
                        out.push(DrawCommand::PopClip);
                    }
                }
            }
            Drawing::Rectangle(r) => {
                let selected = selected_drawing_id == Some(r.id);
                if let Some(vp) = viewport {
                    let left_x = vp.world_x_to_pixel_x(r.start_index, price_pane.x, price_pane.w);
                    let right_x = vp.world_x_to_pixel_x(r.end_index, price_pane.x, price_pane.w);
                    let top_y = ps.y_for_price(r.top_price);
                    let bottom_y = ps.y_for_price(r.bottom_price);

                    let rect = rect_from_edges(left_x, right_x, top_y, bottom_y);
                    out.push(DrawCommand::PushClip { rect: price_pane });
                    out.push(DrawCommand::Rect {
                        rect,
                        fill: Some(FillStyle::token(ColorToken::BullMuted)),
                        stroke: Some(StrokeStyle::token(
                            ColorToken::DrawingPrimary,
                            if selected { 2.0 } else { 1.0 },
                        )),
                    });
                    out.push(DrawCommand::PopClip);
                }
            }
            Drawing::PriceRange(r) => {
                let selected = selected_drawing_id == Some(r.id);
                if let Some(vp) = viewport {
                    let left_x = vp.world_x_to_pixel_x(r.start_index, price_pane.x, price_pane.w);
                    let right_x = vp.world_x_to_pixel_x(r.end_index, price_pane.x, price_pane.w);
                    let top_y = ps.y_for_price(r.top_price);
                    let bottom_y = ps.y_for_price(r.bottom_price);
                    let rect = rect_from_edges(left_x, right_x, top_y, bottom_y);

                    out.push(DrawCommand::PushClip { rect: price_pane });
                    out.push(DrawCommand::Rect {
                        rect,
                        fill: Some(FillStyle::token(ColorToken::BullMuted)),
                        stroke: Some(StrokeStyle::token(
                            ColorToken::DrawingSecondary,
                            if selected { 2.0 } else { 1.0 },
                        )),
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
                if let Some(vp) = viewport {
                    let left_x = vp.world_x_to_pixel_x(r.start_index, price_pane.x, price_pane.w);
                    let right_x = vp.world_x_to_pixel_x(r.end_index, price_pane.x, price_pane.w);
                    let top_y = ps.y_for_price(r.top_price);
                    let bottom_y = ps.y_for_price(r.bottom_price);
                    let rect = rect_from_edges(left_x, right_x, top_y, bottom_y);

                    out.push(DrawCommand::PushClip { rect: price_pane });
                    out.push(DrawCommand::Rect {
                        rect,
                        fill: Some(FillStyle::token(ColorToken::PaneBorder)),
                        stroke: Some(StrokeStyle::token(
                            ColorToken::DrawingSecondary,
                            if selected { 2.0 } else { 1.0 },
                        )),
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
                if let Some(vp) = viewport {
                    let left_x = vp.world_x_to_pixel_x(r.start_index, price_pane.x, price_pane.w);
                    let right_x = vp.world_x_to_pixel_x(r.end_index, price_pane.x, price_pane.w);
                    let top_y = ps.y_for_price(r.top_price);
                    let bottom_y = ps.y_for_price(r.bottom_price);
                    let rect = rect_from_edges(left_x, right_x, top_y, bottom_y);

                    out.push(DrawCommand::PushClip { rect: price_pane });
                    out.push(DrawCommand::Rect {
                        rect,
                        fill: Some(FillStyle::token(ColorToken::BullMuted)),
                        stroke: Some(StrokeStyle::token(
                            ColorToken::DrawingSecondary,
                            if selected { 2.0 } else { 1.0 },
                        )),
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
                        fill: Some(FillStyle::token(ColorToken::BullMuted)),
                        stroke: None,
                    });
                    out.push(DrawCommand::Rect {
                        rect: risk_rect,
                        fill: Some(FillStyle::token(ColorToken::BearMuted)),
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
                        stroke: StrokeStyle::token(
                            ColorToken::DrawingPrimary,
                            if selected { 2.0 } else { 1.0 },
                        ),
                    });
                    out.push(DrawCommand::Rect {
                        rect: rect_from_edges(left_x, right_x, target_y, stop_y),
                        fill: None,
                        stroke: Some(StrokeStyle::token(
                            ColorToken::DrawingPrimary,
                            if selected { 2.0 } else { 1.0 },
                        )),
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
                        fill: Some(FillStyle::token(ColorToken::BullMuted)),
                        stroke: None,
                    });
                    out.push(DrawCommand::Rect {
                        rect: risk_rect,
                        fill: Some(FillStyle::token(ColorToken::BearMuted)),
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
                        stroke: StrokeStyle::token(
                            ColorToken::DrawingSecondary,
                            if selected { 2.0 } else { 1.0 },
                        ),
                    });
                    out.push(DrawCommand::Rect {
                        rect: rect_from_edges(left_x, right_x, stop_y, target_y),
                        fill: None,
                        stroke: Some(StrokeStyle::token(
                            ColorToken::DrawingSecondary,
                            if selected { 2.0 } else { 1.0 },
                        )),
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
                        let fill = if i % 2 == 0 {
                            "rgba(56,189,248,0.10)"
                        } else {
                            "rgba(59,130,246,0.06)"
                        };
                        out.push(DrawCommand::Rect {
                            rect: band,
                            fill: Some(FillStyle::css(fill.to_string())),
                            stroke: None,
                        });
                    }

                    for (level, level_price, y) in levels {
                        let major = (level - 0.0).abs() < 1e-9
                            || (level - 0.5).abs() < 1e-9
                            || (level - 1.0).abs() < 1e-9;
                        out.push(DrawCommand::Line {
                            from: Point { x: x_left, y },
                            to: Point { x: x_right, y },
                            stroke: StrokeStyle::css(
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
                            ),
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
                    let edge_stroke = StrokeStyle::css(
                        "rgba(96,165,250,0.92)".to_string(),
                        if selected { 2.0 } else { 1.25 },
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

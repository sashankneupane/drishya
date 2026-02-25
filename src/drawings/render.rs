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
    scale::PriceScale,
    types::{Point, Rect},
    viewport::Viewport,
};

pub fn build_drawing_commands(
    store: &DrawingStore,
    layout: ChartLayout,
    ps: PriceScale,
    viewport: Option<Viewport>,
) -> Vec<DrawCommand> {
    let mut out = Vec::new();
    let Some(price_pane) = layout.price_pane() else {
        return out;
    };

    let drawings = store.visible_items_in_paint_order();

    for d in drawings {
        match d {
            Drawing::HorizontalLine(h) => {
                let y = ps.y_for_price(h.price);
                if y >= price_pane.y && y <= price_pane.bottom() {
                    out.push(DrawCommand::PushClip { rect: price_pane });
                    out.push(DrawCommand::Line {
                        from: Point { x: price_pane.x, y },
                        to: Point {
                            x: price_pane.right(),
                            y,
                        },
                        stroke: StrokeStyle::token(ColorToken::DrawingPrimary, 1.0),
                    });

                    out.push(DrawCommand::Text {
                        pos: Point {
                            x: layout.y_axis.x + layout.y_axis.w - 4.0,
                            y: y + 4.0,
                        },
                        text: format!("{:.2}", h.price),
                        style: TextStyle::token(
                            ColorToken::DrawingPrimaryText,
                            11.0,
                            TextAlign::Right,
                        ),
                    });
                    out.push(DrawCommand::PopClip);
                }
            }
            Drawing::VerticalLine(v) => {
                if let Some(vp) = viewport {
                    let x = vp.world_x_to_pixel_x(v.index, price_pane.x, price_pane.w);
                    if x >= price_pane.x && x <= price_pane.right() {
                        let bottom_y = layout.plot_bottom();

                        out.push(DrawCommand::PushClip { rect: layout.plot });
                        out.push(DrawCommand::Line {
                            from: Point { x, y: price_pane.y },
                            to: Point { x, y: bottom_y },
                            stroke: StrokeStyle::token(ColorToken::DrawingSecondary, 1.0),
                        });

                        out.push(DrawCommand::Text {
                            pos: Point {
                                x,
                                y: layout.x_axis.y + 16.0,
                            },
                            text: "|".to_string(),
                            style: TextStyle::token(
                                ColorToken::DrawingSecondaryText,
                                12.0,
                                TextAlign::Center,
                            ),
                        });
                        out.push(DrawCommand::PopClip);
                    }
                }
            }
            Drawing::Ray(ray) => {
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
                            stroke: StrokeStyle::token(ColorToken::DrawingSecondary, 1.0),
                        });
                        out.push(DrawCommand::PopClip);
                    }
                }
            }
            Drawing::Rectangle(r) => {
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
                        stroke: Some(StrokeStyle::token(ColorToken::DrawingPrimary, 1.0)),
                    });
                    out.push(DrawCommand::PopClip);
                }
            }
            Drawing::LongPosition(p) => {
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
                        stroke: StrokeStyle::token(ColorToken::DrawingPrimary, 1.0),
                    });
                    out.push(DrawCommand::Rect {
                        rect: rect_from_edges(left_x, right_x, target_y, stop_y),
                        fill: None,
                        stroke: Some(StrokeStyle::token(ColorToken::DrawingPrimary, 1.0)),
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
                        stroke: StrokeStyle::token(ColorToken::DrawingSecondary, 1.0),
                    });
                    out.push(DrawCommand::Rect {
                        rect: rect_from_edges(left_x, right_x, stop_y, target_y),
                        fill: None,
                        stroke: Some(StrokeStyle::token(ColorToken::DrawingSecondary, 1.0)),
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
                if let Some(vp) = viewport {
                    let left_x = vp.world_x_to_pixel_x(fib.start_index, price_pane.x, price_pane.w);
                    let right_x = vp.world_x_to_pixel_x(fib.end_index, price_pane.x, price_pane.w);
                    let x_left = left_x.min(right_x);
                    let x_right = left_x.max(right_x);

                    out.push(DrawCommand::PushClip { rect: price_pane });
                    for level in fib_shape::levels() {
                        let level_price = fib_shape::level_price(fib, *level);
                        let y = ps.y_for_price(level_price);
                        out.push(DrawCommand::Line {
                            from: Point { x: x_left, y },
                            to: Point { x: x_right, y },
                            stroke: StrokeStyle::token(ColorToken::DrawingPrimary, 1.0),
                        });
                        out.push(DrawCommand::Text {
                            pos: Point {
                                x: x_right,
                                y: y - 2.0,
                            },
                            text: format!("{:.1}% {:.2}", level * 100.0, level_price),
                            style: TextStyle::token(
                                ColorToken::DrawingPrimaryText,
                                10.0,
                                TextAlign::Right,
                            ),
                        });
                    }
                    out.push(DrawCommand::Rect {
                        rect: rect_from_edges(
                            x_left,
                            x_right,
                            ps.y_for_price(fib.start_price),
                            ps.y_for_price(fib.end_price),
                        ),
                        fill: None,
                        stroke: Some(StrokeStyle::token(ColorToken::DrawingPrimary, 1.0)),
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

    build_drawing_commands(&temp, layout, ps, viewport)
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

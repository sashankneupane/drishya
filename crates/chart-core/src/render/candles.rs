//! Candle body/wick scene builder.
//!
//! The builder maps each visible candle to one wick line and one body rect.

use crate::{
    render::primitives::DrawCommand,
    render::styles::{ColorRef, FillStyle, StrokeStyle},
    scale::{PriceScale, TimeScale},
    types::{Candle, Point, Rect},
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CandleBodyStyle {
    Solid,
    Hollow,
    Bars,
    Volume,
}

pub fn build_candle_commands(
    candles: &[Candle],
    visible_start: usize,
    ts: TimeScale,
    ps: PriceScale,
    body_style: CandleBodyStyle,
    bull_color: ColorRef,
    bear_color: ColorRef,
) -> Vec<DrawCommand> {
    let mut out = Vec::new();
    let cw = ts.candle_width();
    let max_volume = candles
        .iter()
        .map(|c| c.volume)
        .fold(0.0_f64, |acc, v| acc.max(v));

    for (i, c) in candles.iter().enumerate() {
        let global_idx = visible_start + i;
        let x = ts.x_for_global_index(global_idx);

        let bull = c.close >= c.open;
        let color = if bull {
            bull_color.clone()
        } else {
            bear_color.clone()
        };

        let y_high = ps.y_for_price(c.high);
        let y_low = ps.y_for_price(c.low);

        // Body height is clamped to at least 1px so doji candles remain visible.
        let y_open = ps.y_for_price(c.open);
        let y_close = ps.y_for_price(c.close);
        let y = y_open.min(y_close);
        let h = (y_open - y_close).abs().max(1.0);
        let body_top = y;
        let body_bottom = y + h;

        // Wick / bar spine
        let stroke_color = |c: &ColorRef| StrokeStyle {
            color: c.clone(),
            width: 1.0,
            dash: None,
        };
        let fill_color = |c: &ColorRef| FillStyle { color: c.clone() };
        match body_style {
            CandleBodyStyle::Solid => {
                out.push(DrawCommand::Line {
                    from: Point { x, y: y_high },
                    to: Point { x, y: y_low },
                    stroke: stroke_color(&color),
                });
            }
            CandleBodyStyle::Hollow => {
                // Hollow candles keep wick ticks above/below body only.
                if y_high < body_top {
                    out.push(DrawCommand::Line {
                        from: Point { x, y: y_high },
                        to: Point { x, y: body_top },
                        stroke: stroke_color(&color),
                    });
                }
                if body_bottom < y_low {
                    out.push(DrawCommand::Line {
                        from: Point { x, y: body_bottom },
                        to: Point { x, y: y_low },
                        stroke: stroke_color(&color),
                    });
                }
            }
            CandleBodyStyle::Bars => {
                out.push(DrawCommand::Line {
                    from: Point { x, y: y_high },
                    to: Point { x, y: y_low },
                    stroke: stroke_color(&color),
                });
            }
            CandleBodyStyle::Volume => {
                out.push(DrawCommand::Line {
                    from: Point { x, y: y_high },
                    to: Point { x, y: y_low },
                    stroke: stroke_color(&color),
                });
            }
        }

        match body_style {
            CandleBodyStyle::Bars => {
                // OHLC bars: open tick to the left, close tick to the right.
                let tick_w = (cw * 0.45).max(1.0);
                out.push(DrawCommand::Line {
                    from: Point {
                        x: x - tick_w,
                        y: y_open,
                    },
                    to: Point { x, y: y_open },
                    stroke: stroke_color(&color),
                });
                out.push(DrawCommand::Line {
                    from: Point { x, y: y_close },
                    to: Point {
                        x: x + tick_w,
                        y: y_close,
                    },
                    stroke: stroke_color(&color),
                });
            }
            CandleBodyStyle::Solid | CandleBodyStyle::Hollow | CandleBodyStyle::Volume => {
                let body_w = match body_style {
                    CandleBodyStyle::Volume => {
                        let vol_ratio = if max_volume > 0.0 {
                            (c.volume / max_volume).clamp(0.0, 1.0) as f32
                        } else {
                            0.0
                        };
                        // Increase perceptual separation for high/low volume candles.
                        // Lower gamma amplifies differences near the lower end too.
                        let width_factor = 0.15 + 0.85 * vol_ratio.powf(0.55);
                        (cw * width_factor).max(1.0)
                    }
                    _ => cw,
                };

                let (fill, stroke) = match body_style {
                    CandleBodyStyle::Solid => (Some(fill_color(&color)), None),
                    CandleBodyStyle::Hollow => {
                        let fill = if bull { None } else { Some(fill_color(&color)) };
                        (fill, Some(stroke_color(&color)))
                    }
                    CandleBodyStyle::Volume => (Some(fill_color(&color)), None),
                    CandleBodyStyle::Bars => unreachable!(),
                };

                out.push(DrawCommand::Rect {
                    rect: Rect {
                        x: x - body_w * 0.5,
                        y,
                        w: body_w,
                        h,
                    },
                    fill,
                    stroke,
                });
            }
        }
    }

    out
}

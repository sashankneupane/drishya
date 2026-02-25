//! Candle body/wick scene builder.
//!
//! The builder maps each visible candle to one wick line and one body rect.

use crate::{
    render::primitives::DrawCommand,
    render::styles::{ColorToken, FillStyle, StrokeStyle},
    scale::{PriceScale, TimeScale},
    types::{Candle, Point, Rect},
};

pub fn build_candle_commands(
    candles: &[Candle],
    visible_start: usize,
    ts: TimeScale,
    ps: PriceScale,
) -> Vec<DrawCommand> {
    let mut out = Vec::new();
    let cw = ts.candle_width();

    for (i, c) in candles.iter().enumerate() {
        let global_idx = visible_start + i;
        let x = ts.x_for_global_index(global_idx);

        let bull = c.close >= c.open;
        let color = if bull {
            ColorToken::Bull
        } else {
            ColorToken::Bear
        };

        // Wick
        out.push(DrawCommand::Line {
            from: Point {
                x,
                y: ps.y_for_price(c.high),
            },
            to: Point {
                x,
                y: ps.y_for_price(c.low),
            },
            stroke: StrokeStyle::token(color, 1.0),
        });

        // Body height is clamped to at least 1px so doji candles remain visible.
        let y_open = ps.y_for_price(c.open);
        let y_close = ps.y_for_price(c.close);
        let y = y_open.min(y_close);
        let h = (y_open - y_close).abs().max(1.0);

        out.push(DrawCommand::Rect {
            rect: Rect {
                x: x - cw * 0.5,
                y,
                w: cw,
                h,
            },
            fill: Some(FillStyle::token(color)),
            stroke: None,
        });
    }

    out
}

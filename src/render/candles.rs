//! Candle body/wick scene builder.
//!
//! The builder maps each visible candle to one wick line and one body rect.

use crate::{
    render::primitives::DrawCommand,
    scale::{PriceScale, TimeScale},
    types::{Candle, Point, Rect},
};

pub fn build_candle_commands(candles: &[Candle], ts: TimeScale, ps: PriceScale) -> Vec<DrawCommand> {
    let mut out = Vec::new();
    let cw = ts.candle_width();

    for (i, c) in candles.iter().enumerate() {
        let x = ts.x_for_index(i);

        let bull = c.close >= c.open;
        let color = if bull { "#22c55e" } else { "#ef4444" }.to_string();

        // Wick
        out.push(DrawCommand::Line {
            from: Point { x, y: ps.y_for_price(c.high) },
            to: Point { x, y: ps.y_for_price(c.low) },
            width: 1.0,
            color: color.clone(),
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
            fill: Some(color),
            stroke: None,
            line_width: 1.0,
        });
    }

    out
}

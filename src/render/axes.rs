//! Axis and grid scene builder.
//!
//! This module emits visual guides and labels; it does not own data transforms
//! beyond simple sampling decisions.

use crate::{
    layout::ChartLayout,
    render::primitives::DrawCommand,
    scale::{PriceScale, TimeScale},
    types::{Candle, Point},
};

pub fn build_axis_commands(
    layout: ChartLayout,
    candles: &[Candle],
    ts: TimeScale,
    ps: PriceScale,
) -> Vec<DrawCommand> {
    let mut out = Vec::new();

    // Pane borders
    out.push(DrawCommand::Rect {
        rect: layout.price_pane,
        fill: None,
        stroke: Some("#1f2937".to_string()),
        line_width: 1.0,
    });
    out.push(DrawCommand::Rect {
        rect: layout.volume_pane,
        fill: None,
        stroke: Some("#1f2937".to_string()),
        line_width: 1.0,
    });

    // Horizontal grid + price labels
    let ticks = 5;
    for i in 0..=ticks {
        let t = i as f32 / ticks as f32;
        let y = layout.price_pane.y + layout.price_pane.h * t;

        out.push(DrawCommand::Line {
            from: Point { x: layout.price_pane.x, y },
            to: Point { x: layout.price_pane.right(), y },
            width: 1.0,
            color: "#111827".to_string(),
        });

        let price = ps.max - (ps.max - ps.min) * t as f64;
        out.push(DrawCommand::Text {
            pos: Point { x: layout.y_axis.x + layout.y_axis.w - 4.0, y: y + 4.0 },
            text: format!("{:.2}", price),
            size: 11.0,
            color: "#9ca3af".to_string(),
            align: "right".to_string(),
        });
    }

    // X labels use coarse index sampling to limit clutter at high candle counts.
    let n = candles.len();
    if n > 0 {
        let label_count = 6usize.min(n);
        for k in 0..label_count {
            let idx = ((n - 1) as f32 * (k as f32 / (label_count.saturating_sub(1).max(1) as f32))).round() as usize;
            let x = ts.x_for_index(idx);

            out.push(DrawCommand::Line {
                from: Point { x, y: layout.price_pane.y },
                to: Point { x, y: layout.volume_pane.bottom() },
                width: 1.0,
                color: "rgba(17,24,39,0.7)".to_string(),
            });

            let ts_val = candles[idx].ts;
            out.push(DrawCommand::Text {
                pos: Point { x, y: layout.x_axis.y + 16.0 },
                text: format!("{}", ts_val),
                size: 10.0,
                color: "#9ca3af".to_string(),
                align: "center".to_string(),
            });
        }
    }

    out
}

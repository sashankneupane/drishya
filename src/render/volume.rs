//! Volume bar scene builder.
//!
//! Volume bars share the time scale with candles so activity aligns with price.

use crate::{
    render::primitives::DrawCommand,
    scale::{TimeScale, VolumeScale},
    types::{Candle, Rect},
};

pub fn build_volume_commands(candles: &[Candle], ts: TimeScale, vs: VolumeScale) -> Vec<DrawCommand> {
    let mut out = Vec::new();
    // Slightly narrower than candle bodies to reduce visual crowding.
    let bw = (ts.candle_width() * 0.9).max(1.0);

    for (i, c) in candles.iter().enumerate() {
        let x = ts.x_for_index(i);
        let y = vs.y_for_volume(c.volume);
        let h = (vs.pane.bottom() - y).max(1.0);

        let bull = c.close >= c.open;
        let color = if bull {
            "rgba(34,197,94,0.45)"
        } else {
            "rgba(239,68,68,0.45)"
        }
        .to_string();

        out.push(DrawCommand::Rect {
            rect: Rect {
                x: x - bw * 0.5,
                y,
                w: bw,
                h,
            },
            fill: Some(color),
            stroke: None,
            line_width: 1.0,
        });
    }

    out
}

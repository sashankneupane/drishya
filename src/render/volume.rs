//! Volume bar scene builder.
//!
//! Volume bars share the time scale with candles so activity aligns with price.

use crate::{
    render::primitives::DrawCommand,
    scale::TimeScale,
    types::{Candle, Rect},
};

pub fn build_volume_commands(
    candles: &[Candle],
    ts: TimeScale,
    pane: Rect,
    max_volume: f64,
) -> Vec<DrawCommand> {
    let mut out = Vec::new();
    // Slightly narrower than candle bodies to reduce visual crowding.
    let bw = (ts.candle_width() * 0.9).max(1.0);
    let maxv = max_volume.max(1e-9);

    // Draw volume as an underlay in the lower portion of the price pane.
    let band_h = pane.h * 0.22;
    let band_top = pane.bottom() - band_h;
    let band_bottom = pane.bottom();

    for (i, c) in candles.iter().enumerate() {
        let x = ts.x_for_index(i);
        let t = (c.volume / maxv) as f32;
        let y = band_bottom - band_h * t;
        let h = (band_bottom - y).max(1.0);

        let bull = c.close >= c.open;
        let color = if bull {
            "rgba(34,197,94,0.30)"
        } else {
            "rgba(239,68,68,0.30)"
        }
        .to_string();

        out.push(DrawCommand::Rect {
            rect: Rect {
                x: x - bw * 0.5,
                y: y.clamp(band_top, band_bottom),
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

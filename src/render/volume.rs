//! Volume bar scene builder.
//!
//! Volume bars share the time scale with candles so activity aligns with price.

use crate::{
    render::primitives::DrawCommand,
    render::styles::{ColorRef, FillStyle},
    scale::TimeScale,
    types::{Candle, Rect},
};

pub fn build_volume_commands(
    candles: &[Candle],
    visible_start: usize,
    ts: TimeScale,
    pane: Rect,
    max_volume: f64,
    bull_color: ColorRef,
    bear_color: ColorRef,
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
        let global_idx = visible_start + i;
        let x = ts.x_for_global_index(global_idx);
        let t = (c.volume / maxv) as f32;
        let y = band_bottom - band_h * t;
        let h = (band_bottom - y).max(1.0);

        let bull = c.close >= c.open;
        let color = if bull {
            bull_color.clone()
        } else {
            bear_color.clone()
        };

        out.push(DrawCommand::Rect {
            rect: Rect {
                x: x - bw * 0.5,
                y: y.clamp(band_top, band_bottom),
                w: bw,
                h,
            },
            fill: Some(FillStyle { color }),
            stroke: None,
        });
    }

    out
}

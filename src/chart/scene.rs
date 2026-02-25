//! Scene composition for the chart.
//!
//! This file is intentionally the only place where chart state is translated
//! into `DrawCommand`s. The Canvas/Web layer should paint commands, not make
//! charting decisions.

use crate::{
    drawings::render::build_drawing_commands,
    layout::{compute_layout, ChartLayout},
    render::{
        axes::build_axis_commands,
        candles::build_candle_commands,
        primitives::DrawCommand,
        volume::build_volume_commands,
    },
    scale::{PriceScale, TimeScale, VolumeScale},
    types::Candle,
};

use super::Chart;

impl Chart {
    pub(crate) fn compute_visible_bounds(&self, visible: &[Candle]) -> (f64, f64, f64) {
        let mut min_price = f64::INFINITY;
        let mut max_price = f64::NEG_INFINITY;
        let mut max_vol = 0.0f64;

        for c in visible {
            min_price = min_price.min(c.low);
            max_price = max_price.max(c.high);
            max_vol = max_vol.max(c.volume);
        }

        // Price padding gives candles breathing room at the pane edges.
        let pad = ((max_price - min_price) * 0.05).max(1e-6);
        (min_price - pad, max_price + pad, max_vol)
    }

    pub fn build_draw_commands(&self) -> Vec<DrawCommand> {
        let mut out = Vec::new();
        let visible = self.visible_data();
        if visible.is_empty() {
            return out;
        }

        let layout: ChartLayout = compute_layout(self.size);
        let (min_price, max_price, max_vol) = self.compute_visible_bounds(visible);

        // Price and volume panes use separate vertical scales but the same
        // horizontal candle count to stay time-aligned.
        let ts_price = TimeScale {
            pane: layout.price_pane,
            count: visible.len(),
        };
        let ts_vol = TimeScale {
            pane: layout.volume_pane,
            count: visible.len(),
        };
        let ps = PriceScale {
            pane: layout.price_pane,
            min: min_price,
            max: max_price,
        };
        let vs = VolumeScale {
            pane: layout.volume_pane,
            max: max_vol,
        };

        // Background
        out.push(DrawCommand::Rect {
            rect: layout.full,
            fill: Some("#030712".to_string()),
            stroke: None,
            line_width: 1.0,
        });

        // Core chart primitives
        out.extend(build_axis_commands(layout, visible, ts_price, ps));
        out.extend(build_candle_commands(visible, ts_price, ps));
        out.extend(build_volume_commands(visible, ts_vol, vs));

        // User drawings are painted last so they stay visually on top.
        out.extend(build_drawing_commands(
            self.drawings.items(),
            layout,
            ps,
            self.viewport,
        ));

        out
    }
}
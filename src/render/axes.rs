//! Axis and grid scene builder.
//!
//! This module emits visual guides and labels; it does not own data transforms
//! beyond simple sampling decisions.

use crate::{
    layout::{AxisVisibilityPolicy, ChartLayout},
    plots::model::PaneId,
    render::primitives::DrawCommand,
    render::ticks::{
        default_axis_formatters, AxisFormatters, DensityXTickProvider, NumericYTickProvider,
    },
    scale::{PriceScale, TimeScale},
    types::{Candle, Point},
};

pub fn build_axis_commands(
    layout: &ChartLayout,
    candles: &[Candle],
    visible_start: usize,
    ts: TimeScale,
    pane_scales: &[(PaneId, PriceScale)],
) -> Vec<DrawCommand> {
    let formatters = default_axis_formatters();
    build_axis_commands_with_formatters(layout, candles, visible_start, ts, pane_scales, &formatters)
}

pub fn build_axis_commands_with_formatters(
    layout: &ChartLayout,
    candles: &[Candle],
    visible_start: usize,
    ts: TimeScale,
    pane_scales: &[(PaneId, PriceScale)],
    formatters: &AxisFormatters<'_>,
) -> Vec<DrawCommand> {
    let mut out = Vec::new();
    let y_provider = NumericYTickProvider::default();
    let x_provider = DensityXTickProvider::default();

    for pane in &layout.panes {
        out.push(DrawCommand::Rect {
            rect: pane.rect,
            fill: None,
            stroke: Some("#1f2937".to_string()),
            line_width: 1.0,
        });

        let pane_scale = pane_scales
            .iter()
            .find(|(id, _)| id == &pane.id)
            .map(|(_, ps)| ps);
        if let Some(ps) = pane_scale {
            // Horizontal grid + y labels per pane, driven by pluggable provider.
            let y_ticks = y_provider.generate(ps.min, ps.max, pane.rect.y, pane.rect.h, formatters.y);
            for tick in y_ticks {
                let y = tick.y;

                out.push(DrawCommand::Line {
                    from: Point { x: pane.rect.x, y },
                    to: Point {
                        x: pane.rect.right(),
                        y,
                    },
                    width: 1.0,
                    color: "#111827".to_string(),
                });

                if pane.y_axis == AxisVisibilityPolicy::Visible {
                    out.push(DrawCommand::Text {
                        pos: Point {
                            x: layout.y_axis.x + layout.y_axis.w - 4.0,
                            y: y + 4.0,
                        },
                        text: tick.label,
                        size: 11.0,
                        color: "#9ca3af".to_string(),
                        align: "right".to_string(),
                    });
                }
            }
        }
    }

    // X ticks use density-aware provider so label count follows viewport density.
    for tick in x_provider.generate(candles, visible_start, ts, formatters.x) {
        let x = tick.x;

        out.push(DrawCommand::Line {
            from: Point {
                x,
                y: layout.plot.y,
            },
            to: Point {
                x,
                y: layout.plot_bottom(),
            },
            width: 1.0,
            color: "rgba(17,24,39,0.7)".to_string(),
        });

        out.push(DrawCommand::Text {
            pos: Point {
                x,
                y: layout.x_axis.y + 16.0,
            },
            text: tick.label,
            size: 10.0,
            color: "#9ca3af".to_string(),
            align: "center".to_string(),
        });
    }

    out
}

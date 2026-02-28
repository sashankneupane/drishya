//! Axis and grid scene builder.
//!
//! This module emits visual guides and labels; it does not own data transforms
//! beyond simple sampling decisions.

use crate::{
    layout::{AxisVisibilityPolicy, ChartLayout},
    plots::model::PaneId,
    render::primitives::DrawCommand,
    render::styles::{ColorToken, StrokeStyle, TextAlign, TextStyle},
    render::ticks::{
        default_axis_formatters, AxisFormatters, DensityXTickProvider, NumericYTickProvider,
        PriceFormatter, ValueLabelFormatter,
    },
    scale::{PriceScale, TimeScale},
    types::{Candle, Point},
};

#[derive(Debug, Clone, Copy)]
struct AxisPercentFormatter {
    decimals: usize,
    baseline: f64,
}

impl ValueLabelFormatter for AxisPercentFormatter {
    fn format_value(&self, value: f64) -> String {
        let base = self.baseline.max(1e-9);
        let pct = ((value / base) - 1.0) * 100.0;
        format!("{pct:.prec$}%", prec = self.decimals)
    }
}

pub fn build_axis_commands(
    layout: &ChartLayout,
    candles: &[Candle],
    visible_start: usize,
    ts: TimeScale,
    pane_scales: &[(PaneId, PriceScale)],
) -> Vec<DrawCommand> {
    let formatters = default_axis_formatters();
    build_axis_commands_with_formatters(
        layout,
        candles,
        visible_start,
        ts,
        pane_scales,
        &formatters,
    )
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
            stroke: Some(StrokeStyle::token(ColorToken::PaneBorder, 1.0)),
        });

        let pane_scale = pane_scales
            .iter()
            .find(|(id, _)| id == &pane.id)
            .map(|(_, ps)| ps);
        if let Some(ps) = pane_scale {
            let percent_formatter = AxisPercentFormatter {
                decimals: 2,
                baseline: ps.baseline.unwrap_or(1.0),
            };
            let price_formatter = PriceFormatter { decimals: 2 };
            let y_formatter: &dyn ValueLabelFormatter =
                if ps.mode == crate::scale::PriceAxisMode::Percent {
                    &percent_formatter
                } else {
                    &price_formatter
                };
            // Horizontal grid + y labels per pane, driven by pluggable provider.
            let y_ticks = y_provider.generate(
                ps.min,
                ps.max,
                pane.rect.y,
                pane.rect.h,
                y_formatter,
                ps.mode,
            );
            for tick in y_ticks {
                let y = tick.y;

                out.push(DrawCommand::Line {
                    from: Point { x: pane.rect.x, y },
                    to: Point {
                        x: pane.rect.right(),
                        y,
                    },
                    stroke: StrokeStyle::token(ColorToken::GridLine, 1.0),
                });

                if pane.y_axis == AxisVisibilityPolicy::Visible {
                    out.push(DrawCommand::Text {
                        pos: Point {
                            x: layout.y_axis.x + layout.y_axis.w - 4.0,
                            y: y + 4.0,
                        },
                        text: tick.label,
                        style: TextStyle::token(ColorToken::AxisText, 11.0, TextAlign::Right),
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
            stroke: StrokeStyle::token(ColorToken::AxisGridStrong, 1.0),
        });

        out.push(DrawCommand::Text {
            pos: Point {
                x,
                y: layout.x_axis.y + 16.0,
            },
            text: tick.label,
            style: TextStyle::token(ColorToken::AxisText, 10.0, TextAlign::Center),
        });
    }

    out
}

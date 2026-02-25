//! Scene composition for the chart.
//!
//! This file is intentionally the only place where chart state is translated
//! into `DrawCommand`s. The Canvas/Web layer should paint commands, not make
//! charting decisions.

use crate::{
    drawings::render::build_drawing_commands,
    layout::{compute_layout, ChartLayout},
    plots::{
        model::{PaneId, PlotPrimitive, PlotSeries},
        render::{build_plot_draw_commands, PlotRenderContext, ValueScaleRange},
    },
    render::{
        axes::build_axis_commands,
        candles::build_candle_commands,
        primitives::DrawCommand,
        volume::build_volume_commands,
    },
    scale::{PriceScale, TimeScale},
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

        let plot_series = self.collect_plot_series();

        let has_indicator_pane = plot_series.iter().any(|s| !matches!(s.pane, PaneId::Price));

        let layout: ChartLayout = compute_layout(self.size, has_indicator_pane);
        let (min_price, max_price, max_vol) = self.compute_visible_bounds(visible);

        // Price and volume share the same pane and horizontal scale.
        let ts_price = TimeScale {
            pane: layout.price_pane,
            count: visible.len(),
        };
        let ps = PriceScale {
            pane: layout.price_pane,
            min: min_price,
            max: max_price,
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
        out.extend(build_volume_commands(visible, ts_price, layout.price_pane, max_vol));
        out.extend(build_candle_commands(visible, ts_price, ps));

        let (visible_start, visible_end) = match self.viewport {
            Some(vp) => vp.visible_range(self.candles.len()),
            None => (0, self.candles.len()),
        };

        let price_range = ValueScaleRange {
            min: min_price,
            max: max_price,
        };

        out.extend(build_plot_draw_commands(
            &plot_series,
            PlotRenderContext {
                visible_start,
                visible_end,
                target_pane: PaneId::Price,
                pane_scale: ps,
                value_range: price_range,
            },
        ));

        if let Some(indicator_pane) = layout.indicator_pane {
            if let Some(target_named_pane) = first_named_pane(&plot_series) {
                if let Some((min_v, max_v)) = compute_pane_value_bounds(
                    &plot_series,
                    &target_named_pane,
                    visible_start,
                    visible_end,
                ) {
                let pane_scale = PriceScale {
                    pane: indicator_pane,
                    min: min_v,
                    max: max_v,
                };

                out.extend(build_plot_draw_commands(
                    &plot_series,
                    PlotRenderContext {
                        visible_start,
                        visible_end,
                        target_pane: target_named_pane,
                        pane_scale,
                        value_range: ValueScaleRange {
                            min: min_v,
                            max: max_v,
                        },
                    },
                ));
                }
            }
        }

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

fn first_named_pane(series: &[PlotSeries]) -> Option<PaneId> {
    for s in series {
        if let PaneId::Named(name) = &s.pane {
            return Some(PaneId::Named(name.clone()));
        }
    }
    None
}

fn compute_pane_value_bounds(
    series: &[PlotSeries],
    pane: &PaneId,
    visible_start: usize,
    visible_end: usize,
) -> Option<(f64, f64)> {
    let mut min_v = f64::INFINITY;
    let mut max_v = f64::NEG_INFINITY;

    for s in series {
        if &s.pane != pane || !s.visible {
            continue;
        }

        for primitive in &s.primitives {
            match primitive {
                PlotPrimitive::Line { values, .. } | PlotPrimitive::Histogram { values, .. } => {
                    for idx in visible_start..visible_end {
                        if let Some(v) = values.get(idx).and_then(|v| *v) {
                            min_v = min_v.min(v);
                            max_v = max_v.max(v);
                        }
                    }
                }
                PlotPrimitive::Band { upper, lower, .. } => {
                    for idx in visible_start..visible_end {
                        if let Some(v) = upper.get(idx).and_then(|v| *v) {
                            min_v = min_v.min(v);
                            max_v = max_v.max(v);
                        }
                        if let Some(v) = lower.get(idx).and_then(|v| *v) {
                            min_v = min_v.min(v);
                            max_v = max_v.max(v);
                        }
                    }
                }
                PlotPrimitive::Markers { points, .. } => {
                    for p in points {
                        if (visible_start..visible_end).contains(&p.index) {
                            min_v = min_v.min(p.value);
                            max_v = max_v.max(p.value);
                        }
                    }
                }
            }
        }
    }

    if !min_v.is_finite() || !max_v.is_finite() {
        None
    } else {
        let pad = ((max_v - min_v) * 0.08).max(1e-6);
        Some((min_v - pad, max_v + pad))
    }
}
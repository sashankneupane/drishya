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
        axes::build_axis_commands, candles::build_candle_commands, primitives::DrawCommand,
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

        let pane_specs = self.pane_descriptors();
        let layout: ChartLayout = compute_layout(self.size, &pane_specs);
        let price_pane = layout.price_pane().unwrap_or(layout.plot);
        let (min_price, max_price, max_vol) = self.compute_visible_bounds(visible);

        // Price and volume share the same pane and horizontal scale.
        let ts_price = TimeScale {
            pane: price_pane,
            count: visible.len(),
        };
        let ps = PriceScale {
            pane: price_pane,
            min: min_price,
            max: max_price,
        };

        let (visible_start, visible_end) = match self.viewport {
            Some(vp) => vp.visible_range(self.candles.len()),
            None => (0, self.candles.len()),
        };

        let mut pane_scales: Vec<(PaneId, PriceScale)> = vec![(PaneId::Price, ps)];
        for pane in &layout.panes {
            if matches!(pane.id, PaneId::Price) {
                continue;
            }

            if let Some((min_v, max_v)) =
                compute_pane_value_bounds(&plot_series, &pane.id, visible_start, visible_end)
            {
                pane_scales.push((
                    pane.id.clone(),
                    PriceScale {
                        pane: pane.rect,
                        min: min_v,
                        max: max_v,
                    },
                ));
            }
        }

        // Background
        out.push(DrawCommand::Rect {
            rect: layout.full,
            fill: Some("#030712".to_string()),
            stroke: None,
            line_width: 1.0,
        });

        // Core chart primitives
        out.extend(build_axis_commands(&layout, visible, ts_price, &pane_scales));
        out.push(DrawCommand::PushClip { rect: price_pane });
        out.extend(build_volume_commands(
            visible,
            ts_price,
            price_pane,
            max_vol,
        ));
        out.extend(build_candle_commands(visible, ts_price, ps));
        out.push(DrawCommand::PopClip);

        let price_range = ValueScaleRange {
            min: min_price,
            max: max_price,
        };

        for (pane_id, pane_scale) in &pane_scales {
            let value_range = if matches!(pane_id, PaneId::Price) {
                price_range
            } else {
                ValueScaleRange {
                    min: pane_scale.min,
                    max: pane_scale.max,
                }
            };

            out.push(DrawCommand::PushClip {
                rect: pane_scale.pane,
            });
            out.extend(build_plot_draw_commands(
                &plot_series,
                PlotRenderContext {
                    visible_start,
                    visible_end,
                    target_pane: pane_id.clone(),
                    pane_scale: *pane_scale,
                    value_range,
                },
            ));
            out.push(DrawCommand::PopClip);
        }

        // User drawings are painted last so they stay visually on top.
        out.push(DrawCommand::PushClip { rect: layout.plot });
        out.extend(build_drawing_commands(
            self.drawings.items(),
            layout,
            ps,
            self.viewport,
        ));
        out.push(DrawCommand::PopClip);

        out
    }
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

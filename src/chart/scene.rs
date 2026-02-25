//! Scene composition for the chart.
//!
//! This file is intentionally the only place where chart state is translated
//! into `DrawCommand`s. The Canvas/Web layer should paint commands, not make
//! charting decisions.

use crate::{
    drawings::render::{build_drawing_commands, build_preview_drawing_commands},
    layout::ChartLayout,
    plots::{
        model::{PaneId, PlotPrimitive, PlotSeries},
        render::{build_plot_draw_commands, PlotRenderContext, ValueScaleRange},
    },
    render::{
        axes::build_axis_commands,
        candles::build_candle_commands,
        primitives::DrawCommand,
        styles::{ColorToken, FillStyle, StrokeStyle},
        volume::build_volume_commands,
    },
    scale::{PriceScale, TimeScale},
    types::{Candle, Point},
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

        let pad = ((max_price - min_price) * 0.05).max(1e-6);
        (min_price - pad, max_price + pad, max_vol)
    }

    pub fn build_draw_commands(&self) -> Vec<DrawCommand> {
        let mut out = Vec::new();
        if self.candles.is_empty() {
            return out;
        }

        let (visible_start, visible_end) = match self.viewport {
            Some(vp) => vp.visible_range(self.candles.len()),
            None => (0, self.candles.len()),
        };
        let visible = &self.candles[visible_start..visible_end];

        let plot_series = self.collect_plot_series();

        let layout: ChartLayout = self.current_layout();
        let price_pane = layout.price_pane().unwrap_or(layout.plot);
        let (min_price, max_price, max_vol) = if visible.is_empty() {
            self.compute_visible_bounds(&self.candles)
        } else {
            self.compute_visible_bounds(visible)
        };
        let (min_price, max_price) = apply_y_zoom(
            min_price,
            max_price,
            self.pane_y_zoom_factor(&PaneId::Price),
            self.pane_y_pan_factor(&PaneId::Price),
        );

        let ts_price = match self.viewport {
            Some(vp) => TimeScale {
                pane: price_pane,
                world_start_x: vp.world_start_x(),
                world_end_x: vp.world_end_x(),
            },
            None => TimeScale {
                pane: price_pane,
                world_start_x: 0.0,
                world_end_x: self.candles.len() as f64,
            },
        };
        let ps = PriceScale {
            pane: price_pane,
            min: min_price,
            max: max_price,
        };

        let mut pane_scales: Vec<(PaneId, PriceScale)> = vec![(PaneId::Price, ps)];
        for pane in &layout.panes {
            if matches!(pane.id, PaneId::Price) {
                continue;
            }

            if let Some((min_v, max_v)) =
                compute_pane_value_bounds(&plot_series, &pane.id, visible_start, visible_end)
            {
                let (min_v, max_v) = apply_y_zoom(
                    min_v,
                    max_v,
                    self.pane_y_zoom_factor(&pane.id),
                    self.pane_y_pan_factor(&pane.id),
                );
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

        out.push(DrawCommand::Rect {
            rect: layout.full,
            fill: Some(FillStyle::token(ColorToken::CanvasBg)),
            stroke: None,
        });

        out.extend(build_axis_commands(
            &layout,
            visible,
            visible_start,
            ts_price,
            &pane_scales,
        ));

        out.push(DrawCommand::PushClip { rect: price_pane });
        out.extend(build_volume_commands(
            visible,
            visible_start,
            ts_price,
            price_pane,
            max_vol,
        ));
        out.extend(build_candle_commands(visible, visible_start, ts_price, ps));
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
                    time_scale: ts_price,
                    value_range,
                },
            ));
            out.push(DrawCommand::PopClip);
        }

        out.extend(build_drawing_commands(
            &self.drawings,
            layout.clone(),
            ps,
            self.viewport,
        ));

        if let Some(preview) = self.active_drawing_preview() {
            out.extend(build_preview_drawing_commands(
                &preview,
                layout.clone(),
                ps,
                self.viewport,
            ));
        }

        if let Some(crosshair) = self.crosshair {
            out.push(DrawCommand::PushClip { rect: layout.plot });
            out.extend(build_dotted_vertical(
                crosshair.x,
                layout.plot.y,
                layout.plot_bottom(),
                1.0,
                ColorToken::Crosshair,
            ));
            out.extend(build_dotted_horizontal(
                crosshair.y,
                layout.plot.x,
                layout.plot.right(),
                1.0,
                ColorToken::Crosshair,
            ));
            out.push(DrawCommand::PopClip);
        }

        out
    }
}

fn build_dotted_vertical(
    x: f32,
    y_start: f32,
    y_end: f32,
    width: f32,
    color: ColorToken,
) -> Vec<DrawCommand> {
    build_dotted_line(Point { x, y: y_start }, Point { x, y: y_end }, width, color)
}

fn build_dotted_horizontal(
    y: f32,
    x_start: f32,
    x_end: f32,
    width: f32,
    color: ColorToken,
) -> Vec<DrawCommand> {
    build_dotted_line(Point { x: x_start, y }, Point { x: x_end, y }, width, color)
}

fn build_dotted_line(from: Point, to: Point, width: f32, color: ColorToken) -> Vec<DrawCommand> {
    let dx = to.x - from.x;
    let dy = to.y - from.y;
    let len = (dx * dx + dy * dy).sqrt();
    if len <= 0.0 {
        return Vec::new();
    }

    let dash = 4.0f32;
    let gap = 3.0f32;
    let step = dash + gap;
    let ux = dx / len;
    let uy = dy / len;

    let mut out = Vec::new();
    let mut t = 0.0f32;
    while t < len {
        let s = t;
        let e = (t + dash).min(len);

        let p0 = Point {
            x: from.x + ux * s,
            y: from.y + uy * s,
        };
        let p1 = Point {
            x: from.x + ux * e,
            y: from.y + uy * e,
        };

        out.push(DrawCommand::Line {
            from: p0,
            to: p1,
            stroke: StrokeStyle::token(color, width),
        });

        t += step;
    }

    out
}

fn apply_y_zoom(min: f64, max: f64, zoom_factor: f32, pan_factor: f32) -> (f64, f64) {
    let center = (min + max) * 0.5;
    let half = ((max - min) * 0.5).max(1e-9);
    let zoomed_half = half / zoom_factor.max(1e-6) as f64;
    let pan_delta = zoomed_half * pan_factor as f64;
    (
        center - zoomed_half - pan_delta,
        center + zoomed_half - pan_delta,
    )
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

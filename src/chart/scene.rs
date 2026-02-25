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
        styles::{ColorToken, FillStyle, StrokeStyle, TextAlign, TextStyle},
        ticks::{HumanTimeFormatter, TimeLabelFormatter},
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
        out.extend(build_candle_commands(
            visible,
            visible_start,
            ts_price,
            ps,
            self.candle_body_style(),
        ));
        out.push(DrawCommand::PopClip);

        if let Some(last) = self.candles.last() {
            let live_y = ps.y_for_price(last.close);
            if live_y >= price_pane.y && live_y <= price_pane.bottom() {
                let prev_close = self
                    .candles
                    .iter()
                    .rev()
                    .nth(1)
                    .map(|c| c.close)
                    .unwrap_or(last.open);
                let live_color = if last.close >= prev_close {
                    ColorToken::Bull
                } else {
                    ColorToken::Bear
                };
                out.push(DrawCommand::PushClip { rect: price_pane });
                out.extend(build_dotted_horizontal(
                    live_y,
                    price_pane.x,
                    price_pane.right(),
                    1.0,
                    live_color,
                ));
                out.push(DrawCommand::PopClip);
                out.push(DrawCommand::Rect {
                    rect: crate::types::Rect {
                        x: layout.y_axis.x + 1.0,
                        y: (live_y - 8.0).clamp(layout.y_axis.y, layout.y_axis.bottom() - 16.0),
                        w: layout.y_axis.w - 2.0,
                        h: 16.0,
                    },
                    fill: Some(FillStyle::token(ColorToken::PaneBorder)),
                    stroke: None,
                });
                out.push(DrawCommand::Text {
                    pos: Point {
                        x: layout.y_axis.right() - 4.0,
                        y: (live_y + 4.0)
                            .clamp(layout.y_axis.y + 12.0, layout.y_axis.bottom() - 2.0),
                    },
                    text: format!("{:.2}", last.close),
                    style: TextStyle::token(live_color, 11.0, TextAlign::Right),
                });
            }
        }

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
            &self.candles,
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

            if let Some(idx) = nearest_candle_index(crosshair.x, ts_price, self.candles.len()) {
                if let Some(readout) =
                    build_crosshair_readout_commands(&self.candles, idx, crosshair, &layout, ps)
                {
                    out.extend(readout);
                }

                out.extend(build_non_price_pane_readout_commands(
                    &plot_series,
                    &layout,
                    idx,
                ));
            }
        }

        out
    }
}

fn build_crosshair_readout_commands(
    candles: &[Candle],
    index: usize,
    crosshair: Point,
    layout: &ChartLayout,
    ps: PriceScale,
) -> Option<Vec<DrawCommand>> {
    if candles.is_empty() {
        return None;
    }

    if crosshair.x < layout.plot.x
        || crosshair.x > layout.plot.right()
        || crosshair.y < layout.plot.y
        || crosshair.y > layout.plot_bottom()
    {
        return None;
    }

    let candle = candles.get(index)?;

    let mut out = Vec::new();

    let ohlcv = format!(
        "O {:.2}  H {:.2}  L {:.2}  C {:.2}  V {:.0}",
        candle.open, candle.high, candle.low, candle.close, candle.volume
    );
    out.push(DrawCommand::Text {
        pos: Point {
            x: layout.plot.x + 8.0,
            y: layout.plot.y + 14.0,
        },
        text: ohlcv,
        style: TextStyle::token(ColorToken::AxisText, 11.0, TextAlign::Left),
    });

    let price_at_cursor = price_at_y(crosshair.y, ps);
    let price_label_h = 16.0f32;
    let price_label_y = (crosshair.y - price_label_h * 0.5)
        .clamp(layout.y_axis.y, layout.y_axis.bottom() - price_label_h);
    out.push(DrawCommand::Rect {
        rect: crate::types::Rect {
            x: layout.y_axis.x + 1.0,
            y: price_label_y,
            w: layout.y_axis.w - 2.0,
            h: price_label_h,
        },
        fill: Some(FillStyle::token(ColorToken::PaneBorder)),
        stroke: None,
    });
    out.push(DrawCommand::Text {
        pos: Point {
            x: layout.y_axis.right() - 4.0,
            y: price_label_y + 12.0,
        },
        text: format!("{:.2}", price_at_cursor),
        style: TextStyle::token(ColorToken::AxisText, 11.0, TextAlign::Right),
    });

    let time_formatter = HumanTimeFormatter;
    let ts_text = time_formatter.format_time(candle.ts);
    let x_label_w = 84.0f32;
    let x_label_h = 16.0f32;
    let x_label_x =
        (crosshair.x - x_label_w * 0.5).clamp(layout.x_axis.x, layout.x_axis.right() - x_label_w);
    out.push(DrawCommand::Rect {
        rect: crate::types::Rect {
            x: x_label_x,
            y: layout.x_axis.y + 2.0,
            w: x_label_w,
            h: x_label_h,
        },
        fill: Some(FillStyle::token(ColorToken::PaneBorder)),
        stroke: None,
    });
    out.push(DrawCommand::Text {
        pos: Point {
            x: x_label_x + x_label_w * 0.5,
            y: layout.x_axis.y + 13.0,
        },
        text: ts_text,
        style: TextStyle::token(ColorToken::AxisText, 10.0, TextAlign::Center),
    });

    Some(out)
}

fn build_non_price_pane_readout_commands(
    series: &[PlotSeries],
    layout: &ChartLayout,
    index: usize,
) -> Vec<DrawCommand> {
    let mut out = Vec::new();

    for pane in &layout.panes {
        if matches!(pane.id, PaneId::Price) {
            continue;
        }

        let mut lines: Vec<String> = Vec::new();
        for s in series {
            if !s.visible || s.pane != pane.id {
                continue;
            }

            if let Some(value) = series_value_at_index(s, index) {
                lines.push(format!("{}: {:.2}", s.name, value));
            }
        }

        if lines.is_empty() {
            continue;
        }

        out.push(DrawCommand::PushClip { rect: pane.rect });
        for (i, text) in lines.into_iter().enumerate() {
            out.push(DrawCommand::Text {
                pos: Point {
                    x: pane.rect.x + 6.0,
                    y: pane.rect.y + 14.0 + i as f32 * 12.0,
                },
                text,
                style: TextStyle::token(ColorToken::AxisText, 10.0, TextAlign::Left),
            });
        }
        out.push(DrawCommand::PopClip);
    }

    out
}

fn series_value_at_index(series: &PlotSeries, index: usize) -> Option<f64> {
    // Prefer later primitives so readouts pick the main signal line
    // (e.g. RSI value) over static guide lines (e.g. 70/30).
    for primitive in series.primitives.iter().rev() {
        match primitive {
            PlotPrimitive::Line { values, .. } | PlotPrimitive::Histogram { values, .. } => {
                if let Some(v) = values.get(index).and_then(|v| *v) {
                    return Some(v);
                }
            }
            PlotPrimitive::Band { upper, lower, .. } => {
                let u = upper.get(index).and_then(|v| *v);
                let l = lower.get(index).and_then(|v| *v);
                if let (Some(u), Some(l)) = (u, l) {
                    return Some((u + l) * 0.5);
                }
                if let Some(v) = u.or(l) {
                    return Some(v);
                }
            }
            PlotPrimitive::Markers { points, .. } => {
                if let Some(point) = points.iter().find(|p| p.index == index) {
                    return Some(point.value);
                }
            }
        }
    }
    None
}

fn nearest_candle_index(x: f32, ts: TimeScale, total_len: usize) -> Option<usize> {
    if total_len == 0 {
        return None;
    }

    let span = ts.world_span();
    if span <= 0.0 || ts.pane.w <= 0.0 {
        return Some(0);
    }

    let u = ((x - ts.pane.x) as f64 / ts.pane.w as f64).clamp(0.0, 1.0);
    let world_x = ts.world_start_x + u * span;
    let idx = world_x.floor() as isize;
    let clamped = idx.clamp(0, total_len as isize - 1);
    Some(clamped as usize)
}

fn price_at_y(y: f32, ps: PriceScale) -> f64 {
    let t = 1.0 - ((y - ps.pane.y) / ps.pane.h).clamp(0.0, 1.0);
    ps.min + (ps.max - ps.min) * t as f64
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

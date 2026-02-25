//! Generic plot renderer.

use crate::{
    plots::model::{PaneId, PlotPrimitive, PlotSeries},
    render::primitives::DrawCommand,
    render::styles::{FillStyle, StrokeStyle},
    scale::{PriceScale, TimeScale},
    types::Point,
};

#[derive(Debug, Clone, Copy)]
pub struct ValueScaleRange {
    pub min: f64,
    pub max: f64,
}

pub struct PlotRenderContext {
    pub visible_start: usize,
    pub visible_end: usize,
    pub target_pane: PaneId,
    pub pane_scale: PriceScale,
    pub time_scale: TimeScale,
    pub value_range: ValueScaleRange,
}

pub fn build_plot_draw_commands(series: &[PlotSeries], ctx: PlotRenderContext) -> Vec<DrawCommand> {
    if ctx.visible_end <= ctx.visible_start {
        return Vec::new();
    }

    let mut out = Vec::new();

    for s in series {
        if !s.visible {
            continue;
        }

        if s.pane != ctx.target_pane {
            continue;
        }

        for primitive in &s.primitives {
            match primitive {
                PlotPrimitive::Line { values, style } => {
                    out.extend(render_line(values, style.width, &style.color, &ctx));
                }
                PlotPrimitive::Band {
                    upper,
                    lower,
                    style,
                } => {
                    out.extend(render_band(upper, lower, &style.fill_color, &ctx));
                }
                PlotPrimitive::Histogram {
                    values,
                    base,
                    style,
                } => {
                    out.extend(render_histogram(values, *base, style, &ctx));
                }
                PlotPrimitive::Markers { points, style } => {
                    out.extend(render_markers(points, style, &ctx));
                }
            }
        }
    }

    out
}

fn render_line(
    values: &[Option<f64>],
    width: f32,
    color: &str,
    ctx: &PlotRenderContext,
) -> Vec<DrawCommand> {
    let mut out = Vec::new();
    let pane = ctx.pane_scale.pane;
    let mut prev: Option<Point> = None;

    for global_idx in ctx.visible_start..ctx.visible_end {
        let value = values.get(global_idx).and_then(|v| *v);
        let x = ctx.time_scale.x_for_global_index(global_idx);

        match value {
            Some(y_val) => {
                let y = map_value_to_pane_y(y_val, ctx).clamp(pane.y, pane.bottom());
                let current = Point { x, y };
                if let Some(prev_point) = prev {
                    out.push(DrawCommand::Line {
                        from: prev_point,
                        to: current,
                        stroke: StrokeStyle::css(color.to_string(), width),
                    });
                }
                prev = Some(current);
            }
            None => prev = None,
        }
    }

    out
}

fn render_band(
    upper: &[Option<f64>],
    lower: &[Option<f64>],
    fill_color: &str,
    ctx: &PlotRenderContext,
) -> Vec<DrawCommand> {
    let mut out = Vec::new();
    let mut run_start: Option<usize> = None;

    for global_idx in ctx.visible_start..ctx.visible_end {
        let has_pair = upper.get(global_idx).and_then(|v| *v).is_some()
            && lower.get(global_idx).and_then(|v| *v).is_some();

        if has_pair {
            if run_start.is_none() {
                run_start = Some(global_idx);
            }
        } else if let Some(start) = run_start {
            append_band_run(&mut out, upper, lower, fill_color, ctx, start..global_idx);
            run_start = None;
        }
    }

    if let Some(start) = run_start {
        append_band_run(
            &mut out,
            upper,
            lower,
            fill_color,
            ctx,
            start..ctx.visible_end,
        );
    }

    out
}

fn append_band_run(
    out: &mut Vec<DrawCommand>,
    upper: &[Option<f64>],
    lower: &[Option<f64>],
    fill_color: &str,
    ctx: &PlotRenderContext,
    run: std::ops::Range<usize>,
) {
    if run.end <= run.start + 1 {
        return;
    }

    let pane = ctx.pane_scale.pane;
    let mut top_points = Vec::new();
    let mut bottom_points = Vec::new();

    for (global_idx, maybe_upper) in upper.iter().enumerate().take(run.end).skip(run.start) {
        let x = ctx.time_scale.x_for_global_index(global_idx);
        if let Some(v) = *maybe_upper {
            top_points.push(Point {
                x,
                y: map_value_to_pane_y(v, ctx).clamp(pane.y, pane.bottom()),
            });
        }
    }

    for (global_idx, maybe_lower) in lower.iter().enumerate().take(run.end).skip(run.start).rev() {
        let x = ctx.time_scale.x_for_global_index(global_idx);
        if let Some(v) = *maybe_lower {
            bottom_points.push(Point {
                x,
                y: map_value_to_pane_y(v, ctx).clamp(pane.y, pane.bottom()),
            });
        }
    }

    if top_points.len() < 2 || bottom_points.len() < 2 {
        return;
    }

    let mut polygon = top_points;
    polygon.extend(bottom_points);

    out.push(DrawCommand::Polygon {
        points: polygon,
        fill: Some(FillStyle::css(fill_color.to_string())),
        stroke: None,
    });
}

fn render_histogram(
    values: &[Option<f64>],
    base: f64,
    style: &crate::plots::model::HistogramStyle,
    ctx: &PlotRenderContext,
) -> Vec<DrawCommand> {
    let mut out = Vec::new();
    let pane = ctx.pane_scale.pane;
    let base_y = map_value_to_pane_y(base, ctx).clamp(pane.y, pane.bottom());
    let bar_w = (ctx.time_scale.step() * style.width_factor.clamp(0.05, 1.0)).max(1.0);

    for global_idx in ctx.visible_start..ctx.visible_end {
        let x = ctx.time_scale.x_for_global_index(global_idx);
        if let Some(v) = values.get(global_idx).and_then(|v| *v) {
            let y = map_value_to_pane_y(v, ctx).clamp(pane.y, pane.bottom());
            let top = y.min(base_y);
            let h = (y - base_y).abs().max(1.0);
            let color = if v >= base {
                style.positive_color.clone()
            } else {
                style.negative_color.clone()
            };

            out.push(DrawCommand::Rect {
                rect: crate::types::Rect {
                    x: x - bar_w * 0.5,
                    y: top,
                    w: bar_w,
                    h,
                },
                fill: Some(FillStyle::css(color)),
                stroke: None,
            });
        }
    }

    out
}

fn render_markers(
    points: &[crate::plots::model::MarkerPoint],
    style: &crate::plots::model::MarkerStyle,
    ctx: &PlotRenderContext,
) -> Vec<DrawCommand> {
    let mut out = Vec::new();
    let pane = ctx.pane_scale.pane;
    let size = style.size.max(2.0);

    for point in points {
        if point.index < ctx.visible_start || point.index >= ctx.visible_end {
            continue;
        }

        let x = ctx.time_scale.x_for_global_index(point.index);
        let y = map_value_to_pane_y(point.value, ctx).clamp(pane.y, pane.bottom());

        out.push(DrawCommand::Line {
            from: Point { x: x - size, y },
            to: Point { x: x + size, y },
            stroke: StrokeStyle::css(style.color.clone(), 1.0),
        });
        out.push(DrawCommand::Line {
            from: Point { x, y: y - size },
            to: Point { x, y: y + size },
            stroke: StrokeStyle::css(style.color.clone(), 1.0),
        });
    }

    out
}

fn map_value_to_pane_y(value: f64, ctx: &PlotRenderContext) -> f32 {
    let pane = ctx.pane_scale.pane;
    let range = (ctx.value_range.max - ctx.value_range.min).max(1e-9);
    let t = ((value - ctx.value_range.min) / range) as f32;
    pane.y + pane.h * (1.0 - t)
}

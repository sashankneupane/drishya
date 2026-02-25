//! Generic plot renderer.

use crate::{
    plots::model::{PaneId, PlotPrimitive, PlotSeries},
    render::primitives::DrawCommand,
    scale::PriceScale,
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
    pub value_range: ValueScaleRange,
}

pub fn build_plot_draw_commands(series: &[PlotSeries], ctx: PlotRenderContext) -> Vec<DrawCommand> {
    if ctx.visible_end <= ctx.visible_start {
        return Vec::new();
    }

    let mut out = Vec::new();
    let pane = ctx.pane_scale.pane;
    let count = ctx.visible_end - ctx.visible_start;
    let step = pane.w / count as f32;

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
                    out.extend(render_line(values, style.width, &style.color, &ctx, step));
                }
                PlotPrimitive::Band {
                    upper,
                    lower,
                    style,
                } => {
                    out.extend(render_band(upper, lower, &style.fill_color, &ctx, step));
                }
                PlotPrimitive::Histogram {
                    values,
                    base,
                    style,
                } => {
                    out.extend(render_histogram(values, *base, style, &ctx, step));
                }
                PlotPrimitive::Markers { points, style } => {
                    out.extend(render_markers(points, style, &ctx, step));
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
    step: f32,
) -> Vec<DrawCommand> {
    let mut out = Vec::new();
    let pane = ctx.pane_scale.pane;
    let mut prev: Option<Point> = None;

    for global_idx in ctx.visible_start..ctx.visible_end {
        let value = values.get(global_idx).and_then(|v| *v);
        let local_idx = global_idx - ctx.visible_start;
        let x = pane.x + (local_idx as f32 + 0.5) * step;

        match value {
            Some(y_val) => {
                let y = map_value_to_pane_y(y_val, ctx).clamp(pane.y, pane.bottom());
                let current = Point { x, y };
                if let Some(prev_point) = prev {
                    out.push(DrawCommand::Line {
                        from: prev_point,
                        to: current,
                        width,
                        color: color.to_string(),
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
    step: f32,
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
            append_band_run(
                &mut out, upper, lower, fill_color, ctx, step, start, global_idx,
            );
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
            step,
            start,
            ctx.visible_end,
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
    step: f32,
    start: usize,
    end: usize,
) {
    if end <= start + 1 {
        return;
    }

    let pane = ctx.pane_scale.pane;
    let mut top_points = Vec::new();
    let mut bottom_points = Vec::new();

    for global_idx in start..end {
        let local_idx = global_idx - ctx.visible_start;
        let x = pane.x + (local_idx as f32 + 0.5) * step;
        if let Some(v) = upper[global_idx] {
            top_points.push(Point {
                x,
                y: map_value_to_pane_y(v, ctx).clamp(pane.y, pane.bottom()),
            });
        }
    }

    for global_idx in (start..end).rev() {
        let local_idx = global_idx - ctx.visible_start;
        let x = pane.x + (local_idx as f32 + 0.5) * step;
        if let Some(v) = lower[global_idx] {
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
        fill: Some(fill_color.to_string()),
        stroke: None,
        line_width: 1.0,
    });
}

fn render_histogram(
    values: &[Option<f64>],
    base: f64,
    style: &crate::plots::model::HistogramStyle,
    ctx: &PlotRenderContext,
    step: f32,
) -> Vec<DrawCommand> {
    let mut out = Vec::new();
    let pane = ctx.pane_scale.pane;
    let base_y = map_value_to_pane_y(base, ctx).clamp(pane.y, pane.bottom());
    let bar_w = (step * style.width_factor.clamp(0.05, 1.0)).max(1.0);

    for global_idx in ctx.visible_start..ctx.visible_end {
        let local_idx = global_idx - ctx.visible_start;
        let x = pane.x + (local_idx as f32 + 0.5) * step;
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
                fill: Some(color),
                stroke: None,
                line_width: 1.0,
            });
        }
    }

    out
}

fn render_markers(
    points: &[crate::plots::model::MarkerPoint],
    style: &crate::plots::model::MarkerStyle,
    ctx: &PlotRenderContext,
    step: f32,
) -> Vec<DrawCommand> {
    let mut out = Vec::new();
    let pane = ctx.pane_scale.pane;
    let size = style.size.max(2.0);

    for point in points {
        if point.index < ctx.visible_start || point.index >= ctx.visible_end {
            continue;
        }

        let local_idx = point.index - ctx.visible_start;
        let x = pane.x + (local_idx as f32 + 0.5) * step;
        let y = map_value_to_pane_y(point.value, ctx).clamp(pane.y, pane.bottom());

        out.push(DrawCommand::Line {
            from: Point { x: x - size, y },
            to: Point { x: x + size, y },
            width: 1.0,
            color: style.color.clone(),
        });
        out.push(DrawCommand::Line {
            from: Point { x, y: y - size },
            to: Point { x, y: y + size },
            width: 1.0,
            color: style.color.clone(),
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

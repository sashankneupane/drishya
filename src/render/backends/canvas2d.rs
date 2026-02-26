//! Canvas2D backend for `DrawCommand` scenes.
//!
//! This module is intentionally stateless: callers provide a context, canvas,
//! and a ready-to-paint command slice.

use js_sys::Array;
use wasm_bindgen::JsValue;
use web_sys::{CanvasRenderingContext2d, HtmlCanvasElement};

use crate::render::{
    primitives::DrawCommand,
    styles::{resolve_color, TextAlign, ThemeId},
};

fn set_line_dash(ctx: &CanvasRenderingContext2d, dash: Option<&[f64]>) -> Result<(), JsValue> {
    let arr = match dash {
        Some(d) => {
            let a = Array::new_with_length(d.len() as u32);
            for (i, &v) in d.iter().enumerate() {
                a.set(i as u32, JsValue::from_f64(v));
            }
            a.into()
        }
        None => Array::new().into(),
    };
    ctx.set_line_dash(&arr)
}

fn apply_stroke_style(ctx: &CanvasRenderingContext2d, stroke: &crate::render::styles::StrokeStyle, theme: crate::render::styles::ThemeId) -> Result<(), JsValue> {
    ctx.set_stroke_style_str(&crate::render::styles::resolve_color(theme, &stroke.color));
    ctx.set_line_width(stroke.width as f64);
    set_line_dash(ctx, stroke.dash.as_deref())?;
    Ok(())
}

pub fn paint_canvas2d(
    ctx: &CanvasRenderingContext2d,
    canvas: &HtmlCanvasElement,
    cmds: &[DrawCommand],
    theme: ThemeId,
) -> Result<(), JsValue> {
    // Clear first to avoid stale pixels between frames.
    ctx.clear_rect(0.0, 0.0, canvas.width() as f64, canvas.height() as f64);

    for cmd in cmds {
        match cmd {
            DrawCommand::PushClip { rect } => {
                ctx.save();
                ctx.begin_path();
                ctx.rect(rect.x as f64, rect.y as f64, rect.w as f64, rect.h as f64);
                ctx.clip();
            }

            DrawCommand::PopClip => {
                ctx.restore();
            }

            DrawCommand::Line { from, to, stroke } => {
                ctx.begin_path();
                apply_stroke_style(ctx, stroke, theme)?;
                ctx.move_to(from.x as f64, from.y as f64);
                ctx.line_to(to.x as f64, to.y as f64);
                ctx.stroke();
                set_line_dash(ctx, None)?;
            }

            DrawCommand::Rect { rect, fill, stroke } => {
                if let Some(fill_style) = fill {
                    ctx.set_fill_style_str(&resolve_color(theme, &fill_style.color));
                    ctx.fill_rect(rect.x as f64, rect.y as f64, rect.w as f64, rect.h as f64);
                }

                if let Some(stroke_style) = stroke {
                    apply_stroke_style(ctx, stroke_style, theme)?;
                    ctx.stroke_rect(rect.x as f64, rect.y as f64, rect.w as f64, rect.h as f64);
                    set_line_dash(ctx, None)?;
                }
            }

            DrawCommand::Polygon {
                points,
                fill,
                stroke,
            } => {
                if points.len() < 2 {
                    continue;
                }

                ctx.begin_path();
                let first = points[0];
                ctx.move_to(first.x as f64, first.y as f64);
                for p in &points[1..] {
                    ctx.line_to(p.x as f64, p.y as f64);
                }
                ctx.close_path();

                if let Some(fill_style) = fill {
                    ctx.set_fill_style_str(&resolve_color(theme, &fill_style.color));
                    ctx.fill();
                }

                if let Some(stroke_style) = stroke {
                    apply_stroke_style(ctx, stroke_style, theme)?;
                    ctx.stroke();
                    set_line_dash(ctx, None)?;
                }
            }

            DrawCommand::Ellipse {
                cx,
                cy,
                rx,
                ry,
                rotation,
                fill,
                stroke,
            } => {
                ctx.begin_path();
                let _ = ctx.ellipse(
                    *cx as f64,
                    *cy as f64,
                    *rx as f64,
                    *ry as f64,
                    *rotation as f64,
                    0.0,
                    2.0 * std::f64::consts::PI,
                );

                if let Some(fill_style) = fill {
                    ctx.set_fill_style_str(&resolve_color(theme, &fill_style.color));
                    ctx.fill();
                }

                if let Some(stroke_style) = stroke {
                    apply_stroke_style(ctx, stroke_style, theme)?;
                    ctx.stroke();
                    set_line_dash(ctx, None)?;
                }
            }

            DrawCommand::Text { pos, text, style } => {
                // Keep font policy here so command producers stay backend-agnostic.
                ctx.set_fill_style_str(&resolve_color(theme, &style.color));
                ctx.set_font(&format!(
                    "{}px ui-monospace, SFMono-Regular, Menlo, monospace",
                    style.size as i32
                ));

                match style.align {
                    TextAlign::Right => ctx.set_text_align("right"),
                    TextAlign::Center => ctx.set_text_align("center"),
                    TextAlign::Left => ctx.set_text_align("left"),
                }

                let _ = ctx.fill_text(text, pos.x as f64, pos.y as f64);
            }
        }
    }

    Ok(())
}

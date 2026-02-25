//! Canvas2D backend for `DrawCommand` scenes.
//!
//! This module is intentionally stateless: callers provide a context, canvas,
//! and a ready-to-paint command slice.

use wasm_bindgen::JsValue;
use web_sys::{CanvasRenderingContext2d, HtmlCanvasElement};

use crate::render::primitives::DrawCommand;

pub fn paint_canvas2d(
    ctx: &CanvasRenderingContext2d,
    canvas: &HtmlCanvasElement,
    cmds: &[DrawCommand],
) -> Result<(), JsValue> {
    // Clear first to avoid stale pixels between frames.
    ctx.clear_rect(0.0, 0.0, canvas.width() as f64, canvas.height() as f64);

    for cmd in cmds {
        match cmd {
            DrawCommand::Line {
                from,
                to,
                width,
                color,
            } => {
                ctx.begin_path();
                ctx.set_stroke_style_str(color);
                ctx.set_line_width(*width as f64);
                ctx.move_to(from.x as f64, from.y as f64);
                ctx.line_to(to.x as f64, to.y as f64);
                ctx.stroke();
            }

            DrawCommand::Rect {
                rect,
                fill,
                stroke,
                line_width,
            } => {
                if let Some(fill_color) = fill {
                    ctx.set_fill_style_str(fill_color);
                    ctx.fill_rect(rect.x as f64, rect.y as f64, rect.w as f64, rect.h as f64);
                }

                if let Some(stroke_color) = stroke {
                    ctx.set_stroke_style_str(stroke_color);
                    ctx.set_line_width(*line_width as f64);
                    ctx.stroke_rect(rect.x as f64, rect.y as f64, rect.w as f64, rect.h as f64);
                }
            }

            DrawCommand::Polygon {
                points,
                fill,
                stroke,
                line_width,
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

                if let Some(fill_color) = fill {
                    ctx.set_fill_style_str(fill_color);
                    ctx.fill();
                }

                if let Some(stroke_color) = stroke {
                    ctx.set_stroke_style_str(stroke_color);
                    ctx.set_line_width(*line_width as f64);
                    ctx.stroke();
                }
            }

            DrawCommand::Text {
                pos,
                text,
                size,
                color,
                align,
            } => {
                // Keep font policy here so command producers stay backend-agnostic.
                ctx.set_fill_style_str(color);
                ctx.set_font(&format!(
                    "{}px ui-monospace, SFMono-Regular, Menlo, monospace",
                    *size as i32
                ));

                match align.as_str() {
                    "right" => ctx.set_text_align("right"),
                    "center" => ctx.set_text_align("center"),
                    _ => ctx.set_text_align("left"),
                }

                let _ = ctx.fill_text(text, pos.x as f64, pos.y as f64);
            }
        }
    }

    Ok(())
}
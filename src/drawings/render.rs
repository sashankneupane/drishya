//! Drawing overlay scene builder.
//!
//! Drawings are converted into generic `DrawCommand`s so they can be rendered
//! by any backend, just like candles and axes.

use crate::{
    drawings::types::Drawing, layout::ChartLayout, render::primitives::DrawCommand,
    scale::PriceScale, types::Point, viewport::Viewport,
};

pub fn build_drawing_commands(
    drawings: &[Drawing],
    layout: ChartLayout,
    ps: PriceScale,
    viewport: Option<Viewport>,
) -> Vec<DrawCommand> {
    let mut out = Vec::new();
    let Some(price_pane) = layout.price_pane() else {
        return out;
    };

    for d in drawings {
        match d {
            Drawing::HorizontalLine(h) => {
                let y = ps.y_for_price(h.price);
                if y >= price_pane.y && y <= price_pane.bottom() {
                    out.push(DrawCommand::Line {
                        from: Point {
                            x: price_pane.x,
                            y,
                        },
                        to: Point {
                            x: price_pane.right(),
                            y,
                        },
                        width: 1.0,
                        color: "#f59e0b".to_string(),
                    });

                    out.push(DrawCommand::Text {
                        pos: Point {
                            x: layout.y_axis.x + layout.y_axis.w - 4.0,
                            y: y + 4.0,
                        },
                        text: format!("{:.2}", h.price),
                        size: 11.0,
                        color: "#fbbf24".to_string(),
                        align: "right".to_string(),
                    });
                }
            }
            Drawing::VerticalLine(v) => {
                if let Some(vp) = viewport {
                    // Convert stored world index into current viewport fraction.
                    let u = (v.index - vp.offset) / vp.bars_visible;
                    if (0.0..=1.0).contains(&u) {
                        let x = price_pane.x + price_pane.w * u;
                        let bottom_y = layout.plot_bottom();

                        out.push(DrawCommand::Line {
                            from: Point {
                                x,
                                y: price_pane.y,
                            },
                            to: Point { x, y: bottom_y },
                            width: 1.0,
                            color: "#38bdf8".to_string(),
                        });

                        out.push(DrawCommand::Text {
                            pos: Point {
                                x,
                                y: layout.x_axis.y + 16.0,
                            },
                            text: "|".to_string(),
                            size: 12.0,
                            color: "#7dd3fc".to_string(),
                            align: "center".to_string(),
                        });
                    }
                }
            }
        }
    }

    out
}

//! Drawing overlay scene builder.
//!
//! Drawings are converted into generic `DrawCommand`s so they can be rendered
//! by any backend, just like candles and axes.

use crate::{
    drawings::types::Drawing, layout::ChartLayout, render::primitives::DrawCommand,
    render::styles::{ColorToken, StrokeStyle, TextAlign, TextStyle}, scale::PriceScale,
    types::Point, viewport::Viewport,
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
                    out.push(DrawCommand::PushClip { rect: price_pane });
                    out.push(DrawCommand::Line {
                        from: Point { x: price_pane.x, y },
                        to: Point {
                            x: price_pane.right(),
                            y,
                        },
                        stroke: StrokeStyle::token(ColorToken::DrawingPrimary, 1.0),
                    });

                    out.push(DrawCommand::Text {
                        pos: Point {
                            x: layout.y_axis.x + layout.y_axis.w - 4.0,
                            y: y + 4.0,
                        },
                        text: format!("{:.2}", h.price),
                        style: TextStyle::token(
                            ColorToken::DrawingPrimaryText,
                            11.0,
                            TextAlign::Right,
                        ),
                    });
                    out.push(DrawCommand::PopClip);
                }
            }
            Drawing::VerticalLine(v) => {
                if let Some(vp) = viewport {
                    let x = vp.world_x_to_pixel_x(v.index, price_pane.x, price_pane.w);
                    if x >= price_pane.x && x <= price_pane.right() {
                        let bottom_y = layout.plot_bottom();

                        out.push(DrawCommand::PushClip { rect: layout.plot });
                        out.push(DrawCommand::Line {
                            from: Point { x, y: price_pane.y },
                            to: Point { x, y: bottom_y },
                            stroke: StrokeStyle::token(ColorToken::DrawingSecondary, 1.0),
                        });

                        out.push(DrawCommand::Text {
                            pos: Point {
                                x,
                                y: layout.x_axis.y + 16.0,
                            },
                            text: "|".to_string(),
                            style: TextStyle::token(
                                ColorToken::DrawingSecondaryText,
                                12.0,
                                TextAlign::Center,
                            ),
                        });
                        out.push(DrawCommand::PopClip);
                    }
                }
            }
        }
    }

    out
}

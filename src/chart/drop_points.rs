use crate::{
    drawings::types::Drawing,
    render::{
        primitives::DrawCommand,
        styles::{ColorToken, FillStyle, StrokeStyle},
    },
    scale::PriceScale,
    types::Rect,
};

use crate::chart::Chart;

/// Radius of control-point marker dots in pixels.
const MARKER_R: f32 = 4.5;

fn dot_cmd(cx: f32, cy: f32, filled: bool) -> DrawCommand {
    DrawCommand::Ellipse {
        rect: Rect {
            x: cx - MARKER_R,
            y: cy - MARKER_R,
            w: MARKER_R * 2.0,
            h: MARKER_R * 2.0,
        },
        fill: if filled {
            Some(FillStyle::token(ColorToken::DrawingPrimary))
        } else {
            None
        },
        stroke: Some(StrokeStyle::token(ColorToken::DrawingPrimary, 1.5)),
    }
}

impl Chart {
    /// Returns `DrawCommand`s that render:
    /// 1. Drop-point dots at each `pending_points` pixel position during multi-click drawing.
    /// 2. Vertex / control-point dots for the currently selected Triangle / Circle / Ellipse.
    pub(crate) fn build_drop_point_commands(&self) -> Vec<DrawCommand> {
        let layout = self.current_layout();
        let price_pane = layout.price_pane().unwrap_or(layout.plot);
        let Some(vp) = self.viewport else {
            return vec![];
        };
        let visible = self.visible_data();
        if visible.is_empty() {
            return vec![];
        }
        let (min_price, max_price, _) = self.compute_visible_bounds(visible);
        let (min_price, max_price) = apply_price_pane_y_zoom(
            min_price,
            max_price,
            self.pane_y_zoom_factor(&crate::plots::model::PaneId::Price),
            self.pane_y_pan_factor(&crate::plots::model::PaneId::Price),
        );
        let ps = PriceScale {
            pane: price_pane,
            min: min_price,
            max: max_price,
        };

        let mut out: Vec<DrawCommand> = Vec::new();
        out.push(DrawCommand::PushClip { rect: price_pane });

        // --- 1. Pending construction dots ---
        for p in &self.drawing_interaction.pending_points {
            out.push(dot_cmd(p.x, p.y, true));
        }

        // --- 2. Selected shape vertex dots ---
        if let Some(id) = self.selected_drawing_id() {
            if let Some(drawing) = self.drawings.drawing(id) {
                match drawing {
                    Drawing::Triangle(t) => {
                        let x1 = vp.world_x_to_pixel_x(t.p1_index, price_pane.x, price_pane.w);
                        let x2 = vp.world_x_to_pixel_x(t.p2_index, price_pane.x, price_pane.w);
                        let x3 = vp.world_x_to_pixel_x(t.p3_index, price_pane.x, price_pane.w);
                        let y1 = ps.y_for_price(t.p1_price);
                        let y2 = ps.y_for_price(t.p2_price);
                        let y3 = ps.y_for_price(t.p3_price);
                        for (cx, cy) in [(x1, y1), (x2, y2), (x3, y3)] {
                            out.push(dot_cmd(cx, cy, false));
                        }
                    }
                    Drawing::Circle(c) => {
                        let cx = vp.world_x_to_pixel_x(c.center_index, price_pane.x, price_pane.w);
                        let rx = vp.world_x_to_pixel_x(c.radius_index, price_pane.x, price_pane.w);
                        let cy = ps.y_for_price(c.center_price);
                        let ry = ps.y_for_price(c.radius_price);
                        // Center dot + radius handle dot
                        out.push(dot_cmd(cx, cy, false));
                        out.push(dot_cmd(rx, ry, false));
                    }
                    Drawing::Ellipse(e) => {
                        let x1 = vp.world_x_to_pixel_x(e.p1_index, price_pane.x, price_pane.w);
                        let x2 = vp.world_x_to_pixel_x(e.p2_index, price_pane.x, price_pane.w);
                        let x3 = vp.world_x_to_pixel_x(e.p3_index, price_pane.x, price_pane.w);
                        let y1 = ps.y_for_price(e.p1_price);
                        let y2 = ps.y_for_price(e.p2_price);
                        let y3 = ps.y_for_price(e.p3_price);
                        for (cx, cy) in [(x1, y1), (x2, y2), (x3, y3)] {
                            out.push(dot_cmd(cx, cy, false));
                        }
                    }
                    _ => {} // Other shapes use the standard resize handles
                }
            }
        }

        out.push(DrawCommand::PopClip);
        out
    }
}

fn apply_price_pane_y_zoom(min: f64, max: f64, zoom_factor: f32, pan_factor: f32) -> (f64, f64) {
    let center = (min + max) * 0.5;
    let half = ((max - min) * 0.5).max(1e-9);
    let zoomed_half = half / zoom_factor.max(1e-6) as f64;
    let pan_delta = zoomed_half * pan_factor as f64;
    (
        center - zoomed_half - pan_delta,
        center + zoomed_half - pan_delta,
    )
}

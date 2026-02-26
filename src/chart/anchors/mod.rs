//! Anchor-point system.
//!
//! An "anchor" is a small solid dot displayed at key control points of select
//! drawing types (Triangle, Circle, Ellipse, Rectangle). Dragging an anchor
//! reshapes only that control point; dragging the body of the shape moves it.

pub mod circle;
pub mod common;
pub mod ellipse;
pub mod line_like;
pub mod rectangle;
pub mod triangle;

use crate::{
    drawings::types::Drawing,
    render::{
        primitives::DrawCommand,
        styles::{ColorToken, FillStyle, StrokeStyle},
    },
    scale::PriceScale,
    types::{Point, Rect},
    viewport::Viewport,
};

use self::common::apply_price_pane_y_zoom;
use crate::chart::Chart;

/// Visual radius of anchor dots (px).
pub(crate) const ANCHOR_R: f32 = 3.0;
/// Hit radius: how close the pointer must be to snap to an anchor (px).
pub(crate) const ANCHOR_HIT_R: f32 = 8.0;

// ---------------------------------------------------------------------------
// Drawing helpers
// ---------------------------------------------------------------------------

/// Anchor with default (DrawingPrimary) color — used for pending construction points.
fn anchor_cmd_default(cx: f32, cy: f32) -> DrawCommand {
    DrawCommand::Ellipse {
        cx,
        cy,
        rx: ANCHOR_R,
        ry: ANCHOR_R,
        rotation: 0.0,
        fill: Some(FillStyle::token(ColorToken::DrawingPrimary)),
        stroke: Some(StrokeStyle::token(ColorToken::DrawingPrimary, 1.0)),
    }
}

/// Anchor using the drawing's stroke color — same as the border.
fn anchor_cmd_with_color(cx: f32, cy: f32, stroke_color: &str) -> DrawCommand {
    let fill = FillStyle::css(stroke_color.to_string());
    let stroke = StrokeStyle::css(stroke_color.to_string(), 1.0);
    DrawCommand::Ellipse {
        cx,
        cy,
        rx: ANCHOR_R,
        ry: ANCHOR_R,
        rotation: 0.0,
        fill: Some(fill),
        stroke: Some(stroke),
    }
}

// ---------------------------------------------------------------------------
// Anchor position computation
// ---------------------------------------------------------------------------

/// Returns pixel-space anchor positions for the drawing.
/// The ordering of anchors (by index) is fixed per shape type — it must match
/// `move_anchor_to_pixel`.
pub(crate) fn anchor_positions(
    drawing: &Drawing,
    vp: &Viewport,
    price_pane: Rect,
    ps: PriceScale,
) -> Vec<Point> {
    match drawing {
        // ── Triangle: 3 vertices ────────────────────────────────────────────
        Drawing::Triangle(t) => vec![
            Point {
                x: vp.world_x_to_pixel_x(t.p1_index, price_pane.x, price_pane.w),
                y: ps.y_for_price(t.p1_price),
            },
            Point {
                x: vp.world_x_to_pixel_x(t.p2_index, price_pane.x, price_pane.w),
                y: ps.y_for_price(t.p2_price),
            },
            Point {
                x: vp.world_x_to_pixel_x(t.p3_index, price_pane.x, price_pane.w),
                y: ps.y_for_price(t.p3_price),
            },
        ],

        // ── Circle: 2 anchors (center, right-radius) ───────────────────────
        // 0 = center (moves whole circle), 1 = right-side radius handle.
        Drawing::Circle(c) => {
            let cx = vp.world_x_to_pixel_x(c.center_index, price_pane.x, price_pane.w);
            let cy = ps.y_for_price(c.center_price);
            let rx = vp.world_x_to_pixel_x(c.radius_index, price_pane.x, price_pane.w);
            let ry = ps.y_for_price(c.radius_price);
            let r = ((rx - cx).powi(2) + (ry - cy).powi(2)).sqrt().max(1.0);
            vec![Point { x: cx, y: cy }, Point { x: cx + r, y: cy }]
        }

        // -- Ellipse: 4 properly rotated axis extremes --
        // 0=minor+, 1=major+(p2 side), 2=minor-, 3=major-(p1 side)
        Drawing::Ellipse(e) => {
            let x1 = vp.world_x_to_pixel_x(e.p1_index, price_pane.x, price_pane.w);
            let x2 = vp.world_x_to_pixel_x(e.p2_index, price_pane.x, price_pane.w);
            let x3 = vp.world_x_to_pixel_x(e.p3_index, price_pane.x, price_pane.w);
            let y1 = ps.y_for_price(e.p1_price);
            let y2 = ps.y_for_price(e.p2_price);
            let y3 = ps.y_for_price(e.p3_price);
            let cx = (x1 + x2) * 0.5;
            let cy = (y1 + y2) * 0.5;
            let rx = ((x2 - x1).hypot(y2 - y1) * 0.5).max(1.0);
            let ry = ((x3 - cx).hypot(y3 - cy)).max(1.0);
            let theta = (y2 - y1).atan2(x2 - x1);
            let (sin_t, cos_t) = theta.sin_cos();
            vec![
                Point {
                    x: cx - ry * sin_t,
                    y: cy + ry * cos_t,
                }, // 0 minor+
                Point {
                    x: cx + rx * cos_t,
                    y: cy + rx * sin_t,
                }, // 1 major+ (p2 side)
                Point {
                    x: cx + ry * sin_t,
                    y: cy - ry * cos_t,
                }, // 2 minor-
                Point {
                    x: cx - rx * cos_t,
                    y: cy - rx * sin_t,
                }, // 3 major- (p1 side)
            ]
        }

        // ── Rectangle: 8 anchors ────────────────────────────────────────────
        // Index layout:
        //   0 (TL) ── 1 (TM) ── 2 (TR)
        //   3 (LM)            ── 4 (RM)
        //   5 (BL) ── 6 (BM) ── 7 (BR)
        Drawing::Rectangle(r) => {
            let lx = vp.world_x_to_pixel_x(r.start_index, price_pane.x, price_pane.w);
            let rx = vp.world_x_to_pixel_x(r.end_index, price_pane.x, price_pane.w);
            let ty = ps.y_for_price(r.top_price);
            let by_ = ps.y_for_price(r.bottom_price);
            let mx = (lx + rx) * 0.5;
            let my = (ty + by_) * 0.5;
            vec![
                Point { x: lx, y: ty },  // 0 TL
                Point { x: mx, y: ty },  // 1 TM
                Point { x: rx, y: ty },  // 2 TR
                Point { x: lx, y: my },  // 3 LM
                Point { x: rx, y: my },  // 4 RM
                Point { x: lx, y: by_ }, // 5 BL
                Point { x: mx, y: by_ }, // 6 BM
                Point { x: rx, y: by_ }, // 7 BR
            ]
        }

        _ => vec![],
    }
}

/// Return the anchor index closest to `pointer` within ANCHOR_HIT_R, or None.
pub(crate) fn hit_anchor(anchors: &[Point], pointer: Point) -> Option<usize> {
    anchors.iter().enumerate().find_map(|(i, a)| {
        let d = ((a.x - pointer.x).powi(2) + (a.y - pointer.y).powi(2)).sqrt();
        if d <= ANCHOR_HIT_R {
            Some(i)
        } else {
            None
        }
    })
}

// ---------------------------------------------------------------------------
// Chart impl
// ---------------------------------------------------------------------------

impl Chart {
    /// Emit draw commands for: pending construction dots + selected-shape anchors.
    pub(crate) fn build_anchor_commands(&self) -> Vec<DrawCommand> {
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
            mode: self.price_axis_mode,
        };

        let mut out = Vec::new();
        out.push(DrawCommand::PushClip { rect: price_pane });

        for p in &self.drawing_interaction.pending_points {
            out.push(anchor_cmd_default(p.x, p.y));
        }

        if let Some(id) = self.selected_drawing_id() {
            if !self.is_drawing_locked(id) {
                if let Some(drawing) = self.drawings.drawing(id) {
                    for a in anchor_positions(drawing, &vp, price_pane, ps) {
                        if let Some(ref color) = drawing.style().stroke_color {
                            out.push(anchor_cmd_with_color(a.x, a.y, color));
                        } else {
                            out.push(anchor_cmd_default(a.x, a.y));
                        }
                    }
                }
            }
        }

        out.push(DrawCommand::PopClip);
        out
    }

    /// Returns the anchor index at `(x, y)` for the currently selected drawing, or None.
    pub(crate) fn anchor_index_at(&self, x: f32, y: f32) -> Option<usize> {
        let id = self.selected_drawing_id()?;
        let drawing = self.drawings.drawing(id)?;
        let layout = self.current_layout();
        let price_pane = layout.price_pane().unwrap_or(layout.plot);
        let vp = self.viewport?;
        let visible = self.visible_data();
        if visible.is_empty() {
            return None;
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
            mode: self.price_axis_mode,
        };
        let anchors = anchor_positions(drawing, &vp, price_pane, ps);
        hit_anchor(&anchors, Point { x, y })
    }

    /// Move a single anchor to an absolute pixel position.
    /// For shapes where control points can be set directly from a pixel coordinate
    /// (Triangle, Ellipse, Rectangle), we use `drawing_world_price_at` to convert.
    /// Circle anchors:
    /// - center anchor moves whole shape
    /// - right-side radius anchor resizes deterministically along +x axis
    ///
    /// Locked drawings cannot be edited; returns early.
    pub(crate) fn move_anchor_to_pixel(
        &mut self,
        drawing_id: u64,
        anchor_idx: usize,
        pixel_x: f32,
        pixel_y: f32,
    ) {
        if self.is_drawing_locked(drawing_id) {
            return;
        }
        match self.drawings.drawing(drawing_id).map(|d| d.shape_tag()) {
            Some(ShapeTag::Triangle) => {
                self.move_triangle_anchor(drawing_id, anchor_idx, pixel_x, pixel_y)
            }
            Some(ShapeTag::Circle) => {
                self.move_circle_anchor(drawing_id, anchor_idx, pixel_x, pixel_y)
            }
            Some(ShapeTag::Ellipse) => {
                self.move_ellipse_anchor(drawing_id, anchor_idx, pixel_x, pixel_y)
            }
            Some(ShapeTag::Rectangle) => {
                self.move_rectangle_anchor(drawing_id, anchor_idx, pixel_x, pixel_y)
            }
            _ => {}
        }
    }

    // ── Triangle: set vertex directly ───────────────────────────────────────
    fn move_triangle_anchor(&mut self, id: u64, idx: usize, px: f32, py: f32) {
        let Some((world_x, price)) = self.drawing_world_price_at(px, py) else {
            return;
        };
        let Some(Drawing::Triangle(t)) = self.drawings.drawing_mut(id) else {
            return;
        };
        match idx {
            0 => {
                t.p1_index = world_x;
                t.p1_price = price;
            }
            1 => {
                t.p2_index = world_x;
                t.p2_price = price;
            }
            2 => {
                t.p3_index = world_x;
                t.p3_price = price;
            }
            _ => {}
        }
    }

    // ── Circle anchors: 0=center move, 1=right-radius resize ────────────────
    fn move_circle_anchor(&mut self, id: u64, idx: usize, px: f32, py: f32) {
        let layout = self.current_layout();
        let price_pane = layout.price_pane().unwrap_or(layout.plot);
        let Some(vp) = self.viewport else {
            return;
        };
        let visible = self.visible_data();
        if visible.is_empty() {
            return;
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
            mode: self.price_axis_mode,
        };

        let (cx_px, cy_px, r_px) = {
            let Some(Drawing::Circle(c)) = self.drawings.drawing(id) else {
                return;
            };
            let cx = vp.world_x_to_pixel_x(c.center_index, price_pane.x, price_pane.w);
            let cy = ps.y_for_price(c.center_price);
            let rx = vp.world_x_to_pixel_x(c.radius_index, price_pane.x, price_pane.w);
            let ry = ps.y_for_price(c.radius_price);
            (
                cx,
                cy,
                ((rx - cx).powi(2) + (ry - cy).powi(2)).sqrt().max(1.0),
            )
        };

        match idx {
            0 => {
                let Some((world_x, price)) = self.drawing_world_price_at(px, py) else {
                    return;
                };
                let Some((next_r_world_x, next_r_price)) =
                    self.drawing_world_price_at(px + r_px, py)
                else {
                    return;
                };
                let Some(Drawing::Circle(c)) = self.drawings.drawing_mut(id) else {
                    return;
                };
                c.center_index = world_x;
                c.center_price = price;
                // Keep circle deterministic: radius handle stays on +x axis.
                c.radius_index = next_r_world_x.max(c.center_index);
                c.radius_price = next_r_price;
            }
            1 => {
                let new_r = (px - cx_px).abs().max(1.0);
                let Some((radius_world_x, _)) = self.drawing_world_price_at(cx_px + new_r, cy_px)
                else {
                    return;
                };
                let Some(Drawing::Circle(c)) = self.drawings.drawing_mut(id) else {
                    return;
                };
                c.radius_index = radius_world_x.max(c.center_index);
                c.radius_price = c.center_price;
            }
            _ => {}
        }
    }

    // ── Ellipse: 4 extreme anchors ──────────────────────────────────────────
    // N/S (0, 2) control the perpendicular radius (p3 equivalent).
    // E/W (1, 3) control the main diameter (p1/p2 symmetrically).
    fn move_ellipse_anchor(&mut self, id: u64, idx: usize, px: f32, py: f32) {
        let layout = self.current_layout();
        let price_pane = layout.price_pane().unwrap_or(layout.plot);
        let Some(vp) = self.viewport else {
            return;
        };
        let visible = self.visible_data();
        if visible.is_empty() {
            return;
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
            mode: self.price_axis_mode,
        };

        // Snapshot pixel coords
        let (x1, y1, x2, y2, x3, y3) = {
            let Some(Drawing::Ellipse(e)) = self.drawings.drawing(id) else {
                return;
            };
            (
                vp.world_x_to_pixel_x(e.p1_index, price_pane.x, price_pane.w),
                ps.y_for_price(e.p1_price),
                vp.world_x_to_pixel_x(e.p2_index, price_pane.x, price_pane.w),
                ps.y_for_price(e.p2_price),
                vp.world_x_to_pixel_x(e.p3_index, price_pane.x, price_pane.w),
                ps.y_for_price(e.p3_price),
            )
        };
        let cx = (x1 + x2) * 0.5;
        let cy = (y1 + y2) * 0.5;
        let theta = (y2 - y1).atan2(x2 - x1);
        let (sin_t, cos_t) = theta.sin_cos();
        let old_ry = ((x3 - cx).hypot(y3 - cy)).max(1.0);

        match idx {
            // Minor axis anchors (0, 2): set ry. Snap p3 to true perpendicular.
            // p3 is stored purely as a magnitude reference on the perp axis.
            0 | 2 => {
                let new_ry = ((px - cx).powi(2) + (py - cy).powi(2)).sqrt().max(1.0);
                // Snap p3 onto the correct perpendicular direction (-sin t, cos t)
                let new_x3 = cx - new_ry * sin_t;
                let new_y3 = cy + new_ry * cos_t;
                let Some((nx, np)) = self.drawing_world_price_at(new_x3, new_y3) else {
                    return;
                };
                let Some(Drawing::Ellipse(e)) = self.drawings.drawing_mut(id) else {
                    return;
                };
                e.p3_index = nx;
                e.p3_price = np;
            }
            // East/West (major axis anchors):
            // Dragged endpoint follows cursor freely, opposite endpoint is mirrored
            // around center. This updates axis direction (rotation) and major radius
            // in one gesture while preserving minor radius magnitude.
            1 | 3 => {
                let vx = px - cx;
                let vy = py - cy;
                let new_rx = (vx * vx + vy * vy).sqrt().max(1.0);
                let ux = vx / new_rx;
                let uy = vy / new_rx;

                let (new_x1, new_y1, new_x2, new_y2) = if idx == 1 {
                    // Anchor at +major side (aligned with p2)
                    (cx - new_rx * ux, cy - new_rx * uy, px, py)
                } else {
                    // Anchor at -major side (aligned with p1)
                    (px, py, cx + new_rx * ux, cy + new_rx * uy)
                };

                // Keep minor radius length, but snap p3 onto the new perpendicular.
                let perp_x = -uy;
                let perp_y = ux;
                let new_x3 = cx + old_ry * perp_x;
                let new_y3 = cy + old_ry * perp_y;

                let Some((nx1, np1)) = self.drawing_world_price_at(new_x1, new_y1) else {
                    return;
                };
                let Some((nx2, np2)) = self.drawing_world_price_at(new_x2, new_y2) else {
                    return;
                };
                let Some((nx3, np3)) = self.drawing_world_price_at(new_x3, new_y3) else {
                    return;
                };
                let Some(Drawing::Ellipse(e)) = self.drawings.drawing_mut(id) else {
                    return;
                };
                e.p1_index = nx1;
                e.p1_price = np1;
                e.p2_index = nx2;
                e.p2_price = np2;
                e.p3_index = nx3;
                e.p3_price = np3;
            }
            _ => {}
        }
    }

    // ── Rectangle: 8 anchors ────────────────────────────────────────────────
    fn move_rectangle_anchor(&mut self, id: u64, idx: usize, px: f32, py: f32) {
        let Some((world_x, price)) = self.drawing_world_price_at(px, py) else {
            return;
        };
        let Some(Drawing::Rectangle(r)) = self.drawings.drawing_mut(id) else {
            return;
        };
        match idx {
            0 => {
                r.start_index = world_x;
                r.top_price = price;
            } // TL
            1 => {
                r.top_price = price;
            } // TM
            2 => {
                r.end_index = world_x;
                r.top_price = price;
            } // TR
            3 => {
                r.start_index = world_x;
            } // LM
            4 => {
                r.end_index = world_x;
            } // RM
            5 => {
                r.start_index = world_x;
                r.bottom_price = price;
            } // BL
            6 => {
                r.bottom_price = price;
            } // BM
            7 => {
                r.end_index = world_x;
                r.bottom_price = price;
            } // BR
            _ => {}
        }
    }
}

/// Lightweight tag to avoid double-borrowing in `move_anchor_to_pixel`.
enum ShapeTag {
    Triangle,
    Circle,
    Ellipse,
    Rectangle,
}

trait DrawingShapeTag {
    fn shape_tag(&self) -> ShapeTag;
}

impl DrawingShapeTag for Drawing {
    fn shape_tag(&self) -> ShapeTag {
        match self {
            Drawing::Triangle(_) => ShapeTag::Triangle,
            Drawing::Circle(_) => ShapeTag::Circle,
            Drawing::Ellipse(_) => ShapeTag::Ellipse,
            Drawing::Rectangle(_) => ShapeTag::Rectangle,
            _ => ShapeTag::Triangle, // fallback, won't be called
        }
    }
}

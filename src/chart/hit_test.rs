//! Chart-level picking for user drawings.
//!
//! This bridges chart state/layout into backend-agnostic drawing primitives and
//! delegates geometric matching to `drawings::hit_test`.

use crate::{
    drawings::{
        hit_test::{
            pick_primitives, HitMatch, HitPrimitive, HitToleranceProfile, InteractionMode,
            LinePrimitive, RectPrimitive,
        },
        types::Drawing,
    },
    plots::model::PaneId,
    scale::PriceScale,
    types::Point,
};

use super::Chart;

impl Chart {
    /// Hit-tests drawings at pixel coordinates with default tolerance profile.
    pub fn hit_test_drawings(
        &self,
        x_pixels: f32,
        y_pixels: f32,
        mode: InteractionMode,
    ) -> Option<HitMatch> {
        self.hit_test_drawings_with_profile(
            x_pixels,
            y_pixels,
            mode,
            HitToleranceProfile::default(),
        )
    }

    /// Hit-tests drawings at pixel coordinates with a custom tolerance profile.
    pub fn hit_test_drawings_with_profile(
        &self,
        x_pixels: f32,
        y_pixels: f32,
        mode: InteractionMode,
        tolerance_profile: HitToleranceProfile,
    ) -> Option<HitMatch> {
        if self.candles.is_empty() {
            return None;
        }

        let layout = self.current_layout();
        let target_pane = layout
            .panes
            .iter()
            .find(|pane| y_pixels >= pane.rect.y && y_pixels <= pane.rect.bottom())
            .map(|pane| pane.id.clone())?;

        let price_pane = layout.price_pane().unwrap_or(layout.plot);
        let (visible_start, visible_end) = match self.viewport {
            Some(vp) => vp.visible_range(self.candles.len()),
            None => (0, self.candles.len()),
        };
        let visible = &self.candles[visible_start..visible_end];
        let (min_price, max_price, _) = if visible.is_empty() {
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
        let ps = PriceScale {
            pane: price_pane,
            min: min_price,
            max: max_price,
        };

        let target_pane_rect = layout
            .pane_by_id(&target_pane)
            .map(|pane| pane.rect)
            .unwrap_or(layout.plot);

        let mut primitives = Vec::new();
        for (paint_order, drawing) in self
            .drawings
            .visible_items_in_paint_order()
            .into_iter()
            .enumerate()
        {
            match drawing {
                Drawing::HorizontalLine(h) => {
                    if !matches!(target_pane, PaneId::Price) {
                        continue;
                    }

                    let y = ps.y_for_price(h.price);
                    if y < price_pane.y || y > price_pane.bottom() {
                        continue;
                    }

                    primitives.push(HitPrimitive::Line(LinePrimitive {
                        primitive_id: h.id,
                        pane_id: PaneId::Price,
                        from: Point { x: price_pane.x, y },
                        to: Point {
                            x: price_pane.right(),
                            y,
                        },
                        paint_order: paint_order as u32,
                        segment_id: 0,
                    }));
                }
                Drawing::VerticalLine(v) => {
                    let Some(vp) = self.viewport else {
                        continue;
                    };

                    let x = vp.world_x_to_pixel_x(v.index, price_pane.x, price_pane.w.max(1.0));
                    if x < price_pane.x || x > price_pane.right() {
                        continue;
                    }

                    primitives.push(HitPrimitive::Line(LinePrimitive {
                        primitive_id: v.id,
                        pane_id: target_pane.clone(),
                        from: Point {
                            x,
                            y: target_pane_rect.y,
                        },
                        to: Point {
                            x,
                            y: target_pane_rect.bottom(),
                        },
                        paint_order: paint_order as u32,
                        segment_id: 0,
                    }));
                }
                Drawing::Ray(ray) => {
                    if !matches!(target_pane, PaneId::Price) {
                        continue;
                    }

                    let Some(vp) = self.viewport else {
                        continue;
                    };

                    let start_x =
                        vp.world_x_to_pixel_x(ray.start_index, price_pane.x, price_pane.w.max(1.0));
                    let end_x =
                        vp.world_x_to_pixel_x(ray.end_index, price_pane.x, price_pane.w.max(1.0));
                    if (end_x - start_x).abs() <= 0.5 {
                        continue;
                    }

                    let start_y = ps.y_for_price(ray.start_price);
                    let end_y = ps.y_for_price(ray.end_price);
                    let slope = (end_y - start_y) / (end_x - start_x);
                    let x_right = price_pane.right();
                    let y_right = end_y + slope * (x_right - end_x);

                    primitives.push(HitPrimitive::Line(LinePrimitive {
                        primitive_id: ray.id,
                        pane_id: PaneId::Price,
                        from: Point {
                            x: start_x,
                            y: start_y,
                        },
                        to: Point {
                            x: x_right,
                            y: y_right,
                        },
                        paint_order: paint_order as u32,
                        segment_id: 0,
                    }));
                }
                Drawing::Rectangle(r) => {
                    if !matches!(target_pane, PaneId::Price) {
                        continue;
                    }

                    let Some(vp) = self.viewport else {
                        continue;
                    };
                    let left_x =
                        vp.world_x_to_pixel_x(r.start_index, price_pane.x, price_pane.w.max(1.0));
                    let right_x =
                        vp.world_x_to_pixel_x(r.end_index, price_pane.x, price_pane.w.max(1.0));
                    let top_y = ps.y_for_price(r.top_price);
                    let bottom_y = ps.y_for_price(r.bottom_price);

                    primitives.push(HitPrimitive::Rect(RectPrimitive {
                        primitive_id: r.id,
                        pane_id: PaneId::Price,
                        rect: crate::types::Rect {
                            x: left_x.min(right_x),
                            y: top_y.min(bottom_y),
                            w: (right_x - left_x).abs().max(1.0),
                            h: (bottom_y - top_y).abs().max(1.0),
                        },
                        paint_order: paint_order as u32,
                    }));
                }
                Drawing::PriceRange(r) => {
                    if !matches!(target_pane, PaneId::Price) {
                        continue;
                    }

                    let Some(vp) = self.viewport else {
                        continue;
                    };
                    let left_x =
                        vp.world_x_to_pixel_x(r.start_index, price_pane.x, price_pane.w.max(1.0));
                    let right_x =
                        vp.world_x_to_pixel_x(r.end_index, price_pane.x, price_pane.w.max(1.0));
                    let top_y = ps.y_for_price(r.top_price);
                    let bottom_y = ps.y_for_price(r.bottom_price);

                    primitives.push(HitPrimitive::Rect(RectPrimitive {
                        primitive_id: r.id,
                        pane_id: PaneId::Price,
                        rect: crate::types::Rect {
                            x: left_x.min(right_x),
                            y: top_y.min(bottom_y),
                            w: (right_x - left_x).abs().max(1.0),
                            h: (bottom_y - top_y).abs().max(1.0),
                        },
                        paint_order: paint_order as u32,
                    }));
                }
                Drawing::TimeRange(r) => {
                    if !matches!(target_pane, PaneId::Price) {
                        continue;
                    }

                    let Some(vp) = self.viewport else {
                        continue;
                    };
                    let left_x =
                        vp.world_x_to_pixel_x(r.start_index, price_pane.x, price_pane.w.max(1.0));
                    let right_x =
                        vp.world_x_to_pixel_x(r.end_index, price_pane.x, price_pane.w.max(1.0));
                    let top_y = ps.y_for_price(r.top_price);
                    let bottom_y = ps.y_for_price(r.bottom_price);

                    primitives.push(HitPrimitive::Rect(RectPrimitive {
                        primitive_id: r.id,
                        pane_id: PaneId::Price,
                        rect: crate::types::Rect {
                            x: left_x.min(right_x),
                            y: top_y.min(bottom_y),
                            w: (right_x - left_x).abs().max(1.0),
                            h: (bottom_y - top_y).abs().max(1.0),
                        },
                        paint_order: paint_order as u32,
                    }));
                }
                Drawing::DateTimeRange(r) => {
                    if !matches!(target_pane, PaneId::Price) {
                        continue;
                    }

                    let Some(vp) = self.viewport else {
                        continue;
                    };
                    let left_x =
                        vp.world_x_to_pixel_x(r.start_index, price_pane.x, price_pane.w.max(1.0));
                    let right_x =
                        vp.world_x_to_pixel_x(r.end_index, price_pane.x, price_pane.w.max(1.0));
                    let top_y = ps.y_for_price(r.top_price);
                    let bottom_y = ps.y_for_price(r.bottom_price);

                    primitives.push(HitPrimitive::Rect(RectPrimitive {
                        primitive_id: r.id,
                        pane_id: PaneId::Price,
                        rect: crate::types::Rect {
                            x: left_x.min(right_x),
                            y: top_y.min(bottom_y),
                            w: (right_x - left_x).abs().max(1.0),
                            h: (bottom_y - top_y).abs().max(1.0),
                        },
                        paint_order: paint_order as u32,
                    }));
                }
                Drawing::LongPosition(p) => {
                    if !matches!(target_pane, PaneId::Price) {
                        continue;
                    }

                    let Some(vp) = self.viewport else {
                        continue;
                    };
                    let left_x =
                        vp.world_x_to_pixel_x(p.start_index, price_pane.x, price_pane.w.max(1.0));
                    let right_x =
                        vp.world_x_to_pixel_x(p.end_index, price_pane.x, price_pane.w.max(1.0));
                    let top_y = ps.y_for_price(p.target_price);
                    let bottom_y = ps.y_for_price(p.stop_price);

                    primitives.push(HitPrimitive::Rect(RectPrimitive {
                        primitive_id: p.id,
                        pane_id: PaneId::Price,
                        rect: crate::types::Rect {
                            x: left_x.min(right_x),
                            y: top_y.min(bottom_y),
                            w: (right_x - left_x).abs().max(1.0),
                            h: (bottom_y - top_y).abs().max(1.0),
                        },
                        paint_order: paint_order as u32,
                    }));
                }
                Drawing::ShortPosition(p) => {
                    if !matches!(target_pane, PaneId::Price) {
                        continue;
                    }

                    let Some(vp) = self.viewport else {
                        continue;
                    };
                    let left_x =
                        vp.world_x_to_pixel_x(p.start_index, price_pane.x, price_pane.w.max(1.0));
                    let right_x =
                        vp.world_x_to_pixel_x(p.end_index, price_pane.x, price_pane.w.max(1.0));
                    let top_y = ps.y_for_price(p.stop_price);
                    let bottom_y = ps.y_for_price(p.target_price);

                    primitives.push(HitPrimitive::Rect(RectPrimitive {
                        primitive_id: p.id,
                        pane_id: PaneId::Price,
                        rect: crate::types::Rect {
                            x: left_x.min(right_x),
                            y: top_y.min(bottom_y),
                            w: (right_x - left_x).abs().max(1.0),
                            h: (bottom_y - top_y).abs().max(1.0),
                        },
                        paint_order: paint_order as u32,
                    }));
                }
                Drawing::FibRetracement(fib) => {
                    if !matches!(target_pane, PaneId::Price) {
                        continue;
                    }

                    let Some(vp) = self.viewport else {
                        continue;
                    };
                    let left_x =
                        vp.world_x_to_pixel_x(fib.start_index, price_pane.x, price_pane.w.max(1.0));
                    let right_x =
                        vp.world_x_to_pixel_x(fib.end_index, price_pane.x, price_pane.w.max(1.0));
                    let top_y = ps.y_for_price(fib.start_price.max(fib.end_price));
                    let bottom_y = ps.y_for_price(fib.start_price.min(fib.end_price));

                    primitives.push(HitPrimitive::Rect(RectPrimitive {
                        primitive_id: fib.id,
                        pane_id: PaneId::Price,
                        rect: crate::types::Rect {
                            x: left_x.min(right_x),
                            y: top_y.min(bottom_y),
                            w: (right_x - left_x).abs().max(1.0),
                            h: (bottom_y - top_y).abs().max(1.0),
                        },
                        paint_order: paint_order as u32,
                    }));
                }
                Drawing::Triangle(t) => {
                    if !matches!(target_pane, PaneId::Price) {
                        continue;
                    }

                    let Some(vp) = self.viewport else {
                        continue;
                    };
                    // Compute bounding box of the 3 vertices for a fast hit test
                    let x1 = vp.world_x_to_pixel_x(t.p1_index, price_pane.x, price_pane.w.max(1.0));
                    let x2 = vp.world_x_to_pixel_x(t.p2_index, price_pane.x, price_pane.w.max(1.0));
                    let x3 = vp.world_x_to_pixel_x(t.p3_index, price_pane.x, price_pane.w.max(1.0));
                    let y1 = ps.y_for_price(t.p1_price);
                    let y2 = ps.y_for_price(t.p2_price);
                    let y3 = ps.y_for_price(t.p3_price);
                    let left_x = x1.min(x2).min(x3);
                    let right_x = x1.max(x2).max(x3);
                    let top_y = y1.min(y2).min(y3);
                    let bottom_y = y1.max(y2).max(y3);

                    primitives.push(HitPrimitive::Rect(RectPrimitive {
                        primitive_id: t.id,
                        pane_id: PaneId::Price,
                        rect: crate::types::Rect {
                            x: left_x,
                            y: top_y,
                            w: (right_x - left_x).abs().max(1.0),
                            h: (bottom_y - top_y).abs().max(1.0),
                        },
                        paint_order: paint_order as u32,
                    }));
                }
                Drawing::Circle(c) => {
                    if !matches!(target_pane, PaneId::Price) {
                        continue;
                    }

                    let Some(vp) = self.viewport else {
                        continue;
                    };
                    let cx =
                        vp.world_x_to_pixel_x(c.center_index, price_pane.x, price_pane.w.max(1.0));
                    let rx =
                        vp.world_x_to_pixel_x(c.radius_index, price_pane.x, price_pane.w.max(1.0));
                    let cy = ps.y_for_price(c.center_price);
                    let ry = ps.y_for_price(c.radius_price);
                    let r_px = (rx - cx).abs().max((ry - cy).abs()).max(1.0);

                    // Use a Marker primitive so hit is on the circle boundary
                    primitives.push(HitPrimitive::Marker(
                        crate::drawings::hit_test::MarkerPrimitive {
                            primitive_id: c.id,
                            pane_id: PaneId::Price,
                            center: crate::types::Point { x: cx, y: cy },
                            radius_px: r_px,
                            paint_order: paint_order as u32,
                        },
                    ));
                }
                Drawing::Ellipse(e) => {
                    if !matches!(target_pane, PaneId::Price) {
                        continue;
                    }

                    let Some(vp) = self.viewport else {
                        continue;
                    };
                    let x1 = vp.world_x_to_pixel_x(e.p1_index, price_pane.x, price_pane.w.max(1.0));
                    let x2 = vp.world_x_to_pixel_x(e.p2_index, price_pane.x, price_pane.w.max(1.0));
                    let x3 = vp.world_x_to_pixel_x(e.p3_index, price_pane.x, price_pane.w.max(1.0));
                    let y1 = ps.y_for_price(e.p1_price);
                    let y2 = ps.y_for_price(e.p2_price);
                    let y3 = ps.y_for_price(e.p3_price);
                    let cx = (x1 + x2) * 0.5;
                    let cy = (y1 + y2) * 0.5;
                    let rx = ((x2 - x1).hypot(y2 - y1) * 0.5).max(1.0);
                    let ry = ((x3 - cx).hypot(y3 - cy)).max(1.0);

                    primitives.push(HitPrimitive::Rect(RectPrimitive {
                        primitive_id: e.id,
                        pane_id: PaneId::Price,
                        rect: crate::types::Rect {
                            x: cx - rx,
                            y: cy - ry,
                            w: rx * 2.0,
                            h: ry * 2.0,
                        },
                        paint_order: paint_order as u32,
                    }));
                }
            }
        }

        pick_primitives(
            Point {
                x: x_pixels,
                y: y_pixels,
            },
            &primitives,
            mode,
            tolerance_profile,
        )
    }
}

fn apply_y_zoom(min: f64, max: f64, zoom_factor: f32, pan_factor: f32) -> (f64, f64) {
    let span = (max - min).abs().max(1e-9);
    let zoomed_span = span * zoom_factor.max(0.01) as f64;
    let center = (max + min) * 0.5 + pan_factor as f64 * zoomed_span;
    let half = zoomed_span * 0.5;
    (center - half, center + half)
}

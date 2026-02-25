//! Chart-level picking for user drawings.
//!
//! This bridges chart state/layout into backend-agnostic drawing primitives and
//! delegates geometric matching to `drawings::hit_test`.

use crate::{
    drawings::{
        hit_test::{
            pick_primitives, HitMatch, HitPrimitive, HitToleranceProfile, InteractionMode,
            LinePrimitive,
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
        for (paint_order, drawing) in self.drawings.items().iter().enumerate() {
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

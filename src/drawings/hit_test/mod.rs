//! Backend-agnostic hit-testing primitives for drawing interactions.
//!
//! This module converts pointer positions into stable hit metadata so
//! interaction/editing logic can stay out of render and storage code.

pub mod geometry;
pub mod selectors;

use crate::{plots::model::PaneId, types::Point, types::Rect};
use serde::Serialize;
use std::cmp::Ordering;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum InteractionMode {
    Hover,
    Select,
    Drag,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
pub struct HitToleranceProfile {
    pub hover_px: f32,
    pub select_px: f32,
    pub drag_px: f32,
}

impl Default for HitToleranceProfile {
    fn default() -> Self {
        Self {
            hover_px: 6.0,
            select_px: 9.0,
            drag_px: 11.0,
        }
    }
}

impl HitToleranceProfile {
    pub fn for_mode(self, mode: InteractionMode) -> f32 {
        match mode {
            InteractionMode::Hover => self.hover_px,
            InteractionMode::Select => self.select_px,
            InteractionMode::Drag => self.drag_px,
        }
    }
}

#[derive(Debug, Clone)]
pub struct LinePrimitive {
    pub primitive_id: u64,
    pub pane_id: PaneId,
    pub from: Point,
    pub to: Point,
    pub paint_order: u32,
    pub segment_id: u32,
}

#[derive(Debug, Clone)]
pub struct RectPrimitive {
    pub primitive_id: u64,
    pub pane_id: PaneId,
    pub rect: Rect,
    pub paint_order: u32,
}

#[derive(Debug, Clone)]
pub struct MarkerPrimitive {
    pub primitive_id: u64,
    pub pane_id: PaneId,
    pub center: Point,
    pub radius_px: f32,
    pub paint_order: u32,
}

#[derive(Debug, Clone)]
pub enum HitPrimitive {
    Line(LinePrimitive),
    Rect(RectPrimitive),
    Marker(MarkerPrimitive),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum LineHitTarget {
    Segment,
    StartAnchor,
    EndAnchor,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum RectEdge {
    Top,
    Right,
    Bottom,
    Left,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum RectCorner {
    TopLeft,
    TopRight,
    BottomRight,
    BottomLeft,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum RectHitTarget {
    Inside,
    Edge(RectEdge),
    Corner(RectCorner),
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum LocalHitInfo {
    Line {
        segment_id: u32,
        target: LineHitTarget,
        t: f32,
    },
    Rect {
        target: RectHitTarget,
    },
    Marker {
        target: &'static str,
    },
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct HitMatch {
    pub primitive_id: u64,
    pub pane_id: PaneId,
    pub distance_px: f32,
    pub paint_order: u32,
    pub local: LocalHitInfo,
}

pub fn pick_primitives(
    point: Point,
    primitives: &[HitPrimitive],
    mode: InteractionMode,
    tolerance_profile: HitToleranceProfile,
) -> Option<HitMatch> {
    pick_all_primitives(point, primitives, mode, tolerance_profile)
        .into_iter()
        .next()
}

pub fn pick_all_primitives(
    point: Point,
    primitives: &[HitPrimitive],
    mode: InteractionMode,
    tolerance_profile: HitToleranceProfile,
) -> Vec<HitMatch> {
    let tolerance = tolerance_profile.for_mode(mode).max(0.0);

    let mut hits = Vec::new();
    for primitive in primitives {
        if let Some(hit) = hit_primitive(point, primitive, tolerance) {
            hits.push(hit);
        }
    }

    hits.sort_by(hit_ordering);
    hits
}

fn hit_ordering(a: &HitMatch, b: &HitMatch) -> Ordering {
    a.distance_px
        .total_cmp(&b.distance_px)
        .then_with(|| b.paint_order.cmp(&a.paint_order))
        .then_with(|| a.primitive_id.cmp(&b.primitive_id))
        .then_with(|| pane_cmp(&a.pane_id, &b.pane_id))
        .then_with(|| local_kind_rank(a.local).cmp(&local_kind_rank(b.local)))
}

fn pane_cmp(a: &PaneId, b: &PaneId) -> Ordering {
    match (a, b) {
        (PaneId::Price, PaneId::Price) => Ordering::Equal,
        (PaneId::Price, PaneId::Named(_)) => Ordering::Less,
        (PaneId::Named(_), PaneId::Price) => Ordering::Greater,
        (PaneId::Named(a_name), PaneId::Named(b_name)) => a_name.cmp(b_name),
    }
}

fn local_kind_rank(local: LocalHitInfo) -> u8 {
    match local {
        LocalHitInfo::Line { .. } => 0,
        LocalHitInfo::Rect { .. } => 1,
        LocalHitInfo::Marker { .. } => 2,
    }
}

fn hit_primitive(point: Point, primitive: &HitPrimitive, tolerance: f32) -> Option<HitMatch> {
    match primitive {
        HitPrimitive::Line(line) => {
            let (distance, t) = distance_to_segment(point, line.from, line.to);
            if distance > tolerance {
                return None;
            }

            let start_distance = distance_between(point, line.from);
            let end_distance = distance_between(point, line.to);
            let target = if start_distance <= tolerance {
                LineHitTarget::StartAnchor
            } else if end_distance <= tolerance {
                LineHitTarget::EndAnchor
            } else {
                LineHitTarget::Segment
            };

            Some(HitMatch {
                primitive_id: line.primitive_id,
                pane_id: line.pane_id.clone(),
                distance_px: distance,
                paint_order: line.paint_order,
                local: LocalHitInfo::Line {
                    segment_id: line.segment_id,
                    target,
                    t,
                },
            })
        }
        HitPrimitive::Rect(rect) => {
            let (distance, target) = rect_hit(point, rect.rect, tolerance)?;
            Some(HitMatch {
                primitive_id: rect.primitive_id,
                pane_id: rect.pane_id.clone(),
                distance_px: distance,
                paint_order: rect.paint_order,
                local: LocalHitInfo::Rect { target },
            })
        }
        HitPrimitive::Marker(marker) => {
            let center_distance = distance_between(point, marker.center);
            let edge_distance = (center_distance - marker.radius_px.max(0.0)).max(0.0);
            if edge_distance > tolerance {
                return None;
            }

            Some(HitMatch {
                primitive_id: marker.primitive_id,
                pane_id: marker.pane_id.clone(),
                distance_px: edge_distance,
                paint_order: marker.paint_order,
                local: LocalHitInfo::Marker { target: "center" },
            })
        }
    }
}

fn rect_hit(point: Point, rect: Rect, tolerance: f32) -> Option<(f32, RectHitTarget)> {
    let left = rect.x;
    let right = rect.right();
    let top = rect.y;
    let bottom = rect.bottom();

    let expanded_left = left - tolerance;
    let expanded_right = right + tolerance;
    let expanded_top = top - tolerance;
    let expanded_bottom = bottom + tolerance;

    let in_expanded = point.x >= expanded_left
        && point.x <= expanded_right
        && point.y >= expanded_top
        && point.y <= expanded_bottom;
    if !in_expanded {
        return None;
    }

    let inside = point.x >= left && point.x <= right && point.y >= top && point.y <= bottom;

    let near_left = (point.x - left).abs() <= tolerance;
    let near_right = (point.x - right).abs() <= tolerance;
    let near_top = (point.y - top).abs() <= tolerance;
    let near_bottom = (point.y - bottom).abs() <= tolerance;

    let target = if near_left && near_top {
        RectHitTarget::Corner(RectCorner::TopLeft)
    } else if near_right && near_top {
        RectHitTarget::Corner(RectCorner::TopRight)
    } else if near_right && near_bottom {
        RectHitTarget::Corner(RectCorner::BottomRight)
    } else if near_left && near_bottom {
        RectHitTarget::Corner(RectCorner::BottomLeft)
    } else if near_top {
        RectHitTarget::Edge(RectEdge::Top)
    } else if near_right {
        RectHitTarget::Edge(RectEdge::Right)
    } else if near_bottom {
        RectHitTarget::Edge(RectEdge::Bottom)
    } else if near_left {
        RectHitTarget::Edge(RectEdge::Left)
    } else if inside {
        RectHitTarget::Inside
    } else {
        return None;
    };

    let dx = if point.x < left {
        left - point.x
    } else if point.x > right {
        point.x - right
    } else {
        0.0
    };
    let dy = if point.y < top {
        top - point.y
    } else if point.y > bottom {
        point.y - bottom
    } else {
        0.0
    };

    Some(((dx * dx + dy * dy).sqrt(), target))
}

fn distance_to_segment(point: Point, from: Point, to: Point) -> (f32, f32) {
    let vx = to.x - from.x;
    let vy = to.y - from.y;
    let len_sq = vx * vx + vy * vy;

    if len_sq <= 1e-9 {
        return (distance_between(point, from), 0.0);
    }

    let wx = point.x - from.x;
    let wy = point.y - from.y;
    let t = ((wx * vx + wy * vy) / len_sq).clamp(0.0, 1.0);

    let proj = Point {
        x: from.x + vx * t,
        y: from.y + vy * t,
    };

    (distance_between(point, proj), t)
}

fn distance_between(a: Point, b: Point) -> f32 {
    let dx = a.x - b.x;
    let dy = a.y - b.y;
    (dx * dx + dy * dy).sqrt()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn overlaps_are_deterministic_and_prefer_topmost_paint_order() {
        let point = Point { x: 20.0, y: 20.0 };
        let primitives = vec![
            HitPrimitive::Line(LinePrimitive {
                primitive_id: 12,
                pane_id: PaneId::Price,
                from: Point { x: 10.0, y: 20.0 },
                to: Point { x: 40.0, y: 20.0 },
                paint_order: 1,
                segment_id: 0,
            }),
            HitPrimitive::Line(LinePrimitive {
                primitive_id: 11,
                pane_id: PaneId::Price,
                from: Point { x: 10.0, y: 20.0 },
                to: Point { x: 40.0, y: 20.0 },
                paint_order: 3,
                segment_id: 0,
            }),
        ];

        let hit = pick_primitives(
            point,
            &primitives,
            InteractionMode::Hover,
            HitToleranceProfile::default(),
        )
        .expect("expected hit");

        assert_eq!(hit.primitive_id, 11);
        assert_eq!(hit.paint_order, 3);
    }

    #[test]
    fn mode_tolerance_changes_pick_result() {
        let point = Point { x: 50.0, y: 27.0 };
        let line = HitPrimitive::Line(LinePrimitive {
            primitive_id: 1,
            pane_id: PaneId::Price,
            from: Point { x: 10.0, y: 20.0 },
            to: Point { x: 100.0, y: 20.0 },
            paint_order: 0,
            segment_id: 0,
        });
        let primitives = vec![line];

        let profile = HitToleranceProfile {
            hover_px: 6.0,
            select_px: 8.0,
            drag_px: 10.0,
        };

        let hover_hit = pick_primitives(point, &primitives, InteractionMode::Hover, profile);
        let select_hit = pick_primitives(point, &primitives, InteractionMode::Select, profile);

        assert!(hover_hit.is_none());
        assert!(select_hit.is_some());
    }

    #[test]
    fn line_anchor_target_is_reported() {
        let line = HitPrimitive::Line(LinePrimitive {
            primitive_id: 3,
            pane_id: PaneId::Price,
            from: Point { x: 10.0, y: 20.0 },
            to: Point { x: 100.0, y: 20.0 },
            paint_order: 0,
            segment_id: 7,
        });

        let hit = pick_primitives(
            Point { x: 11.0, y: 20.5 },
            &[line],
            InteractionMode::Hover,
            HitToleranceProfile::default(),
        )
        .expect("expected start-anchor hit");

        match hit.local {
            LocalHitInfo::Line {
                target: LineHitTarget::StartAnchor,
                segment_id,
                ..
            } => assert_eq!(segment_id, 7),
            other => panic!("unexpected local hit: {other:?}"),
        }
    }

    #[test]
    fn rect_and_marker_hits_return_local_geometry_info() {
        let primitives = vec![
            HitPrimitive::Rect(RectPrimitive {
                primitive_id: 5,
                pane_id: PaneId::Price,
                rect: Rect {
                    x: 10.0,
                    y: 10.0,
                    w: 20.0,
                    h: 20.0,
                },
                paint_order: 0,
            }),
            HitPrimitive::Marker(MarkerPrimitive {
                primitive_id: 6,
                pane_id: PaneId::Price,
                center: Point { x: 80.0, y: 80.0 },
                radius_px: 3.0,
                paint_order: 0,
            }),
        ];

        let rect_hit = pick_primitives(
            Point { x: 10.5, y: 10.5 },
            &primitives,
            InteractionMode::Hover,
            HitToleranceProfile::default(),
        )
        .expect("expected rect hit");
        match rect_hit.local {
            LocalHitInfo::Rect {
                target: RectHitTarget::Corner(RectCorner::TopLeft),
            } => {}
            other => panic!("unexpected rect local hit: {other:?}"),
        }

        let marker_hit = pick_primitives(
            Point { x: 82.0, y: 80.0 },
            &primitives,
            InteractionMode::Hover,
            HitToleranceProfile::default(),
        )
        .expect("expected marker hit");
        match marker_hit.local {
            LocalHitInfo::Marker { target } => assert_eq!(target, "center"),
            other => panic!("unexpected marker local hit: {other:?}"),
        }
    }
}

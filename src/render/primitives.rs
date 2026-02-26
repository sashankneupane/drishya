//! Backend-agnostic scene primitives.
//!
//! Render builders output these commands; concrete backends decide how to draw
//! them for a specific target.

use crate::types::{Point, Rect};

use super::styles::{FillStyle, StrokeStyle, TextStyle};

#[derive(Debug, Clone)]
pub enum DrawCommand {
    PushClip {
        rect: Rect,
    },
    PopClip,
    Line {
        from: Point,
        to: Point,
        stroke: StrokeStyle,
    },
    Rect {
        rect: Rect,
        fill: Option<FillStyle>,
        stroke: Option<StrokeStyle>,
    },
    Polygon {
        points: Vec<Point>,
        fill: Option<FillStyle>,
        stroke: Option<StrokeStyle>,
    },
    Ellipse {
        /// Center of the ellipse in pixel space.
        cx: f32,
        cy: f32,
        /// Semi-axes in pixel space (rx along the major axis, ry along the minor).
        rx: f32,
        ry: f32,
        /// Rotation of the major axis from the positive-x screen axis (radians).
        rotation: f32,
        fill: Option<FillStyle>,
        stroke: Option<StrokeStyle>,
    },
    Text {
        pos: Point,
        text: String,
        style: TextStyle,
    },
}

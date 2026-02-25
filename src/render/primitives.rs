//! Backend-agnostic scene primitives.
//!
//! Render builders output these commands; concrete backends decide how to draw
//! them for a specific target.

use crate::types::{Point, Rect};

#[derive(Debug, Clone)]
pub enum DrawCommand {
    Line {
        from: Point,
        to: Point,
        width: f32,
        color: String,
    },
    Rect {
        rect: Rect,
        fill: Option<String>,
        stroke: Option<String>,
        line_width: f32,
    },
    Polygon {
        points: Vec<Point>,
        fill: Option<String>,
        stroke: Option<String>,
        line_width: f32,
    },
    Text {
        pos: Point,
        text: String,
        size: f32,
        color: String,
        // String-based for a simple wasm boundary; callers use known values.
        align: String, // "left", "right", "center"
    },
}

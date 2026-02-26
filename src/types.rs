//! Shared data and geometry types.
//!
//! These structs are intentionally lightweight and copy-friendly because they
//! are passed frequently through scene builders.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct Candle {
    /// Source timestamp from upstream feed; currently rendered as raw numeric
    /// labels in axis generation.
    pub ts: i64,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
    pub volume: f64,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum CursorMode {
    Crosshair,
    Dot,
    Normal,
}

#[derive(Debug, Clone, Copy)]
pub struct Size {
    pub width: f32,
    pub height: f32,
}

#[derive(Debug, Clone, Copy)]
pub struct Point {
    pub x: f32,
    pub y: f32,
}

#[derive(Debug, Clone, Copy)]
pub struct Rect {
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
}

impl Rect {
    /// Right edge helper used throughout layout and render modules.
    pub fn right(self) -> f32 {
        self.x + self.w
    }

    /// Bottom edge helper used throughout layout and render modules.
    pub fn bottom(self) -> f32 {
        self.y + self.h
    }
}

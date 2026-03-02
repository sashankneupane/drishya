//! Neutral plotting schema consumed by chart composition.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum PaneId {
    Price,
    Named(String),
}

#[derive(Debug, Clone)]
pub enum LinePattern {
    Solid,
    Dashed,
    Dotted,
}

#[derive(Debug, Clone)]
pub struct LineStyle {
    pub color: String,
    pub width: f32,
    pub pattern: LinePattern,
}

#[derive(Debug, Clone)]
pub struct BandStyle {
    pub fill_color: String,
}

#[derive(Debug, Clone)]
pub struct HistogramStyle {
    pub positive_color: String,
    pub negative_color: String,
    pub width_factor: f32,
}

#[derive(Debug, Clone)]
pub struct MarkerStyle {
    pub color: String,
    pub size: f32,
}

#[derive(Debug, Clone)]
pub struct MarkerPoint {
    pub index: usize,
    pub value: f64,
}

#[derive(Debug, Clone)]
pub enum PlotPrimitive {
    Line {
        values: Vec<Option<f64>>,
        style: LineStyle,
    },
    Band {
        upper: Vec<Option<f64>>,
        lower: Vec<Option<f64>>,
        style: BandStyle,
    },
    Histogram {
        values: Vec<Option<f64>>,
        base: f64,
        style: HistogramStyle,
    },
    Markers {
        points: Vec<MarkerPoint>,
        style: MarkerStyle,
    },
}

#[derive(Debug, Clone)]
pub struct PlotSeries {
    pub id: String,
    pub name: String,
    pub pane: PaneId,
    pub visible: bool,
    pub primitives: Vec<PlotPrimitive>,
}

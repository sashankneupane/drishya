//! Drawing domain model.
//!
//! These types are serializable candidates later, so they stay simple and
//! explicit rather than embedding behavior.

use serde::{Deserialize, Serialize};

pub type DrawingId = u64;
pub type DrawingLayerId = String;
pub type DrawingGroupId = String;

pub const DEFAULT_DRAWING_LAYER: &str = "drawings";

/// Stroke line style (solid, dotted, dashed).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum StrokeType {
    #[default]
    Solid,
    Dotted,
    Dashed,
}

impl StrokeType {
    pub fn dash_array(&self) -> Option<&[f32]> {
        match self {
            StrokeType::Solid => None,
            StrokeType::Dotted => Some(&[2.0, 2.0]),
            StrokeType::Dashed => Some(&[6.0, 3.0]),
        }
    }
}

/// Per-drawing style and lock metadata (stroke/fill colors, opacity, stroke width, stroke type, locked).
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct DrawingStyle {
    pub stroke_color: Option<String>,
    pub fill_color: Option<String>,
    /// Fill opacity 0.0–1.0; None means 1.0 (opaque).
    #[serde(default)]
    pub fill_opacity: Option<f32>,
    /// Stroke width in pixels; None means default (1.0).
    #[serde(default)]
    pub stroke_width: Option<f32>,
    /// Stroke line style (solid, dotted, dashed); None means solid.
    #[serde(default)]
    pub stroke_type: Option<StrokeType>,
    /// Font size in pixels (for Text drawings); None means default (14.0).
    #[serde(default)]
    pub font_size: Option<f32>,
    pub locked: bool,
}

#[derive(Debug, Clone)]
pub struct HorizontalLine {
    pub id: DrawingId,
    pub price: f64,
    pub layer_id: DrawingLayerId,
    pub group_id: Option<DrawingGroupId>,
    pub style: DrawingStyle,
}

#[derive(Debug, Clone)]
pub struct VerticalLine {
    pub id: DrawingId,
    pub index: f32,
    pub layer_id: DrawingLayerId,
    pub group_id: Option<DrawingGroupId>,
    pub style: DrawingStyle,
}

#[derive(Debug, Clone)]
pub struct Ray {
    pub id: DrawingId,
    pub start_index: f32,
    pub end_index: f32,
    pub start_price: f64,
    pub end_price: f64,
    pub layer_id: DrawingLayerId,
    pub group_id: Option<DrawingGroupId>,
    pub style: DrawingStyle,
}

#[derive(Debug, Clone)]
pub struct Rectangle {
    pub id: DrawingId,
    pub start_index: f32,
    pub end_index: f32,
    pub top_price: f64,
    pub bottom_price: f64,
    pub layer_id: DrawingLayerId,
    pub group_id: Option<DrawingGroupId>,
    pub style: DrawingStyle,
}

#[derive(Debug, Clone)]
pub struct PriceRange {
    pub id: DrawingId,
    pub start_index: f32,
    pub end_index: f32,
    pub top_price: f64,
    pub bottom_price: f64,
    pub layer_id: DrawingLayerId,
    pub group_id: Option<DrawingGroupId>,
    pub style: DrawingStyle,
}

#[derive(Debug, Clone)]
pub struct TimeRange {
    pub id: DrawingId,
    pub start_index: f32,
    pub end_index: f32,
    pub top_price: f64,
    pub bottom_price: f64,
    pub layer_id: DrawingLayerId,
    pub group_id: Option<DrawingGroupId>,
    pub style: DrawingStyle,
}

#[derive(Debug, Clone)]
pub struct DateTimeRange {
    pub id: DrawingId,
    pub start_index: f32,
    pub end_index: f32,
    pub top_price: f64,
    pub bottom_price: f64,
    pub layer_id: DrawingLayerId,
    pub group_id: Option<DrawingGroupId>,
    pub style: DrawingStyle,
}

#[derive(Debug, Clone)]
pub struct LongPosition {
    pub id: DrawingId,
    pub start_index: f32,
    pub end_index: f32,
    pub entry_price: f64,
    pub stop_price: f64,
    pub target_price: f64,
    pub layer_id: DrawingLayerId,
    pub group_id: Option<DrawingGroupId>,
    pub style: DrawingStyle,
}

#[derive(Debug, Clone)]
pub struct ShortPosition {
    pub id: DrawingId,
    pub start_index: f32,
    pub end_index: f32,
    pub entry_price: f64,
    pub stop_price: f64,
    pub target_price: f64,
    pub layer_id: DrawingLayerId,
    pub group_id: Option<DrawingGroupId>,
    pub style: DrawingStyle,
}

#[derive(Debug, Clone)]
pub struct FibRetracement {
    pub id: DrawingId,
    pub start_index: f32,
    pub end_index: f32,
    pub start_price: f64,
    pub end_price: f64,
    pub layer_id: DrawingLayerId,
    pub group_id: Option<DrawingGroupId>,
    pub style: DrawingStyle,
}

#[derive(Debug, Clone)]
pub struct Circle {
    pub id: DrawingId,
    pub center_index: f32,
    pub center_price: f64,
    pub radius_index: f32,
    pub radius_price: f64,
    pub layer_id: DrawingLayerId,
    pub group_id: Option<DrawingGroupId>,
    pub style: DrawingStyle,
}

#[derive(Debug, Clone)]
pub struct Triangle {
    pub id: DrawingId,
    pub p1_index: f32,
    pub p1_price: f64,
    pub p2_index: f32,
    pub p2_price: f64,
    pub p3_index: f32,
    pub p3_price: f64,
    pub layer_id: DrawingLayerId,
    pub group_id: Option<DrawingGroupId>,
    pub style: DrawingStyle,
}

#[derive(Debug, Clone)]
pub struct Ellipse {
    pub id: DrawingId,
    pub p1_index: f32, // first end of diameter 1
    pub p1_price: f64,
    pub p2_index: f32, // second end of diameter 1
    pub p2_price: f64,
    pub p3_index: f32, // point on the perpendicular axis (defines 2nd radius)
    pub p3_price: f64,
    pub layer_id: DrawingLayerId,
    pub group_id: Option<DrawingGroupId>,
    pub style: DrawingStyle,
}

#[derive(Debug, Clone)]
pub struct Text {
    pub id: DrawingId,
    pub index: f32,
    pub price: f64,
    pub text: String,
    pub layer_id: DrawingLayerId,
    pub group_id: Option<DrawingGroupId>,
    pub style: DrawingStyle,
}

#[derive(Debug, Clone)]
pub enum Drawing {
    HorizontalLine(HorizontalLine),
    VerticalLine(VerticalLine),
    Ray(Ray),
    Rectangle(Rectangle),
    PriceRange(PriceRange),
    TimeRange(TimeRange),
    DateTimeRange(DateTimeRange),
    LongPosition(LongPosition),
    ShortPosition(ShortPosition),
    FibRetracement(FibRetracement),
    Circle(Circle),
    Triangle(Triangle),
    Ellipse(Ellipse),
    Text(Text),
}

impl Drawing {
    pub fn id(&self) -> DrawingId {
        match self {
            Drawing::HorizontalLine(item) => item.id,
            Drawing::VerticalLine(item) => item.id,
            Drawing::Ray(item) => item.id,
            Drawing::Rectangle(item) => item.id,
            Drawing::PriceRange(item) => item.id,
            Drawing::TimeRange(item) => item.id,
            Drawing::DateTimeRange(item) => item.id,
            Drawing::LongPosition(item) => item.id,
            Drawing::ShortPosition(item) => item.id,
            Drawing::FibRetracement(item) => item.id,
            Drawing::Circle(item) => item.id,
            Drawing::Triangle(item) => item.id,
            Drawing::Ellipse(item) => item.id,
            Drawing::Text(item) => item.id,
        }
    }

    pub fn layer_id(&self) -> &str {
        match self {
            Drawing::HorizontalLine(item) => item.layer_id.as_str(),
            Drawing::VerticalLine(item) => item.layer_id.as_str(),
            Drawing::Ray(item) => item.layer_id.as_str(),
            Drawing::Rectangle(item) => item.layer_id.as_str(),
            Drawing::PriceRange(item) => item.layer_id.as_str(),
            Drawing::TimeRange(item) => item.layer_id.as_str(),
            Drawing::DateTimeRange(item) => item.layer_id.as_str(),
            Drawing::LongPosition(item) => item.layer_id.as_str(),
            Drawing::ShortPosition(item) => item.layer_id.as_str(),
            Drawing::FibRetracement(item) => item.layer_id.as_str(),
            Drawing::Circle(item) => item.layer_id.as_str(),
            Drawing::Triangle(item) => item.layer_id.as_str(),
            Drawing::Ellipse(item) => item.layer_id.as_str(),
            Drawing::Text(item) => item.layer_id.as_str(),
        }
    }

    pub fn group_id(&self) -> Option<&str> {
        match self {
            Drawing::HorizontalLine(item) => item.group_id.as_deref(),
            Drawing::VerticalLine(item) => item.group_id.as_deref(),
            Drawing::Ray(item) => item.group_id.as_deref(),
            Drawing::Rectangle(item) => item.group_id.as_deref(),
            Drawing::PriceRange(item) => item.group_id.as_deref(),
            Drawing::TimeRange(item) => item.group_id.as_deref(),
            Drawing::DateTimeRange(item) => item.group_id.as_deref(),
            Drawing::LongPosition(item) => item.group_id.as_deref(),
            Drawing::ShortPosition(item) => item.group_id.as_deref(),
            Drawing::FibRetracement(item) => item.group_id.as_deref(),
            Drawing::Circle(item) => item.group_id.as_deref(),
            Drawing::Triangle(item) => item.group_id.as_deref(),
            Drawing::Ellipse(item) => item.group_id.as_deref(),
            Drawing::Text(item) => item.group_id.as_deref(),
        }
    }

    pub fn set_layer_id(&mut self, layer_id: &str) {
        match self {
            Drawing::HorizontalLine(item) => item.layer_id = layer_id.to_string(),
            Drawing::VerticalLine(item) => item.layer_id = layer_id.to_string(),
            Drawing::Ray(item) => item.layer_id = layer_id.to_string(),
            Drawing::Rectangle(item) => item.layer_id = layer_id.to_string(),
            Drawing::PriceRange(item) => item.layer_id = layer_id.to_string(),
            Drawing::TimeRange(item) => item.layer_id = layer_id.to_string(),
            Drawing::DateTimeRange(item) => item.layer_id = layer_id.to_string(),
            Drawing::LongPosition(item) => item.layer_id = layer_id.to_string(),
            Drawing::ShortPosition(item) => item.layer_id = layer_id.to_string(),
            Drawing::FibRetracement(item) => item.layer_id = layer_id.to_string(),
            Drawing::Circle(item) => item.layer_id = layer_id.to_string(),
            Drawing::Triangle(item) => item.layer_id = layer_id.to_string(),
            Drawing::Ellipse(item) => item.layer_id = layer_id.to_string(),
            Drawing::Text(item) => item.layer_id = layer_id.to_string(),
        }
    }

    pub fn set_group_id(&mut self, group_id: Option<&str>) {
        let next = group_id.map(|v| v.to_string());
        match self {
            Drawing::HorizontalLine(item) => item.group_id = next,
            Drawing::VerticalLine(item) => item.group_id = next,
            Drawing::Ray(item) => item.group_id = next,
            Drawing::Rectangle(item) => item.group_id = next,
            Drawing::PriceRange(item) => item.group_id = next,
            Drawing::TimeRange(item) => item.group_id = next,
            Drawing::DateTimeRange(item) => item.group_id = next,
            Drawing::LongPosition(item) => item.group_id = next,
            Drawing::ShortPosition(item) => item.group_id = next,
            Drawing::FibRetracement(item) => item.group_id = next,
            Drawing::Circle(item) => item.group_id = next,
            Drawing::Triangle(item) => item.group_id = next,
            Drawing::Ellipse(item) => item.group_id = next,
            Drawing::Text(item) => item.group_id = next,
        }
    }

    /// Returns true if this drawing type supports fill color customization.
    pub fn supports_fill(&self) -> bool {
        matches!(
            self,
            Drawing::Rectangle(_)
                | Drawing::PriceRange(_)
                | Drawing::TimeRange(_)
                | Drawing::DateTimeRange(_)
                | Drawing::LongPosition(_)
                | Drawing::ShortPosition(_)
                | Drawing::FibRetracement(_)
                | Drawing::Circle(_)
                | Drawing::Triangle(_)
                | Drawing::Ellipse(_)
                | Drawing::Text(_)
        )
    }

    pub fn style(&self) -> &DrawingStyle {
        match self {
            Drawing::HorizontalLine(item) => &item.style,
            Drawing::VerticalLine(item) => &item.style,
            Drawing::Ray(item) => &item.style,
            Drawing::Rectangle(item) => &item.style,
            Drawing::PriceRange(item) => &item.style,
            Drawing::TimeRange(item) => &item.style,
            Drawing::DateTimeRange(item) => &item.style,
            Drawing::LongPosition(item) => &item.style,
            Drawing::ShortPosition(item) => &item.style,
            Drawing::FibRetracement(item) => &item.style,
            Drawing::Circle(item) => &item.style,
            Drawing::Triangle(item) => &item.style,
            Drawing::Ellipse(item) => &item.style,
            Drawing::Text(item) => &item.style,
        }
    }

    pub fn style_mut(&mut self) -> &mut DrawingStyle {
        match self {
            Drawing::HorizontalLine(item) => &mut item.style,
            Drawing::VerticalLine(item) => &mut item.style,
            Drawing::Ray(item) => &mut item.style,
            Drawing::Rectangle(item) => &mut item.style,
            Drawing::PriceRange(item) => &mut item.style,
            Drawing::TimeRange(item) => &mut item.style,
            Drawing::DateTimeRange(item) => &mut item.style,
            Drawing::LongPosition(item) => &mut item.style,
            Drawing::ShortPosition(item) => &mut item.style,
            Drawing::FibRetracement(item) => &mut item.style,
            Drawing::Circle(item) => &mut item.style,
            Drawing::Triangle(item) => &mut item.style,
            Drawing::Ellipse(item) => &mut item.style,
            Drawing::Text(item) => &mut item.style,
        }
    }
}

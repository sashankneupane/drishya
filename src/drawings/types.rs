//! Drawing domain model.
//!
//! These types are serializable candidates later, so they stay simple and
//! explicit rather than embedding behavior.

pub type DrawingId = u64;
pub type DrawingLayerId = String;
pub type DrawingGroupId = String;

pub const DEFAULT_DRAWING_LAYER: &str = "drawings";

#[derive(Debug, Clone)]
pub struct HorizontalLine {
    pub id: DrawingId,
    pub price: f64,
    pub layer_id: DrawingLayerId,
    pub group_id: Option<DrawingGroupId>,
}

#[derive(Debug, Clone)]
pub struct VerticalLine {
    pub id: DrawingId,
    pub index: f32,
    pub layer_id: DrawingLayerId,
    pub group_id: Option<DrawingGroupId>,
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
        }
    }
}

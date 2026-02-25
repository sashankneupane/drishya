//! Drawing domain model.
//!
//! These types are serializable candidates later, so they stay simple and
//! explicit rather than embedding behavior.

pub type DrawingId = u64;

#[derive(Debug, Clone)]
pub struct HorizontalLine {
    pub id: DrawingId,
    pub price: f64,
}

#[derive(Debug, Clone)]
pub struct VerticalLine {
    pub id: DrawingId,
    pub index: f32,
}

#[derive(Debug, Clone)]
pub enum Drawing {
    HorizontalLine(HorizontalLine),
    VerticalLine(VerticalLine),
}

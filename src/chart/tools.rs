//! Native drawing-tool interaction state.

use crate::drawings::hit_test::RectHitTarget;
use crate::types::Point;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DrawingToolMode {
    Select,
    HorizontalLine,
    VerticalLine,
    Ray,
    Rectangle,
    PriceRange,
    TimeRange,
    DateTimeRange,
    FibRetracement,
    LongPosition,
    ShortPosition,
    Triangle,
    Circle,
    Ellipse,
    Text,
    Brush,
    Highlighter,
}

#[derive(Debug, Clone, Default)]
pub(crate) struct DrawingInteractionState {
    pub pending_start: Option<Point>,
    pub pending_points: Vec<Point>,
    pub pointer_down: bool,
    pub dragged: bool,
    pub dragging_drawing_id: Option<u64>,
    pub dragging_resize_target: Option<RectHitTarget>,
    /// When dragging an anchor point of a selected shape, this holds the anchor index.
    pub dragging_anchor_index: Option<usize>,
    pub last_pointer: Option<Point>,
}

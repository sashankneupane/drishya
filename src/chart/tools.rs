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
    FibRetracement,
    LongPosition,
    ShortPosition,
}

#[derive(Debug, Clone, Copy, Default)]
pub(crate) struct DrawingInteractionState {
    pub pending_start: Option<Point>,
    pub pointer_down: bool,
    pub dragged: bool,
    pub dragging_drawing_id: Option<u64>,
    pub dragging_resize_target: Option<RectHitTarget>,
    pub last_pointer: Option<Point>,
}

//! Native drawing-tool interaction state.

use crate::drawings::hit_test::RectHitTarget;
use crate::types::Point;
use crate::types::Rect;

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

pub(crate) const DRAWING_TOOLBAR_WIDTH_PX: f32 = 44.0;
pub(crate) const CHART_TOP_STRIP_HEIGHT_PX: f32 = 30.0;
pub(crate) const CHART_OBJECT_TREE_WIDTH_PX: f32 = 228.0;
pub(crate) const CHART_OBJECT_TREE_MARGIN_PX: f32 = 8.0;
const CHART_OBJECT_TREE_MIN_HEIGHT_PX: f32 = 120.0;
const DRAWING_TOOLBAR_BUTTON_SIZE_PX: f32 = 32.0;
const DRAWING_TOOLBAR_PADDING_TOP_PX: f32 = 8.0;
const DRAWING_TOOLBAR_GAP_PX: f32 = 8.0;
const DRAWING_TOOLBAR_SIDE_INSET_PX: f32 = 6.0;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TopStripAction {
    Source,
    Timeframe,
    Fx,
    Layout,
}

pub(crate) const DRAWING_TOOLBAR_MODES: [DrawingToolMode; 8] = [
    DrawingToolMode::Select,
    DrawingToolMode::HorizontalLine,
    DrawingToolMode::VerticalLine,
    DrawingToolMode::Ray,
    DrawingToolMode::Rectangle,
    DrawingToolMode::FibRetracement,
    DrawingToolMode::LongPosition,
    DrawingToolMode::ShortPosition,
];

#[derive(Debug, Clone, Copy, Default)]
pub(crate) struct DrawingInteractionState {
    pub pending_start: Option<Point>,
    pub pointer_down: bool,
    pub dragged: bool,
    pub dragging_drawing_id: Option<u64>,
    pub dragging_resize_target: Option<RectHitTarget>,
    pub last_pointer: Option<Point>,
}

impl crate::chart::Chart {
    pub fn set_top_strip_labels(&mut self, source: &str, timeframe: &str) {
        let source = source.trim();
        let timeframe = timeframe.trim();

        self.top_strip_source_label = if source.is_empty() {
            "OHLCV".to_string()
        } else {
            source.to_string()
        };

        self.top_strip_timeframe_label = if timeframe.is_empty() {
            "TF".to_string()
        } else {
            timeframe.to_string()
        };
    }

    pub(crate) fn top_strip_source_label(&self) -> &str {
        &self.top_strip_source_label
    }

    pub(crate) fn top_strip_timeframe_label(&self) -> &str {
        &self.top_strip_timeframe_label
    }

    pub(crate) fn drawing_toolbar_rect(&self) -> Rect {
        Rect {
            x: 0.0,
            y: 0.0,
            w: DRAWING_TOOLBAR_WIDTH_PX,
            h: self.size.height.max(1.0),
        }
    }

    pub(crate) fn point_in_drawing_toolbar(&self, x: f32, y: f32) -> bool {
        let rect = self.drawing_toolbar_rect();
        x >= rect.x && x <= rect.right() && y >= rect.y && y <= rect.bottom()
    }

    pub(crate) fn drawing_toolbar_button_rect(&self, index: usize) -> Rect {
        let button_size = DRAWING_TOOLBAR_BUTTON_SIZE_PX;
        let y =
            DRAWING_TOOLBAR_PADDING_TOP_PX + index as f32 * (button_size + DRAWING_TOOLBAR_GAP_PX);

        Rect {
            x: DRAWING_TOOLBAR_SIDE_INSET_PX,
            y,
            w: DRAWING_TOOLBAR_WIDTH_PX - DRAWING_TOOLBAR_SIDE_INSET_PX * 2.0,
            h: button_size,
        }
    }

    pub(crate) fn drawing_toolbar_mode_at(&self, x: f32, y: f32) -> Option<DrawingToolMode> {
        if !self.point_in_drawing_toolbar(x, y) {
            return None;
        }

        for (idx, mode) in DRAWING_TOOLBAR_MODES.iter().enumerate() {
            let button = self.drawing_toolbar_button_rect(idx);
            if x >= button.x && x <= button.right() && y >= button.y && y <= button.bottom() {
                return Some(*mode);
            }
        }

        None
    }

    pub(crate) fn chart_top_strip_rect(&self) -> Rect {
        let layout = self.current_layout();
        let plot = layout.plot;
        let x = self.drawing_toolbar_rect().right().max(plot.x);

        Rect {
            x,
            y: plot.y,
            w: (plot.right() - x).max(1.0),
            h: CHART_TOP_STRIP_HEIGHT_PX.min(plot.h.max(1.0)),
        }
    }

    pub(crate) fn point_in_chart_top_strip(&self, x: f32, y: f32) -> bool {
        let rect = self.chart_top_strip_rect();
        x >= rect.x && x <= rect.right() && y >= rect.y && y <= rect.bottom()
    }

    pub(crate) fn top_strip_action_at(&self, x: f32, y: f32) -> Option<TopStripAction> {
        if !self.point_in_chart_top_strip(x, y) {
            return None;
        }

        let (source_rect, tf_rect, fx_rect, layout_rect) = self.chart_top_strip_button_rects();

        if contains(source_rect, x, y) {
            return Some(TopStripAction::Source);
        }
        if contains(tf_rect, x, y) {
            return Some(TopStripAction::Timeframe);
        }
        if contains(fx_rect, x, y) {
            return Some(TopStripAction::Fx);
        }
        if contains(layout_rect, x, y) {
            return Some(TopStripAction::Layout);
        }

        None
    }

    pub(crate) fn chart_top_strip_button_rects(&self) -> (Rect, Rect, Rect, Rect) {
        let strip = self.chart_top_strip_rect();
        let row_y = strip.y;
        let item_h = strip.h.max(18.0);

        let source_rect = Rect {
            x: strip.x,
            y: row_y,
            w: 150.0,
            h: item_h,
        };
        let tf_rect = Rect {
            x: source_rect.right(),
            y: row_y,
            w: 70.0,
            h: item_h,
        };
        let fx_rect = Rect {
            x: tf_rect.right(),
            y: row_y,
            w: 52.0,
            h: item_h,
        };
        let layout_rect = Rect {
            x: (strip.right() - 110.0).max(fx_rect.right()),
            y: row_y,
            w: 110.0,
            h: item_h,
        };

        (source_rect, tf_rect, fx_rect, layout_rect)
    }

    pub(crate) fn chart_object_tree_rect(&self) -> Rect {
        let layout = self.current_layout();
        let top = self.chart_top_strip_rect().bottom() + CHART_OBJECT_TREE_MARGIN_PX;
        let x = layout.full.right() + CHART_OBJECT_TREE_MARGIN_PX;
        let available_h = (self.size.height - top - CHART_OBJECT_TREE_MARGIN_PX).max(0.0);
        let available_w = (self.size.width - x - CHART_OBJECT_TREE_MARGIN_PX).max(1.0);

        Rect {
            x,
            y: top,
            w: CHART_OBJECT_TREE_WIDTH_PX.min(available_w),
            h: available_h
                .max(CHART_OBJECT_TREE_MIN_HEIGHT_PX)
                .min(self.size.height.max(1.0)),
        }
    }

    pub(crate) fn point_in_chart_object_tree(&self, x: f32, y: f32) -> bool {
        let rect = self.chart_object_tree_rect();
        x >= rect.x && x <= rect.right() && y >= rect.y && y <= rect.bottom()
    }
}

fn contains(rect: Rect, x: f32, y: f32) -> bool {
    x >= rect.x && x <= rect.right() && y >= rect.y && y <= rect.bottom()
}

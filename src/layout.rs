//! Layout geometry for chart panes and axes.
//!
//! All pane rectangles are derived in one place so rendering modules can rely
//! on consistent coordinates.

use crate::types::{Rect, Size};

#[derive(Debug, Clone, Copy)]
pub struct ChartLayout {
    pub full: Rect,
    pub plot: Rect,
    pub price_pane: Rect,
    pub volume_pane: Rect,
    pub y_axis: Rect,
    pub x_axis: Rect,
}

pub fn compute_layout(size: Size) -> ChartLayout {
    let full = Rect { x: 0.0, y: 0.0, w: size.width, h: size.height };

    // Fixed axis sizes keep labels stable while data density changes.
    let y_axis_w = 72.0;
    let x_axis_h = 24.0;
    let gap = 4.0;
    let volume_ratio = 0.22;

    let plot = Rect {
        x: 0.0,
        y: 0.0,
        w: size.width - y_axis_w,
        h: size.height - x_axis_h,
    };

    // Enforce a minimum volume pane so it remains readable on short canvases.
    let volume_h = (plot.h * volume_ratio).max(60.0);
    let price_h = plot.h - volume_h - gap;

    let price_pane = Rect { x: plot.x, y: plot.y, w: plot.w, h: price_h };
    let volume_pane = Rect { x: plot.x, y: plot.y + price_h + gap, w: plot.w, h: volume_h };

    let y_axis = Rect { x: plot.right(), y: 0.0, w: y_axis_w, h: plot.h };
    let x_axis = Rect { x: 0.0, y: plot.bottom(), w: size.width, h: x_axis_h };

    ChartLayout {
        full,
        plot,
        price_pane,
        volume_pane,
        y_axis,
        x_axis,
    }
}

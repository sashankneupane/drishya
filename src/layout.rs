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
    pub indicator_pane: Option<Rect>,
    pub y_axis: Rect,
    pub x_axis: Rect,
}

pub fn compute_layout(size: Size, has_indicator_pane: bool) -> ChartLayout {
    let full = Rect {
        x: 0.0,
        y: 0.0,
        w: size.width,
        h: size.height,
    };

    // Fixed axis sizes keep labels stable while data density changes.
    let y_axis_w = 72.0;
    let x_axis_h = 24.0;
    let gap = 4.0;
    let indicator_ratio = 0.24;

    let plot = Rect {
        x: 0.0,
        y: 0.0,
        w: size.width - y_axis_w,
        h: size.height - x_axis_h,
    };

    let (price_pane, indicator_pane) = if has_indicator_pane {
        // Keep a meaningful lower pane size for RSI/MACD-style charts.
        let indicator_h = (plot.h * indicator_ratio).clamp(90.0, plot.h * 0.45);
        let price_h = (plot.h - indicator_h - gap).max(80.0);

        (
            Rect {
                x: plot.x,
                y: plot.y,
                w: plot.w,
                h: price_h,
            },
            Some(Rect {
                x: plot.x,
                y: plot.y + price_h + gap,
                w: plot.w,
                h: indicator_h,
            }),
        )
    } else {
        (plot, None)
    };

    let y_axis = Rect {
        x: plot.right(),
        y: 0.0,
        w: y_axis_w,
        h: plot.h,
    };
    let x_axis = Rect {
        x: 0.0,
        y: plot.bottom(),
        w: size.width,
        h: x_axis_h,
    };

    ChartLayout {
        full,
        plot,
        price_pane,
        indicator_pane,
        y_axis,
        x_axis,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn layout_without_indicator_pane_uses_single_plot_area() {
        let size = Size {
            width: 1200.0,
            height: 800.0,
        };
        let layout = compute_layout(size, false);

        assert!(layout.indicator_pane.is_none());
        assert_eq!(layout.price_pane.x, layout.plot.x);
        assert_eq!(layout.price_pane.y, layout.plot.y);
        assert_eq!(layout.price_pane.w, layout.plot.w);
        assert_eq!(layout.price_pane.h, layout.plot.h);
    }

    #[test]
    fn layout_with_indicator_pane_places_it_below_price_pane() {
        let size = Size {
            width: 1200.0,
            height: 800.0,
        };
        let layout = compute_layout(size, true);

        let indicator = layout.indicator_pane.expect("expected indicator pane");

        assert!(layout.price_pane.bottom() < indicator.y);
        assert_eq!(layout.price_pane.x, indicator.x);
        assert_eq!(layout.price_pane.w, indicator.w);
        assert!(layout.price_pane.h > 0.0);
        assert!(indicator.h >= 90.0);
    }
}

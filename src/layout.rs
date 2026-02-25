//! Layout geometry for chart panes and axes.
//!
//! All pane rectangles are derived in one place so rendering modules can rely
//! on consistent coordinates.

use crate::plots::model::PaneId;
use crate::types::{Rect, Size};

#[derive(Debug, Clone, Copy)]
pub enum PaneHeightPolicy {
    FixedPx(f32),
    Ratio(f32),
    Auto,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AxisVisibilityPolicy {
    Visible,
    Hidden,
}

#[derive(Debug, Clone)]
pub struct PaneDescriptor {
    pub id: PaneId,
    pub height: PaneHeightPolicy,
    pub y_axis: AxisVisibilityPolicy,
}

#[derive(Debug, Clone)]
pub struct PaneLayout {
    pub id: PaneId,
    pub rect: Rect,
    pub y_axis: AxisVisibilityPolicy,
}

#[derive(Debug, Clone)]
pub struct ChartLayout {
    pub full: Rect,
    pub plot: Rect,
    pub panes: Vec<PaneLayout>,
    pub y_axis: Rect,
    pub x_axis: Rect,
}

impl ChartLayout {
    pub fn pane_by_id(&self, pane_id: &PaneId) -> Option<&PaneLayout> {
        self.panes.iter().find(|pane| &pane.id == pane_id)
    }

    pub fn price_pane(&self) -> Option<Rect> {
        self.pane_by_id(&PaneId::Price).map(|pane| pane.rect)
    }

    pub fn plot_bottom(&self) -> f32 {
        self.panes
            .last()
            .map(|pane| pane.rect.bottom())
            .unwrap_or(self.plot.bottom())
    }
}

pub fn compute_layout(size: Size, pane_specs: &[PaneDescriptor]) -> ChartLayout {
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

    let plot = Rect {
        x: 0.0,
        y: 0.0,
        w: size.width - y_axis_w,
        h: size.height - x_axis_h,
    };

    let pane_specs = if pane_specs.is_empty() {
        vec![PaneDescriptor {
            id: PaneId::Price,
            height: PaneHeightPolicy::Auto,
            y_axis: AxisVisibilityPolicy::Visible,
        }]
    } else {
        pane_specs.to_vec()
    };

    let pane_count = pane_specs.len() as f32;
    let total_gap = gap * (pane_count - 1.0).max(0.0);
    let available_h = (plot.h - total_gap).max(1.0);

    let mut fixed_total = 0.0f32;
    let mut ratio_total = 0.0f32;

    for pane in &pane_specs {
        match pane.height {
            PaneHeightPolicy::FixedPx(px) => fixed_total += px.max(0.0),
            PaneHeightPolicy::Ratio(ratio) => ratio_total += ratio.max(0.0),
            PaneHeightPolicy::Auto => {}
        }
    }

    let remaining_after_fixed = (available_h - fixed_total).max(1.0);
    let mut assigned_heights = vec![0.0f32; pane_specs.len()];

    for (idx, pane) in pane_specs.iter().enumerate() {
        assigned_heights[idx] = match pane.height {
            PaneHeightPolicy::FixedPx(px) => px.max(0.0),
            PaneHeightPolicy::Ratio(ratio) if ratio_total > 0.0 => {
                remaining_after_fixed * (ratio.max(0.0) / ratio_total)
            }
            PaneHeightPolicy::Ratio(_) => 0.0,
            PaneHeightPolicy::Auto => 0.0,
        };
    }

    let assigned_sum: f32 = assigned_heights.iter().sum();
    let auto_count = pane_specs
        .iter()
        .filter(|pane| matches!(pane.height, PaneHeightPolicy::Auto))
        .count();
    let auto_share = if auto_count > 0 {
        ((available_h - assigned_sum).max(1.0)) / auto_count as f32
    } else {
        0.0
    };

    for (idx, pane) in pane_specs.iter().enumerate() {
        if matches!(pane.height, PaneHeightPolicy::Auto) {
            assigned_heights[idx] = auto_share;
        }
    }

    let mut cursor_y = plot.y;
    let mut panes = Vec::with_capacity(pane_specs.len());
    for (idx, pane) in pane_specs.iter().enumerate() {
        let is_last = idx + 1 == pane_specs.len();
        let mut h = assigned_heights[idx].max(1.0);
        if is_last {
            h = (plot.bottom() - cursor_y).max(1.0);
        }

        panes.push(PaneLayout {
            id: pane.id.clone(),
            rect: Rect {
                x: plot.x,
                y: cursor_y,
                w: plot.w,
                h,
            },
            y_axis: pane.y_axis,
        });

        cursor_y += h + gap;
    }

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
        panes,
        y_axis,
        x_axis,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn layout_single_auto_pane_uses_full_plot_area() {
        let size = Size {
            width: 1200.0,
            height: 800.0,
        };
        let layout = compute_layout(
            size,
            &[PaneDescriptor {
                id: PaneId::Price,
                height: PaneHeightPolicy::Auto,
                y_axis: AxisVisibilityPolicy::Visible,
            }],
        );

        assert_eq!(layout.panes.len(), 1);
        let pane = &layout.panes[0];
        assert_eq!(pane.rect.x, layout.plot.x);
        assert_eq!(pane.rect.y, layout.plot.y);
        assert_eq!(pane.rect.w, layout.plot.w);
        assert_eq!(pane.rect.h, layout.plot.h);
    }

    #[test]
    fn layout_with_multiple_ratio_panes_is_stacked() {
        let size = Size {
            width: 1200.0,
            height: 800.0,
        };
        let layout = compute_layout(
            size,
            &[
                PaneDescriptor {
                    id: PaneId::Price,
                    height: PaneHeightPolicy::Ratio(3.0),
                    y_axis: AxisVisibilityPolicy::Visible,
                },
                PaneDescriptor {
                    id: PaneId::Named("rsi".to_string()),
                    height: PaneHeightPolicy::Ratio(1.0),
                    y_axis: AxisVisibilityPolicy::Visible,
                },
                PaneDescriptor {
                    id: PaneId::Named("momentum".to_string()),
                    height: PaneHeightPolicy::Ratio(1.0),
                    y_axis: AxisVisibilityPolicy::Visible,
                },
            ],
        );

        assert_eq!(layout.panes.len(), 3);
        assert!(layout.panes[0].rect.bottom() < layout.panes[1].rect.y);
        assert!(layout.panes[1].rect.bottom() < layout.panes[2].rect.y);
        assert_eq!(layout.panes[0].rect.x, layout.panes[2].rect.x);
        assert_eq!(layout.panes[0].rect.w, layout.panes[2].rect.w);
        assert!(layout.panes[0].rect.h > layout.panes[1].rect.h);
    }
}

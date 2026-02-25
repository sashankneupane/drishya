//! Scene composition for the chart.
//!
//! This file is intentionally the only place where chart state is translated
//! into `DrawCommand`s. The Canvas/Web layer should paint commands, not make
//! charting decisions.

use crate::{
    drawings::render::{build_drawing_commands, build_preview_drawing_commands},
    drawings::types::Drawing,
    layout::ChartLayout,
    plots::{
        model::{PaneId, PlotPrimitive, PlotSeries},
        render::{build_plot_draw_commands, PlotRenderContext, ValueScaleRange},
    },
    render::{
        axes::build_axis_commands,
        candles::build_candle_commands,
        primitives::DrawCommand,
        styles::{ColorToken, FillStyle, StrokeStyle, TextAlign, TextStyle},
        volume::build_volume_commands,
    },
    scale::{PriceScale, TimeScale},
    types::{Candle, Point},
};
use std::collections::HashSet;

use super::tools::DRAWING_TOOLBAR_MODES;
use super::Chart;

impl Chart {
    pub(crate) fn compute_visible_bounds(&self, visible: &[Candle]) -> (f64, f64, f64) {
        let mut min_price = f64::INFINITY;
        let mut max_price = f64::NEG_INFINITY;
        let mut max_vol = 0.0f64;

        for c in visible {
            min_price = min_price.min(c.low);
            max_price = max_price.max(c.high);
            max_vol = max_vol.max(c.volume);
        }

        // Price padding gives candles breathing room at the pane edges.
        let pad = ((max_price - min_price) * 0.05).max(1e-6);
        (min_price - pad, max_price + pad, max_vol)
    }

    pub fn build_draw_commands(&self) -> Vec<DrawCommand> {
        let mut out = Vec::new();
        if self.candles.is_empty() {
            return out;
        }

        let (visible_start, visible_end) = match self.viewport {
            Some(vp) => vp.visible_range(self.candles.len()),
            None => (0, self.candles.len()),
        };
        let visible = &self.candles[visible_start..visible_end];

        let plot_series = self.collect_plot_series();

        let layout: ChartLayout = self.current_layout();
        let price_pane = layout.price_pane().unwrap_or(layout.plot);
        let (min_price, max_price, max_vol) = if visible.is_empty() {
            self.compute_visible_bounds(&self.candles)
        } else {
            self.compute_visible_bounds(visible)
        };
        let (min_price, max_price) = apply_y_zoom(
            min_price,
            max_price,
            self.pane_y_zoom_factor(&PaneId::Price),
            self.pane_y_pan_factor(&PaneId::Price),
        );

        // Price and volume share the same pane and horizontal scale.
        let ts_price = match self.viewport {
            Some(vp) => TimeScale {
                pane: price_pane,
                world_start_x: vp.world_start_x(),
                world_end_x: vp.world_end_x(),
            },
            None => TimeScale {
                pane: price_pane,
                world_start_x: 0.0,
                world_end_x: self.candles.len() as f64,
            },
        };
        let ps = PriceScale {
            pane: price_pane,
            min: min_price,
            max: max_price,
        };

        let mut pane_scales: Vec<(PaneId, PriceScale)> = vec![(PaneId::Price, ps)];
        for pane in &layout.panes {
            if matches!(pane.id, PaneId::Price) {
                continue;
            }

            if let Some((min_v, max_v)) =
                compute_pane_value_bounds(&plot_series, &pane.id, visible_start, visible_end)
            {
                let (min_v, max_v) = apply_y_zoom(
                    min_v,
                    max_v,
                    self.pane_y_zoom_factor(&pane.id),
                    self.pane_y_pan_factor(&pane.id),
                );
                pane_scales.push((
                    pane.id.clone(),
                    PriceScale {
                        pane: pane.rect,
                        min: min_v,
                        max: max_v,
                    },
                ));
            }
        }

        // Background
        out.push(DrawCommand::Rect {
            rect: layout.full,
            fill: Some(FillStyle::token(ColorToken::CanvasBg)),
            stroke: None,
        });

        // Core chart primitives
        out.extend(build_axis_commands(
            &layout,
            visible,
            visible_start,
            ts_price,
            &pane_scales,
        ));
        out.push(DrawCommand::PushClip { rect: price_pane });
        out.extend(build_volume_commands(
            visible,
            visible_start,
            ts_price,
            price_pane,
            max_vol,
        ));
        out.extend(build_candle_commands(visible, visible_start, ts_price, ps));
        out.push(DrawCommand::PopClip);

        let price_range = ValueScaleRange {
            min: min_price,
            max: max_price,
        };

        for (pane_id, pane_scale) in &pane_scales {
            let value_range = if matches!(pane_id, PaneId::Price) {
                price_range
            } else {
                ValueScaleRange {
                    min: pane_scale.min,
                    max: pane_scale.max,
                }
            };

            out.push(DrawCommand::PushClip {
                rect: pane_scale.pane,
            });
            out.extend(build_plot_draw_commands(
                &plot_series,
                PlotRenderContext {
                    visible_start,
                    visible_end,
                    target_pane: pane_id.clone(),
                    pane_scale: *pane_scale,
                    time_scale: ts_price,
                    value_range,
                },
            ));
            out.push(DrawCommand::PopClip);
        }

        // User drawings are painted last so they stay visually on top.
        out.extend(build_drawing_commands(
            &self.drawings,
            layout.clone(),
            ps,
            self.viewport,
        ));

        if let Some(preview) = self.active_drawing_preview() {
            out.extend(build_preview_drawing_commands(
                &preview,
                layout.clone(),
                ps,
                self.viewport,
            ));
        }

        if let Some(crosshair) = self.crosshair {
            out.push(DrawCommand::PushClip { rect: layout.plot });
            out.extend(build_dotted_vertical(
                crosshair.x,
                layout.plot.y,
                layout.plot_bottom(),
                1.0,
                ColorToken::Crosshair,
            ));
            out.extend(build_dotted_horizontal(
                crosshair.y,
                layout.plot.x,
                layout.plot.right(),
                1.0,
                ColorToken::Crosshair,
            ));
            out.push(DrawCommand::PopClip);
        }

        out.extend(self.build_drawing_toolbar_commands());
        out.extend(self.build_chart_top_strip_commands());
        out.extend(self.build_object_tree_commands(
            &layout,
            &plot_series,
            visible_start,
            visible_end,
        ));

        out
    }

    fn build_drawing_toolbar_commands(&self) -> Vec<DrawCommand> {
        let mut out = Vec::new();
        let strip = self.drawing_toolbar_rect();

        out.push(DrawCommand::Rect {
            rect: strip,
            fill: Some(FillStyle::token(ColorToken::CanvasBg)),
            stroke: Some(StrokeStyle::token(ColorToken::PaneBorder, 1.0)),
        });

        for (idx, mode) in DRAWING_TOOLBAR_MODES.iter().enumerate() {
            let button = self.drawing_toolbar_button_rect(idx);
            let is_active = *mode == self.drawing_tool_mode();

            let fill = if is_active {
                FillStyle::token(ColorToken::GridLine)
            } else {
                FillStyle::token(ColorToken::CanvasBg)
            };
            let stroke = if is_active {
                StrokeStyle::token(ColorToken::DrawingSecondaryText, 1.0)
            } else {
                StrokeStyle::token(ColorToken::PaneBorder, 1.0)
            };
            let text_color = if is_active {
                ColorToken::DrawingSecondaryText
            } else {
                ColorToken::AxisText
            };

            out.push(DrawCommand::Rect {
                rect: button,
                fill: Some(fill),
                stroke: Some(stroke),
            });
            out.extend(build_tool_icon_commands(*mode, button, text_color));
        }

        if let Some(last_mode) = DRAWING_TOOLBAR_MODES.last() {
            let bottom_of_tools = self
                .drawing_toolbar_button_rect(
                    DRAWING_TOOLBAR_MODES
                        .iter()
                        .position(|m| m == last_mode)
                        .unwrap_or(0),
                )
                .bottom();

            let sep_y = bottom_of_tools + 10.0;
            out.push(DrawCommand::Line {
                from: Point {
                    x: strip.x + 8.0,
                    y: sep_y,
                },
                to: Point {
                    x: strip.right() - 8.0,
                    y: sep_y,
                },
                stroke: StrokeStyle::token(ColorToken::PaneBorder, 1.0),
            });

            for idx in 0..2 {
                let util = crate::types::Rect {
                    x: strip.x + 6.0,
                    y: sep_y + 10.0 + idx as f32 * 40.0,
                    w: strip.w - 12.0,
                    h: 30.0,
                };
                out.push(DrawCommand::Rect {
                    rect: util,
                    fill: Some(FillStyle::token(ColorToken::CanvasBg)),
                    stroke: Some(StrokeStyle::token(ColorToken::PaneBorder, 1.0)),
                });
                out.push(DrawCommand::Line {
                    from: Point {
                        x: util.x + 8.0,
                        y: util.y + util.h * 0.5,
                    },
                    to: Point {
                        x: util.right() - 8.0,
                        y: util.y + util.h * 0.5,
                    },
                    stroke: StrokeStyle::token(ColorToken::AxisText, 1.0),
                });
            }
        }

        out
    }

    fn build_chart_top_strip_commands(&self) -> Vec<DrawCommand> {
        let mut out = Vec::new();
        let strip = self.chart_top_strip_rect();

        out.push(DrawCommand::Rect {
            rect: strip,
            fill: Some(FillStyle::token(ColorToken::CanvasBg)),
            stroke: Some(StrokeStyle::token(ColorToken::PaneBorder, 1.0)),
        });

        let (source_rect, tf_rect, fx_rect, layout_rect) = self.chart_top_strip_button_rects();

        out.push(DrawCommand::Rect {
            rect: source_rect,
            fill: Some(FillStyle::token(ColorToken::GridLine)),
            stroke: Some(StrokeStyle::token(ColorToken::PaneBorder, 1.0)),
        });
        out.push(DrawCommand::Text {
            pos: Point {
                x: source_rect.x + source_rect.w * 0.5,
                y: source_rect.y + source_rect.h * 0.5 + 4.0,
            },
            text: format!("{} ▾", self.top_strip_source_label()),
            style: TextStyle::token(ColorToken::AxisText, 10.0, TextAlign::Center),
        });

        out.push(DrawCommand::Rect {
            rect: tf_rect,
            fill: Some(FillStyle::token(ColorToken::GridLine)),
            stroke: Some(StrokeStyle::token(ColorToken::PaneBorder, 1.0)),
        });
        out.push(DrawCommand::Text {
            pos: Point {
                x: tf_rect.x + tf_rect.w * 0.5,
                y: tf_rect.y + tf_rect.h * 0.5 + 4.0,
            },
            text: format!("{} ▾", self.top_strip_timeframe_label()),
            style: TextStyle::token(ColorToken::AxisText, 10.0, TextAlign::Center),
        });

        out.push(DrawCommand::Rect {
            rect: fx_rect,
            fill: Some(FillStyle::token(ColorToken::GridLine)),
            stroke: Some(StrokeStyle::token(ColorToken::PaneBorder, 1.0)),
        });
        out.push(DrawCommand::Text {
            pos: Point {
                x: fx_rect.x + fx_rect.w * 0.5,
                y: fx_rect.y + fx_rect.h * 0.5 + 4.0,
            },
            text: "f_x".to_string(),
            style: TextStyle::token(ColorToken::AxisText, 10.0, TextAlign::Center),
        });

        out.push(DrawCommand::Rect {
            rect: layout_rect,
            fill: Some(FillStyle::token(ColorToken::GridLine)),
            stroke: Some(StrokeStyle::token(ColorToken::PaneBorder, 1.0)),
        });
        out.push(DrawCommand::Text {
            pos: Point {
                x: layout_rect.x + layout_rect.w * 0.5,
                y: layout_rect.y + layout_rect.h * 0.5 + 4.0,
            },
            text: "Layout ▾".to_string(),
            style: TextStyle::token(ColorToken::AxisText, 10.0, TextAlign::Center),
        });

        out
    }

    fn build_object_tree_commands(
        &self,
        layout: &ChartLayout,
        plot_series: &[PlotSeries],
        visible_start: usize,
        visible_end: usize,
    ) -> Vec<DrawCommand> {
        let mut out = Vec::new();
        let panel = self.chart_object_tree_rect();

        out.push(DrawCommand::Rect {
            rect: panel,
            fill: Some(FillStyle::token(ColorToken::CanvasBg)),
            stroke: Some(StrokeStyle::token(ColorToken::PaneBorder, 1.0)),
        });

        let rows = self.object_tree_rows(layout, plot_series, visible_start, visible_end);

        out.push(DrawCommand::PushClip { rect: panel });
        let mut y = panel.y + 20.0;
        for row in rows {
            if y > panel.bottom() - 8.0 {
                break;
            }

            let color = if row.header {
                ColorToken::DrawingSecondaryText
            } else {
                ColorToken::AxisText
            };

            if row.header {
                out.push(DrawCommand::Rect {
                    rect: crate::types::Rect {
                        x: panel.x + 6.0,
                        y: y - 12.0,
                        w: panel.w - 12.0,
                        h: 16.0,
                    },
                    fill: Some(FillStyle::token(ColorToken::GridLine)),
                    stroke: None,
                });
            }

            out.push(DrawCommand::Text {
                pos: Point {
                    x: panel.x + 12.0 + row.indent as f32 * 10.0,
                    y,
                },
                text: row.label,
                style: TextStyle::token(color, 11.0, TextAlign::Left),
            });

            let (eye_rect, del_rect) = object_tree_action_rects(panel, y);

            if let Some(visible) = row.toggle_visible {
                out.push(DrawCommand::Rect {
                    rect: eye_rect,
                    fill: Some(FillStyle::token(ColorToken::CanvasBg)),
                    stroke: Some(StrokeStyle::token(ColorToken::PaneBorder, 1.0)),
                });
                out.extend(build_object_tree_eye_icon(
                    eye_rect,
                    visible,
                    ColorToken::AxisText,
                ));
            }

            if row.can_delete {
                out.push(DrawCommand::Rect {
                    rect: del_rect,
                    fill: Some(FillStyle::token(ColorToken::CanvasBg)),
                    stroke: Some(StrokeStyle::token(ColorToken::PaneBorder, 1.0)),
                });
                out.extend(build_object_tree_delete_icon(
                    del_rect,
                    ColorToken::AxisText,
                ));
            }
            y += 16.0;
        }
        out.push(DrawCommand::PopClip);

        out
    }

    fn object_tree_rows(
        &self,
        _layout: &ChartLayout,
        plot_series: &[PlotSeries],
        visible_start: usize,
        visible_end: usize,
    ) -> Vec<ObjectTreeRow> {
        let mut rows: Vec<ObjectTreeRow> = Vec::new();
        rows.push(ObjectTreeRow::header("Object Tree"));
        rows.push(ObjectTreeRow::label(format!(
            "Candles: {}",
            self.candles.len()
        )));
        rows.push(ObjectTreeRow::label(format!(
            "Visible: {}..{}",
            visible_start, visible_end
        )));
        rows.push(ObjectTreeRow::header("Data"));

        for pane_key in self.object_tree_pane_keys() {
            if pane_key == "price" {
                rows.push(ObjectTreeRow::label_with_indent(
                    "pane: price".to_string(),
                    1,
                ));
            } else {
                let visible = !self.hidden_panes.contains(&pane_key);
                rows.push(ObjectTreeRow::pane(
                    format!("pane: {}", pane_key),
                    pane_key,
                    1,
                    visible,
                ));
            }
        }

        for series in plot_series.iter().take(8) {
            let visible = self.is_series_visible(&series.id);
            rows.push(ObjectTreeRow::series(
                format!("series: {} [{}]", series.name, pane_label(&series.pane)),
                series.id.clone(),
                1,
                visible,
            ));
        }
        if plot_series.len() > 8 {
            rows.push(ObjectTreeRow::label_with_indent(
                format!("… +{} more", plot_series.len() - 8),
                1,
            ));
        }

        rows.push(ObjectTreeRow::header("Drawings"));
        if self.drawings.items().is_empty() {
            rows.push(ObjectTreeRow::label_with_indent("(none)".to_string(), 1));
        } else {
            for drawing in self.drawings.items() {
                let visible = self.drawings.is_drawing_visible(drawing.id());
                rows.push(ObjectTreeRow::drawing(
                    format!("{} #{}", drawing_label(drawing), drawing.id()),
                    drawing.id(),
                    1,
                    visible,
                ));
            }
        }

        rows.push(ObjectTreeRow::header("Mode"));
        rows.push(ObjectTreeRow::label_with_indent(
            tool_mode_label(self.drawing_tool_mode()).to_string(),
            1,
        ));

        rows
    }

    pub(crate) fn handle_object_tree_click(&mut self, x: f32, y: f32) -> bool {
        if !self.point_in_chart_object_tree(x, y) {
            return false;
        }

        let layout = self.current_layout();
        let plot_series = self.collect_plot_series();
        let (visible_start, visible_end) = match self.viewport {
            Some(vp) => vp.visible_range(self.candles.len()),
            None => (0, self.candles.len()),
        };
        let rows = self.object_tree_rows(&layout, &plot_series, visible_start, visible_end);
        let panel = self.chart_object_tree_rect();

        let mut row_y = panel.y + 20.0;
        for row in rows {
            if row_y > panel.bottom() - 6.0 {
                break;
            }

            let (eye_rect, del_rect) = object_tree_action_rects(panel, row_y);

            if row.toggle_visible.is_some() && point_in_rect(x, y, eye_rect) {
                match row.action {
                    Some(ObjectTreeAction::Pane(ref pane_id)) => {
                        let next = self.hidden_panes.contains(pane_id);
                        self.set_pane_visibility(pane_id, next);
                    }
                    Some(ObjectTreeAction::Drawing(id)) => {
                        let next = !self.is_drawing_visible(id);
                        let _ = self.set_drawing_visible(id, next);
                    }
                    Some(ObjectTreeAction::Series(ref series_id)) => {
                        let next = !self.is_series_visible(series_id);
                        self.set_series_visibility(series_id, next);
                    }
                    _ => {}
                }
                return true;
            }

            if row.can_delete && point_in_rect(x, y, del_rect) {
                match row.action {
                    Some(ObjectTreeAction::Pane(ref pane_id)) => {
                        self.set_pane_visibility(pane_id, false);
                    }
                    Some(ObjectTreeAction::Drawing(id)) => {
                        let _ = self.remove_drawing(id);
                    }
                    Some(ObjectTreeAction::Series(ref series_id)) => {
                        self.delete_series(series_id);
                    }
                    _ => {}
                }
                return true;
            }

            row_y += 16.0;
        }

        true
    }
}

impl Chart {
    fn object_tree_pane_keys(&self) -> Vec<String> {
        let mut out = Vec::new();
        out.push("price".to_string());

        let registry: HashSet<String> = self.pane_registry.iter().cloned().collect();
        let mut added: HashSet<String> = HashSet::new();

        for pane in &self.pane_order {
            if pane == "price" || !registry.contains(pane) || added.contains(pane) {
                continue;
            }
            out.push(pane.clone());
            added.insert(pane.clone());
        }

        for pane in &self.pane_registry {
            if pane == "price" || added.contains(pane) {
                continue;
            }
            out.push(pane.clone());
            added.insert(pane.clone());
        }

        out
    }
}

#[derive(Clone)]
struct ObjectTreeRow {
    label: String,
    indent: u8,
    header: bool,
    action: Option<ObjectTreeAction>,
    toggle_visible: Option<bool>,
    can_delete: bool,
}

impl ObjectTreeRow {
    fn header(label: &str) -> Self {
        Self {
            label: label.to_string(),
            indent: 0,
            header: true,
            action: None,
            toggle_visible: None,
            can_delete: false,
        }
    }

    fn label(label: String) -> Self {
        Self {
            label,
            indent: 0,
            header: false,
            action: None,
            toggle_visible: None,
            can_delete: false,
        }
    }

    fn label_with_indent(label: String, indent: u8) -> Self {
        Self {
            label,
            indent,
            header: false,
            action: None,
            toggle_visible: None,
            can_delete: false,
        }
    }

    fn pane(label: String, pane_id: String, indent: u8, visible: bool) -> Self {
        Self {
            label,
            indent,
            header: false,
            action: Some(ObjectTreeAction::Pane(pane_id)),
            toggle_visible: Some(visible),
            can_delete: true,
        }
    }

    fn drawing(label: String, drawing_id: u64, indent: u8, visible: bool) -> Self {
        Self {
            label,
            indent,
            header: false,
            action: Some(ObjectTreeAction::Drawing(drawing_id)),
            toggle_visible: Some(visible),
            can_delete: true,
        }
    }

    fn series(label: String, series_id: String, indent: u8, visible: bool) -> Self {
        Self {
            label,
            indent,
            header: false,
            action: Some(ObjectTreeAction::Series(series_id)),
            toggle_visible: Some(visible),
            can_delete: true,
        }
    }
}

#[derive(Clone)]
enum ObjectTreeAction {
    Pane(String),
    Drawing(u64),
    Series(String),
}

fn object_tree_action_rects(
    panel: crate::types::Rect,
    row_y: f32,
) -> (crate::types::Rect, crate::types::Rect) {
    (
        crate::types::Rect {
            x: panel.right() - 52.0,
            y: row_y - 11.0,
            w: 20.0,
            h: 14.0,
        },
        crate::types::Rect {
            x: panel.right() - 26.0,
            y: row_y - 11.0,
            w: 20.0,
            h: 14.0,
        },
    )
}

fn build_object_tree_eye_icon(
    rect: crate::types::Rect,
    visible: bool,
    color: ColorToken,
) -> Vec<DrawCommand> {
    let cx = rect.x + rect.w * 0.5;
    let cy = rect.y + rect.h * 0.5;
    let rx = rect.w * 0.30;
    let ry = rect.h * 0.24;
    let mut out = Vec::new();

    let stroke = StrokeStyle::token(color, 1.0);
    out.push(DrawCommand::Line {
        from: Point { x: cx - rx, y: cy },
        to: Point { x: cx, y: cy - ry },
        stroke: stroke.clone(),
    });
    out.push(DrawCommand::Line {
        from: Point { x: cx, y: cy - ry },
        to: Point { x: cx + rx, y: cy },
        stroke: stroke.clone(),
    });
    out.push(DrawCommand::Line {
        from: Point { x: cx + rx, y: cy },
        to: Point { x: cx, y: cy + ry },
        stroke: stroke.clone(),
    });
    out.push(DrawCommand::Line {
        from: Point { x: cx, y: cy + ry },
        to: Point { x: cx - rx, y: cy },
        stroke: stroke.clone(),
    });

    if visible {
        out.push(DrawCommand::Rect {
            rect: crate::types::Rect {
                x: cx - rect.w * 0.07,
                y: cy - rect.h * 0.10,
                w: rect.w * 0.14,
                h: rect.h * 0.20,
            },
            fill: Some(FillStyle::token(color)),
            stroke: None,
        });
    } else {
        out.push(DrawCommand::Line {
            from: Point {
                x: rect.x + rect.w * 0.22,
                y: rect.y + rect.h * 0.78,
            },
            to: Point {
                x: rect.x + rect.w * 0.78,
                y: rect.y + rect.h * 0.22,
            },
            stroke: StrokeStyle::token(color, 1.1),
        });
    }

    out
}

fn build_object_tree_delete_icon(rect: crate::types::Rect, color: ColorToken) -> Vec<DrawCommand> {
    let mut out = Vec::new();
    let stroke = StrokeStyle::token(color, 1.0);
    let body = crate::types::Rect {
        x: rect.x + rect.w * 0.28,
        y: rect.y + rect.h * 0.34,
        w: rect.w * 0.44,
        h: rect.h * 0.44,
    };

    out.push(DrawCommand::Rect {
        rect: body,
        fill: None,
        stroke: Some(stroke.clone()),
    });

    out.push(DrawCommand::Line {
        from: Point {
            x: rect.x + rect.w * 0.24,
            y: rect.y + rect.h * 0.30,
        },
        to: Point {
            x: rect.x + rect.w * 0.76,
            y: rect.y + rect.h * 0.30,
        },
        stroke: stroke.clone(),
    });

    out.push(DrawCommand::Line {
        from: Point {
            x: rect.x + rect.w * 0.40,
            y: rect.y + rect.h * 0.22,
        },
        to: Point {
            x: rect.x + rect.w * 0.60,
            y: rect.y + rect.h * 0.22,
        },
        stroke,
    });

    out
}

fn point_in_rect(x: f32, y: f32, rect: crate::types::Rect) -> bool {
    x >= rect.x && x <= rect.right() && y >= rect.y && y <= rect.bottom()
}

fn pane_label(pane_id: &PaneId) -> String {
    match pane_id {
        PaneId::Price => "price".to_string(),
        PaneId::Named(name) => name.clone(),
    }
}

fn drawing_label(drawing: &Drawing) -> &'static str {
    match drawing {
        Drawing::HorizontalLine(_) => "hline",
        Drawing::VerticalLine(_) => "vline",
        Drawing::Ray(_) => "ray",
        Drawing::Rectangle(_) => "rectangle",
        Drawing::LongPosition(_) => "long",
        Drawing::ShortPosition(_) => "short",
        Drawing::FibRetracement(_) => "fib",
    }
}

fn tool_mode_label(mode: crate::chart::tools::DrawingToolMode) -> &'static str {
    match mode {
        crate::chart::tools::DrawingToolMode::Select => "select",
        crate::chart::tools::DrawingToolMode::HorizontalLine => "hline",
        crate::chart::tools::DrawingToolMode::VerticalLine => "vline",
        crate::chart::tools::DrawingToolMode::Ray => "ray",
        crate::chart::tools::DrawingToolMode::Rectangle => "rectangle",
        crate::chart::tools::DrawingToolMode::FibRetracement => "fib",
        crate::chart::tools::DrawingToolMode::LongPosition => "long",
        crate::chart::tools::DrawingToolMode::ShortPosition => "short",
    }
}

fn build_tool_icon_commands(
    mode: crate::chart::tools::DrawingToolMode,
    rect: crate::types::Rect,
    color: ColorToken,
) -> Vec<DrawCommand> {
    let mut out = Vec::new();
    let stroke = StrokeStyle::token(color, 1.15);
    let cx = rect.x + rect.w * 0.5;
    let cy = rect.y + rect.h * 0.5;
    let size = rect.w.min(rect.h) * 0.34;

    match mode {
        crate::chart::tools::DrawingToolMode::Select => {
            out.push(DrawCommand::Polygon {
                points: vec![
                    Point {
                        x: cx - size * 0.65,
                        y: cy - size * 0.95,
                    },
                    Point {
                        x: cx - size * 0.55,
                        y: cy + size * 0.95,
                    },
                    Point {
                        x: cx + size * 0.6,
                        y: cy + size * 0.05,
                    },
                ],
                fill: Some(FillStyle::token(color)),
                stroke: None,
            });
        }
        crate::chart::tools::DrawingToolMode::HorizontalLine => {
            out.push(DrawCommand::Line {
                from: Point {
                    x: cx - size,
                    y: cy,
                },
                to: Point {
                    x: cx + size,
                    y: cy,
                },
                stroke,
            });
        }
        crate::chart::tools::DrawingToolMode::VerticalLine => {
            out.push(DrawCommand::Line {
                from: Point {
                    x: cx,
                    y: cy - size,
                },
                to: Point {
                    x: cx,
                    y: cy + size,
                },
                stroke,
            });
        }
        crate::chart::tools::DrawingToolMode::Ray => {
            out.push(DrawCommand::Line {
                from: Point {
                    x: cx - size * 0.9,
                    y: cy + size * 0.5,
                },
                to: Point {
                    x: cx + size * 0.95,
                    y: cy - size * 0.45,
                },
                stroke,
            });
            out.push(DrawCommand::Polygon {
                points: vec![
                    Point {
                        x: cx + size * 0.95,
                        y: cy - size * 0.45,
                    },
                    Point {
                        x: cx + size * 0.55,
                        y: cy - size * 0.45,
                    },
                    Point {
                        x: cx + size * 0.95,
                        y: cy - size * 0.05,
                    },
                ],
                fill: Some(FillStyle::token(color)),
                stroke: None,
            });
        }
        crate::chart::tools::DrawingToolMode::Rectangle => {
            out.push(DrawCommand::Rect {
                rect: crate::types::Rect {
                    x: cx - size * 0.9,
                    y: cy - size * 0.6,
                    w: size * 1.8,
                    h: size * 1.2,
                },
                fill: None,
                stroke: Some(stroke),
            });
        }
        crate::chart::tools::DrawingToolMode::FibRetracement => {
            out.push(DrawCommand::Line {
                from: Point {
                    x: cx - size,
                    y: cy - size * 0.65,
                },
                to: Point {
                    x: cx + size,
                    y: cy + size * 0.65,
                },
                stroke: StrokeStyle::token(color, 1.0),
            });
            for step in [-0.55f32, -0.05, 0.45] {
                let y = cy + step * size;
                out.push(DrawCommand::Line {
                    from: Point { x: cx - size, y },
                    to: Point { x: cx + size, y },
                    stroke: StrokeStyle::token(color, 1.0),
                });
            }
        }
        crate::chart::tools::DrawingToolMode::LongPosition => {
            out.push(DrawCommand::Line {
                from: Point {
                    x: cx,
                    y: cy + size,
                },
                to: Point {
                    x: cx,
                    y: cy - size,
                },
                stroke,
            });
            out.push(DrawCommand::Polygon {
                points: vec![
                    Point {
                        x: cx,
                        y: cy - size * 1.05,
                    },
                    Point {
                        x: cx - size * 0.45,
                        y: cy - size * 0.45,
                    },
                    Point {
                        x: cx + size * 0.45,
                        y: cy - size * 0.45,
                    },
                ],
                fill: Some(FillStyle::token(color)),
                stroke: None,
            });
        }
        crate::chart::tools::DrawingToolMode::ShortPosition => {
            out.push(DrawCommand::Line {
                from: Point {
                    x: cx,
                    y: cy - size,
                },
                to: Point {
                    x: cx,
                    y: cy + size,
                },
                stroke,
            });
            out.push(DrawCommand::Polygon {
                points: vec![
                    Point {
                        x: cx,
                        y: cy + size * 1.05,
                    },
                    Point {
                        x: cx - size * 0.45,
                        y: cy + size * 0.45,
                    },
                    Point {
                        x: cx + size * 0.45,
                        y: cy + size * 0.45,
                    },
                ],
                fill: Some(FillStyle::token(color)),
                stroke: None,
            });
        }
    }

    out
}

fn build_dotted_vertical(
    x: f32,
    y_top: f32,
    y_bottom: f32,
    width: f32,
    color: ColorToken,
) -> Vec<DrawCommand> {
    build_dotted_line(
        Point { x, y: y_top },
        Point { x, y: y_bottom },
        width,
        color,
    )
}

fn build_dotted_horizontal(
    y: f32,
    x_left: f32,
    x_right: f32,
    width: f32,
    color: ColorToken,
) -> Vec<DrawCommand> {
    build_dotted_line(
        Point { x: x_left, y },
        Point { x: x_right, y },
        width,
        color,
    )
}

fn build_dotted_line(from: Point, to: Point, width: f32, color: ColorToken) -> Vec<DrawCommand> {
    let dx = to.x - from.x;
    let dy = to.y - from.y;
    let len = (dx * dx + dy * dy).sqrt();
    if len <= 0.5 {
        return Vec::new();
    }

    let dot = 4.0f32;
    let gap = 4.0f32;
    let step = dot + gap;
    let ux = dx / len;
    let uy = dy / len;

    let mut out = Vec::new();
    let mut t = 0.0f32;
    while t < len {
        let seg_end = (t + dot).min(len);
        out.push(DrawCommand::Line {
            from: Point {
                x: from.x + ux * t,
                y: from.y + uy * t,
            },
            to: Point {
                x: from.x + ux * seg_end,
                y: from.y + uy * seg_end,
            },
            stroke: StrokeStyle::token(color, width),
        });
        t += step;
    }

    out
}

fn apply_y_zoom(min: f64, max: f64, zoom_factor: f32, pan_factor: f32) -> (f64, f64) {
    let span = (max - min).abs().max(1e-9);
    let zoomed_span = span * zoom_factor.max(0.01) as f64;
    let center = (max + min) * 0.5 + pan_factor as f64 * zoomed_span;
    let half = zoomed_span * 0.5;
    (center - half, center + half)
}

fn compute_pane_value_bounds(
    series: &[PlotSeries],
    pane: &PaneId,
    visible_start: usize,
    visible_end: usize,
) -> Option<(f64, f64)> {
    let mut min_v = f64::INFINITY;
    let mut max_v = f64::NEG_INFINITY;

    for s in series {
        if &s.pane != pane || !s.visible {
            continue;
        }

        for primitive in &s.primitives {
            match primitive {
                PlotPrimitive::Line { values, .. } | PlotPrimitive::Histogram { values, .. } => {
                    for idx in visible_start..visible_end {
                        if let Some(v) = values.get(idx).and_then(|v| *v) {
                            min_v = min_v.min(v);
                            max_v = max_v.max(v);
                        }
                    }
                }
                PlotPrimitive::Band { upper, lower, .. } => {
                    for idx in visible_start..visible_end {
                        if let Some(v) = upper.get(idx).and_then(|v| *v) {
                            min_v = min_v.min(v);
                            max_v = max_v.max(v);
                        }
                        if let Some(v) = lower.get(idx).and_then(|v| *v) {
                            min_v = min_v.min(v);
                            max_v = max_v.max(v);
                        }
                    }
                }
                PlotPrimitive::Markers { points, .. } => {
                    for p in points {
                        if (visible_start..visible_end).contains(&p.index) {
                            min_v = min_v.min(p.value);
                            max_v = max_v.max(p.value);
                        }
                    }
                }
            }
        }
    }

    if !min_v.is_finite() || !max_v.is_finite() {
        None
    } else {
        let pad = ((max_v - min_v) * 0.08).max(1e-6);
        Some((min_v - pad, max_v + pad))
    }
}

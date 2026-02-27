//! Scene composition for the chart.
//!
//! This file is intentionally the only place where chart state is translated
//! into `DrawCommand`s. The Canvas/Web layer should paint commands, not make
//! charting decisions.

pub mod build;
pub mod crosshair;
pub mod helpers;
pub mod panes;
pub mod readouts;
#[cfg(test)]
mod tests;

use crate::{
    drawings::render::{build_drawing_commands, build_preview_drawing_commands},
    layout::ChartLayout,
    plots::{
        model::{LinePattern, PaneId, PlotPrimitive, PlotSeries},
        render::{build_plot_draw_commands, PlotRenderContext, ValueScaleRange},
    },
    render::{
        axes::build_axis_commands,
        candles::build_candle_commands,
        primitives::DrawCommand,
        styles::{ColorRef, ColorToken, FillStyle, StrokeStyle, TextAlign, TextStyle},
        ticks::{
            HumanTimeFormatter, PercentFormatter, PriceFormatter, TimeLabelFormatter,
            ValueLabelFormatter,
        },
        volume::build_volume_commands,
    },
    scale::{PriceScale, TimeScale},
    types::{Candle, CursorMode, Point},
};

use self::helpers::{
    compute_pane_value_bounds, nearest_candle_index, series_value_at_index, timestamp_for_world_x,
    world_x_at_pixel,
};
use super::compare_alignment::{
    align_compare_series, normalize_aligned_series, rebase_normalized_series_to_primary_price,
};
use super::events::replay_cursor_commands;
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

        let pad = ((max_price - min_price) * 0.05).max(1e-6);
        (min_price - pad, max_price + pad, max_vol)
    }

    pub fn build_draw_commands(&self) -> Vec<DrawCommand> {
        let mut out = Vec::new();
        let _layout: ChartLayout = self.current_layout(); // Moved up for `ts` and `baseline_price` calculation
                                                          // Calculate percent baseline if needed.
        let mut baseline_price = None;
        if self.price_axis_mode == crate::scale::PriceAxisMode::Percent {
            match self.percent_baseline_policy {
                crate::scale::PercentBaselinePolicy::FirstVisibleBar => {
                    if let Some(candle) = self.visible_data().first() {
                        baseline_price = Some(candle.close);
                    }
                }
            }
        }
        *self.derived_percent_baseline_price.borrow_mut() = baseline_price;
        if self.candles.is_empty() {
            return out;
        }

        let (raw_visible_start, raw_visible_end) = match self.viewport {
            Some(vp) => vp.visible_range(self.candles.len()),
            None => (0, self.candles.len()),
        };
        let replay_end = self.replay_visible_end(self.candles.len());
        let visible_end = raw_visible_end.min(replay_end);
        let visible_start = raw_visible_start.min(visible_end);
        let visible = &self.candles[visible_start..visible_end];

        let mut plot_series = self.collect_plot_series();
        let compare_series = self.collect_compare_series(visible_start);
        plot_series.extend(compare_series);
        if let Some(selected_series_id) = self.selected_series_id() {
            for s in &mut plot_series {
                if s.id != selected_series_id {
                    continue;
                }
                for primitive in &mut s.primitives {
                    match primitive {
                        PlotPrimitive::Line { style, .. } => {
                            style.width = (style.width + 1.0).max(2.0);
                        }
                        PlotPrimitive::Markers { style, .. } => {
                            style.size = (style.size + 1.0).max(3.0);
                        }
                        PlotPrimitive::Band { .. } | PlotPrimitive::Histogram { .. } => {}
                    }
                }
            }
        }

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
            self.price_axis_mode,
            self.derived_percent_baseline_price(),
        );

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
            mode: self.price_axis_mode,
            baseline: self.derived_percent_baseline_price(),
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
                    crate::scale::PriceAxisMode::Linear,
                    None,
                );
                pane_scales.push((
                    pane.id.clone(),
                    PriceScale {
                        pane: pane.rect,
                        min: min_v,
                        max: max_v,
                        mode: if pane.id == PaneId::Price {
                            self.price_axis_mode
                        } else {
                            crate::scale::PriceAxisMode::Linear
                        },
                        baseline: if pane.id == PaneId::Price {
                            self.derived_percent_baseline_price()
                        } else {
                            None
                        },
                    },
                ));
            }
        }

        let cfg = self.appearance_config();
        out.push(DrawCommand::Rect {
            rect: layout.full,
            fill: Some(FillStyle::css(cfg.background.clone())),
            stroke: None,
        });

        out.extend(build_axis_commands(
            &layout,
            visible,
            visible_start,
            ts_price,
            &pane_scales,
        ));

        let bull = ColorRef::Css(cfg.candle_up.clone());
        let bear = ColorRef::Css(cfg.candle_down.clone());
        out.push(DrawCommand::PushClip { rect: price_pane });
        out.extend(build_volume_commands(
            visible,
            visible_start,
            ts_price,
            price_pane,
            max_vol,
            bull.clone(),
            bear.clone(),
        ));
        out.extend(build_candle_commands(
            visible,
            visible_start,
            ts_price,
            ps,
            self.candle_body_style(),
            bull,
            bear,
        ));
        out.push(DrawCommand::PopClip);

        if let Some(last) = replay_end
            .checked_sub(1)
            .and_then(|idx| self.candles.get(idx))
        {
            let live_y = ps.y_for_price(last.close);
            if live_y >= price_pane.y && live_y <= price_pane.bottom() {
                let prev_close = self
                    .candles
                    .iter()
                    .take(replay_end)
                    .rev()
                    .nth(1)
                    .map(|c| c.close)
                    .unwrap_or(last.open);
                let live_color = if last.close >= prev_close {
                    ColorToken::Bull
                } else {
                    ColorToken::Bear
                };
                out.push(DrawCommand::PushClip { rect: price_pane });
                out.extend(build_dotted_horizontal(
                    live_y,
                    price_pane.x,
                    price_pane.right(),
                    1.0,
                    live_color,
                ));
                out.push(DrawCommand::PopClip);
                out.push(DrawCommand::Rect {
                    rect: crate::types::Rect {
                        x: layout.y_axis.x + 1.0,
                        y: (live_y - 8.0).clamp(layout.y_axis.y, layout.y_axis.bottom() - 16.0),
                        w: layout.y_axis.w - 2.0,
                        h: 16.0,
                    },
                    fill: Some(FillStyle::token(ColorToken::PaneBorder)),
                    stroke: None,
                });
                out.push(DrawCommand::Text {
                    pos: Point {
                        x: layout.y_axis.right() - 4.0,
                        y: (live_y + 4.0)
                            .clamp(layout.y_axis.y + 12.0, layout.y_axis.bottom() - 2.0),
                    },
                    text: format_axis_value_label(
                        last.close,
                        self.price_axis_mode,
                        self.derived_percent_baseline_price(),
                    ),
                    style: TextStyle::token(live_color, 11.0, TextAlign::Right),
                });
            }
        }

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

        out.extend(build_drawing_commands(
            &self.drawings,
            layout.clone(),
            ps,
            self.viewport,
            &self.candles,
            self.selected_drawing_id(),
            Some(self.appearance_config()),
        ));

        if let Some(preview) = self.active_drawing_preview() {
            out.extend(build_preview_drawing_commands(
                &preview,
                layout.clone(),
                ps,
                self.viewport,
            ));
        }

        // Drop-point dots: pending construction clicks + selected vertex handles
        out.extend(self.build_anchor_commands());
        out.extend(self.build_event_marker_commands(&layout));
        out.extend(replay_cursor_commands(self, &layout));

        let mut crosshair_index: Option<usize> = None;
        if let Some(crosshair) = self.crosshair {
            out.push(DrawCommand::PushClip { rect: layout.plot });

            match self.cursor_mode {
                CursorMode::Crosshair => {
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
                }
                CursorMode::Dot => {
                    out.push(DrawCommand::Rect {
                        rect: crate::types::Rect {
                            x: crosshair.x - 2.0,
                            y: crosshair.y - 2.0,
                            w: 4.0,
                            h: 4.0,
                        },
                        fill: Some(FillStyle::token(ColorToken::Crosshair)),
                        stroke: None,
                    });
                }
                CursorMode::Normal => {
                    // Lines are omitted in Normal mode, labels remain.
                }
            }
            out.push(DrawCommand::PopClip);

            if let Some(idx) = nearest_candle_index(crosshair.x, ts_price, visible_end) {
                crosshair_index = Some(idx);
                if let Some(readout) = build_crosshair_readout_commands(
                    &self.candles,
                    idx,
                    crosshair,
                    &layout,
                    ps,
                    ts_price,
                    self.readout_source_label(),
                ) {
                    out.extend(readout);
                }
            }
        }

        let fallback_index = visible_end
            .checked_sub(1)
            .or_else(|| replay_end.checked_sub(1));
        let readout_index = crosshair_index.or(fallback_index);

        if crosshair_index.is_none() {
            if let Some(idx) = readout_index {
                if let Some(close_readout) = build_last_close_readout_commands(
                    &self.candles,
                    idx,
                    &layout,
                    self.readout_source_label(),
                ) {
                    out.extend(close_readout);
                }
            }
        }

        if let Some(idx) = readout_index {
            out.extend(build_compare_readout_commands(
                &plot_series,
                &layout,
                idx,
                self.candles.get(visible_start).map(|c| c.close),
            ));
            out.extend(build_non_price_pane_readout_commands(
                &plot_series,
                &layout,
                idx,
            ));
        }

        out
    }

    /// Returns caret bounds for the selected Text drawing when not locked, for inline edit mode.
    /// Returns (x, y, height, color) in layout pixels, or None.
    pub fn selected_text_caret_bounds(&self) -> Option<(f32, f32, f32, String)> {
        use crate::drawings::types::Drawing;

        let id = self.selected_drawing_id()?;
        let drawing = self.drawings.drawing(id)?;
        let Drawing::Text(t) = drawing else {
            return None;
        };
        if t.style.locked {
            return None;
        }

        let layout = self.current_layout();
        let price_pane = layout.price_pane()?;
        let vp = self.viewport?;

        let visible = self.visible_data();
        if visible.is_empty() {
            return None;
        }
        let (min_price, max_price, _) = self.compute_visible_bounds(visible);
        let (min_price, max_price) = apply_y_zoom(
            min_price,
            max_price,
            self.pane_y_zoom_factor(&PaneId::Price),
            self.pane_y_pan_factor(&PaneId::Price),
            self.price_axis_mode,
            self.derived_percent_baseline_price(),
        );
        let ps = crate::scale::PriceScale {
            pane: price_pane,
            min: min_price,
            max: max_price,
            mode: self.price_axis_mode,
            baseline: self.derived_percent_baseline_price(),
        };

        let x = vp.world_x_to_pixel_x(t.index, price_pane.x, price_pane.w);
        let y = ps.y_for_price(t.price);
        let size = t.style.font_size.unwrap_or(14.0);
        let text_width = (t.text.chars().count() as f32 * size * 0.6).max(0.0);
        let caret_x = x + 4.0 + text_width;
        let caret_y = y - size * 0.5;
        let color = t
            .style
            .stroke_color
            .as_deref()
            .unwrap_or("#e5e7eb")
            .to_string();

        Some((caret_x, caret_y, size, color))
    }

    pub(crate) fn collect_compare_series(&self, visible_start: usize) -> Vec<PlotSeries> {
        let registry = self.compare_registry();
        if registry.series.is_empty() {
            return Vec::new();
        }

        let mut aligned = align_compare_series(&self.candles, &registry.series);

        // Multi-symbol compare always implies percentage normalization relative
        // to the first visible bar in multi-symbol overlay charts.
        normalize_aligned_series(&mut aligned, visible_start);
        if let Some(primary_basis) = self.candles.get(visible_start).map(|c| c.close) {
            rebase_normalized_series_to_primary_price(&mut aligned, primary_basis);
        }

        aligned
            .into_iter()
            .zip(&registry.series)
            .map(|(a, s)| PlotSeries {
                id: s.id.clone(),
                name: s.name.clone(),
                pane: PaneId::Price,
                visible: s.visible,
                primitives: vec![PlotPrimitive::Line {
                    values: a.values,
                    style: crate::plots::model::LineStyle {
                        color: s.color.clone(),
                        width: 1.5,
                        pattern: LinePattern::Solid,
                    },
                }],
            })
            .collect()
    }
}

fn build_compare_readout_commands(
    series: &[PlotSeries],
    layout: &ChartLayout,
    index: usize,
    primary_basis: Option<f64>,
) -> Vec<DrawCommand> {
    let mut out = Vec::new();
    let registry_prefix = "compare-";

    let mut lines: Vec<String> = Vec::new();
    let mut colors: Vec<String> = Vec::new();

    for s in series {
        if !s.visible || s.pane != PaneId::Price || !s.id.starts_with(registry_prefix) {
            continue;
        }

        if let Some(value) = series_value_at_index(s, index) {
            if let Some(basis) = primary_basis.filter(|b| b.abs() > 1e-9) {
                let pct = ((value / basis) - 1.0) * 100.0;
                lines.push(format!("{}: {:.2}%", s.name, pct));
            } else {
                lines.push(format!("{}: {:.2}", s.name, value));
            }
            // Extract color from first primitive
            if let Some(PlotPrimitive::Line { style, .. }) = s.primitives.first() {
                colors.push(style.color.clone());
            } else {
                colors.push("#ffffff".to_string());
            }
        }
    }

    for (i, (text, color)) in lines.into_iter().zip(colors).enumerate() {
        out.push(DrawCommand::Text {
            pos: Point {
                x: layout.plot.x + 8.0,
                y: layout.plot.y + 28.0 + i as f32 * 12.0,
            },
            text,
            style: TextStyle::css(color, 11.0, TextAlign::Left),
        });
    }

    out
}

fn build_last_close_readout_commands(
    candles: &[Candle],
    index: usize,
    layout: &ChartLayout,
    source_label: &str,
) -> Option<Vec<DrawCommand>> {
    let candle = candles.get(index)?;
    let prefix = if source_label.is_empty() {
        String::new()
    } else {
        format!("{source_label}  ")
    };
    Some(vec![DrawCommand::Text {
        pos: Point {
            x: layout.plot.x + 8.0,
            y: layout.plot.y + 14.0,
        },
        text: format!(
            "{}O {:.2}  H {:.2}  L {:.2}  C {:.2}  V {:.0}",
            prefix, candle.open, candle.high, candle.low, candle.close, candle.volume
        ),
        style: TextStyle::token(ColorToken::AxisText, 11.0, TextAlign::Left),
    }])
}

fn build_crosshair_readout_commands(
    candles: &[Candle],
    index: usize,
    crosshair: Point,
    layout: &ChartLayout,
    ps: PriceScale,
    ts: TimeScale,
    source_label: &str,
) -> Option<Vec<DrawCommand>> {
    if candles.is_empty() {
        return None;
    }

    if crosshair.x < layout.plot.x
        || crosshair.x > layout.plot.right()
        || crosshair.y < layout.plot.y
        || crosshair.y > layout.plot_bottom()
    {
        return None;
    }

    let candle = candles.get(index)?;

    let mut out = Vec::new();

    let ohlcv = if source_label.is_empty() {
        format!(
            "O {:.2}  H {:.2}  L {:.2}  C {:.2}  V {:.0}",
            candle.open, candle.high, candle.low, candle.close, candle.volume
        )
    } else {
        format!(
            "{}  O {:.2}  H {:.2}  L {:.2}  C {:.2}  V {:.0}",
            source_label, candle.open, candle.high, candle.low, candle.close, candle.volume
        )
    };
    out.push(DrawCommand::Text {
        pos: Point {
            x: layout.plot.x + 8.0,
            y: layout.plot.y + 14.0,
        },
        text: ohlcv,
        style: TextStyle::token(ColorToken::AxisText, 11.0, TextAlign::Left),
    });

    let price_at_cursor = ps.price_for_y(crosshair.y);
    let price_label_h = 16.0f32;
    let price_label_y = (crosshair.y - price_label_h * 0.5)
        .clamp(layout.y_axis.y, layout.y_axis.bottom() - price_label_h);
    out.push(DrawCommand::Rect {
        rect: crate::types::Rect {
            x: layout.y_axis.x + 1.0,
            y: price_label_y,
            w: layout.y_axis.w - 2.0,
            h: price_label_h,
        },
        fill: Some(FillStyle::token(ColorToken::PaneBorder)),
        stroke: None,
    });
    out.push(DrawCommand::Text {
        pos: Point {
            x: layout.y_axis.right() - 4.0,
            y: price_label_y + 12.0,
        },
        text: format_axis_value_label(price_at_cursor, ps.mode, ps.baseline),
        style: TextStyle::token(ColorToken::AxisText, 11.0, TextAlign::Right),
    });

    let time_formatter = HumanTimeFormatter;
    let label_ts = world_x_at_pixel(crosshair.x, ts)
        .and_then(|world_x| timestamp_for_world_x(world_x, candles))
        .unwrap_or(candle.ts);
    let ts_text = time_formatter.format_time(label_ts);
    let x_label_w = 84.0f32;
    let x_label_h = 16.0f32;
    let x_label_x =
        (crosshair.x - x_label_w * 0.5).clamp(layout.x_axis.x, layout.x_axis.right() - x_label_w);
    out.push(DrawCommand::Rect {
        rect: crate::types::Rect {
            x: x_label_x,
            y: layout.x_axis.y + 2.0,
            w: x_label_w,
            h: x_label_h,
        },
        fill: Some(FillStyle::token(ColorToken::PaneBorder)),
        stroke: None,
    });
    out.push(DrawCommand::Text {
        pos: Point {
            x: x_label_x + x_label_w * 0.5,
            y: layout.x_axis.y + 13.0,
        },
        text: ts_text,
        style: TextStyle::token(ColorToken::AxisText, 10.0, TextAlign::Center),
    });

    Some(out)
}

fn format_axis_value_label(
    value: f64,
    mode: crate::scale::PriceAxisMode,
    baseline: Option<f64>,
) -> String {
    match mode {
        crate::scale::PriceAxisMode::Percent => {
            let base = baseline.unwrap_or(1.0).max(1e-9);
            let pct = ((value / base) - 1.0) * 100.0;
            PercentFormatter { decimals: 2 }.format_value(pct)
        }
        _ => PriceFormatter { decimals: 2 }.format_value(value),
    }
}

fn build_non_price_pane_readout_commands(
    series: &[PlotSeries],
    layout: &ChartLayout,
    index: usize,
) -> Vec<DrawCommand> {
    let mut out = Vec::new();

    for pane in &layout.panes {
        if matches!(pane.id, PaneId::Price) {
            continue;
        }

        let mut lines: Vec<String> = Vec::new();
        for s in series {
            if !s.visible || s.pane != pane.id {
                continue;
            }

            if let Some(value) = series_value_at_index(s, index) {
                lines.push(format!("{}: {:.2}", s.name, value));
            }
        }

        if lines.is_empty() {
            continue;
        }

        out.push(DrawCommand::PushClip { rect: pane.rect });
        for (i, text) in lines.into_iter().enumerate() {
            out.push(DrawCommand::Text {
                pos: Point {
                    x: pane.rect.x + 6.0,
                    y: pane.rect.y + 14.0 + i as f32 * 12.0,
                },
                text,
                style: TextStyle::token(ColorToken::AxisText, 10.0, TextAlign::Left),
            });
        }
        out.push(DrawCommand::PopClip);
    }

    out
}

fn build_dotted_vertical(
    x: f32,
    y_start: f32,
    y_end: f32,
    width: f32,
    color: ColorToken,
) -> Vec<DrawCommand> {
    build_dotted_line(Point { x, y: y_start }, Point { x, y: y_end }, width, color)
}

fn build_dotted_horizontal(
    y: f32,
    x_start: f32,
    x_end: f32,
    width: f32,
    color: ColorToken,
) -> Vec<DrawCommand> {
    build_dotted_line(Point { x: x_start, y }, Point { x: x_end, y }, width, color)
}

fn build_dotted_line(from: Point, to: Point, width: f32, color: ColorToken) -> Vec<DrawCommand> {
    let dx = to.x - from.x;
    let dy = to.y - from.y;
    let len = (dx * dx + dy * dy).sqrt();
    if len <= 0.0 {
        return Vec::new();
    }

    let dash = 4.0f32;
    let gap = 3.0f32;
    let step = dash + gap;
    let ux = dx / len;
    let uy = dy / len;

    let mut out = Vec::new();
    let mut t = 0.0f32;
    while t < len {
        let s = t;
        let e = (t + dash).min(len);

        let p0 = Point {
            x: from.x + ux * s,
            y: from.y + uy * s,
        };
        let p1 = Point {
            x: from.x + ux * e,
            y: from.y + uy * e,
        };

        out.push(DrawCommand::Line {
            from: p0,
            to: p1,
            stroke: StrokeStyle::token(color, width),
        });

        t += step;
    }

    out
}

fn apply_y_zoom(
    min: f64,
    max: f64,
    zoom_factor: f32,
    pan_factor: f32,
    mode: crate::scale::PriceAxisMode,
    baseline: Option<f64>,
) -> (f64, f64) {
    crate::scale::apply_axis_zoom_pan(min, max, zoom_factor, pan_factor, mode, baseline)
}

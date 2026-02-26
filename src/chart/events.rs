use crate::{
    events::ChartEvent,
    layout::ChartLayout,
    render::{
        primitives::DrawCommand,
        styles::{ColorToken, FillStyle, StrokeStyle},
    },
    scale::TimeScale,
    types::{Point, Rect},
};

use super::Chart;

const EVENT_MARKER_SIZE: f32 = 6.0;
const EVENT_PICK_RADIUS: f32 = 8.0;

impl Chart {
    pub fn set_events(&mut self, events: Vec<ChartEvent>) {
        self.events.set_all(events);
        if let Some(id) = self.selected_event_id.clone() {
            if self.events.get(&id).is_none() {
                self.selected_event_id = None;
            }
        }
    }

    pub fn clear_events(&mut self) {
        self.events.clear();
        self.selected_event_id = None;
    }

    pub fn select_event_at(&mut self, x_pixels: f32, y_pixels: f32) -> Option<String> {
        let selected = self.hit_test_event_at(x_pixels, y_pixels);
        self.selected_event_id = selected.clone();
        if selected.is_some() {
            self.selected_drawing_id = None;
            self.selected_series_id = None;
        }
        selected
    }

    pub fn selected_event(&self) -> Option<&ChartEvent> {
        self.selected_event_id
            .as_deref()
            .and_then(|id| self.events.get(id))
    }

    pub fn clear_selected_event(&mut self) {
        self.selected_event_id = None;
    }

    pub(crate) fn hit_test_event_at(&self, x_pixels: f32, y_pixels: f32) -> Option<String> {
        if self.candles.is_empty() {
            return None;
        }
        let layout = self.current_layout();
        let price_pane = layout.price_pane().unwrap_or(layout.plot);
        if y_pixels < price_pane.y || y_pixels > price_pane.bottom() {
            return None;
        }

        let ts = self.current_time_scale(price_pane);
        let mut best: Option<(f32, String)> = None;
        for event in self.events.events() {
            let Some(x) = self.pixel_x_for_timestamp(event.ts, ts) else {
                continue;
            };
            if x < price_pane.x || x > price_pane.right() {
                continue;
            }
            let y = price_pane.y + 10.0;
            let dx = x - x_pixels;
            let dy = y - y_pixels;
            let dist = (dx * dx + dy * dy).sqrt();
            if dist <= EVENT_PICK_RADIUS {
                match &best {
                    Some((best_dist, _)) if dist >= *best_dist => {}
                    _ => best = Some((dist, event.event_id.clone())),
                }
            }
        }
        best.map(|(_, id)| id)
    }

    pub(crate) fn build_event_marker_commands(&self, layout: &ChartLayout) -> Vec<DrawCommand> {
        if self.candles.is_empty() {
            return Vec::new();
        }
        let mut out = Vec::new();
        let price_pane = layout.price_pane().unwrap_or(layout.plot);
        let ts = self.current_time_scale(price_pane);
        out.push(DrawCommand::PushClip { rect: price_pane });
        for event in self.events.events() {
            let Some(x) = self.pixel_x_for_timestamp(event.ts, ts) else {
                continue;
            };
            if x < price_pane.x || x > price_pane.right() {
                continue;
            }
            let is_selected = self.selected_event_id.as_deref() == Some(event.event_id.as_str());
            let size = if is_selected {
                EVENT_MARKER_SIZE + 2.0
            } else {
                EVENT_MARKER_SIZE
            };
            let color = event_color_token(event.kind);
            out.push(DrawCommand::Rect {
                rect: Rect {
                    x: x - size * 0.5,
                    y: price_pane.y + 8.0 - size * 0.5,
                    w: size,
                    h: size,
                },
                fill: Some(FillStyle::token(color)),
                stroke: Some(StrokeStyle::token(ColorToken::PaneBorder, 1.0)),
            });
        }
        out.push(DrawCommand::PopClip);
        out
    }

    pub(crate) fn current_time_scale(&self, pane: Rect) -> TimeScale {
        match self.viewport {
            Some(vp) => TimeScale {
                pane,
                world_start_x: vp.world_start_x(),
                world_end_x: vp.world_end_x(),
            },
            None => TimeScale {
                pane,
                world_start_x: 0.0,
                world_end_x: self.candles.len() as f64,
            },
        }
    }

    pub(crate) fn world_x_for_timestamp(&self, ts: i64) -> Option<f64> {
        let first = self.candles.first()?;
        let last = self.candles.last()?;
        if self.candles.len() == 1 {
            return Some(0.0);
        }
        if ts <= first.ts {
            return Some(0.0);
        }
        if ts >= last.ts {
            let step = inferred_time_step_seconds(&self.candles).max(1);
            let future = (ts - last.ts) as f64 / step as f64;
            return Some((self.candles.len() - 1) as f64 + future);
        }
        for (idx, pair) in self.candles.windows(2).enumerate() {
            let a = pair[0].ts;
            let b = pair[1].ts;
            if ts >= a && ts <= b && b > a {
                let frac = (ts - a) as f64 / (b - a) as f64;
                return Some(idx as f64 + frac);
            }
        }
        None
    }

    pub(crate) fn pixel_x_for_timestamp(&self, ts: i64, scale: TimeScale) -> Option<f32> {
        let world = self.world_x_for_timestamp(ts)?;
        let span = scale.world_span();
        if span <= 0.0 || scale.pane.w <= 0.0 {
            return Some(scale.pane.x);
        }
        let u = ((world - scale.world_start_x) / span).clamp(0.0, 1.0);
        Some(scale.pane.x + (u as f32) * scale.pane.w)
    }

    pub(crate) fn replay_cursor_x(&self, scale: TimeScale) -> Option<f32> {
        let ts = self.replay.cursor_ts?;
        self.pixel_x_for_timestamp(ts, scale)
    }
}

fn event_color_token(kind: crate::events::ChartEventKind) -> ColorToken {
    match kind {
        crate::events::ChartEventKind::Signal => ColorToken::Crosshair,
        crate::events::ChartEventKind::Entry => ColorToken::Bull,
        crate::events::ChartEventKind::Exit => ColorToken::Bear,
        crate::events::ChartEventKind::Stop => ColorToken::Bear,
        crate::events::ChartEventKind::Target => ColorToken::Bull,
        crate::events::ChartEventKind::Reject => ColorToken::AxisText,
    }
}

fn inferred_time_step_seconds(candles: &[crate::types::Candle]) -> i64 {
    for pair in candles.windows(2).rev() {
        let delta = pair[1].ts - pair[0].ts;
        if delta > 0 {
            return delta;
        }
    }
    60
}

pub(crate) fn replay_cursor_commands(chart: &Chart, layout: &ChartLayout) -> Vec<DrawCommand> {
    if chart.candles.is_empty() {
        return Vec::new();
    }
    let price_pane = layout.price_pane().unwrap_or(layout.plot);
    let ts = chart.current_time_scale(price_pane);
    let Some(x) = chart.replay_cursor_x(ts) else {
        return Vec::new();
    };
    if x < layout.plot.x || x > layout.plot.right() {
        return Vec::new();
    }

    vec![
        DrawCommand::PushClip { rect: layout.plot },
        DrawCommand::Line {
            from: Point {
                x,
                y: layout.plot.y,
            },
            to: Point {
                x,
                y: layout.plot.bottom(),
            },
            stroke: StrokeStyle::token(ColorToken::AxisGridStrong, 1.0),
        },
        DrawCommand::PopClip,
    ]
}

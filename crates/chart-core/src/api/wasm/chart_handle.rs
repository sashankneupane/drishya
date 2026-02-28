//! WASM adapter for web usage.

use wasm_bindgen::prelude::*;
use web_sys::{CanvasRenderingContext2d, HtmlCanvasElement};

use crate::{
    chart::tools::DrawingToolMode, chart::Chart, drawings::hit_test::InteractionMode,
    plots::model::PaneId, render::backends::canvas2d::paint_canvas2d,
};

#[wasm_bindgen]
pub struct WasmChart {
    pub(crate) chart: Chart,
    pub(crate) canvas: HtmlCanvasElement,
    pub(crate) ctx: CanvasRenderingContext2d,
}

#[wasm_bindgen]
impl WasmChart {
    #[wasm_bindgen(constructor)]
    pub fn new(canvas_id: &str, width: u32, height: u32) -> Result<WasmChart, JsValue> {
        let window = web_sys::window().ok_or_else(|| JsValue::from_str("No window"))?;
        let document = window
            .document()
            .ok_or_else(|| JsValue::from_str("No document"))?;

        let el = document
            .get_element_by_id(canvas_id)
            .ok_or_else(|| JsValue::from_str("Canvas not found"))?;

        let canvas: HtmlCanvasElement = el.dyn_into::<HtmlCanvasElement>()?;

        let ctx = canvas
            .get_context("2d")?
            .ok_or_else(|| JsValue::from_str("2D context missing"))?
            .dyn_into::<CanvasRenderingContext2d>()?;

        Ok(Self {
            chart: Chart::new(width as f32, height as f32),
            canvas,
            ctx,
        })
    }

    pub fn resize(&mut self, width: u32, height: u32) {
        self.chart.set_size(width as f32, height as f32);
    }

    pub fn draw(&self) -> Result<(), JsValue> {
        let cmds = self.chart.build_draw_commands();
        paint_canvas2d(&self.ctx, &self.canvas, &cmds, self.chart.theme())
    }
}

pub(crate) fn pane_id_label(pane_id: &PaneId) -> String {
    match pane_id {
        PaneId::Price => "price".to_string(),
        PaneId::Named(name) => name.clone(),
    }
}

pub(crate) fn parse_interaction_mode(mode: &str) -> Result<InteractionMode, JsValue> {
    match mode.trim().to_ascii_lowercase().as_str() {
        "hover" => Ok(InteractionMode::Hover),
        "select" => Ok(InteractionMode::Select),
        "drag" => Ok(InteractionMode::Drag),
        other => Err(JsValue::from_str(&format!(
            "Invalid interaction mode '{other}'. Use one of: hover, select, drag"
        ))),
    }
}

pub(crate) fn parse_drawing_tool_mode(mode: &str) -> Result<DrawingToolMode, JsValue> {
    match mode.trim().to_ascii_lowercase().as_str() {
        "select" => Ok(DrawingToolMode::Select),
        "hline" => Ok(DrawingToolMode::HorizontalLine),
        "vline" => Ok(DrawingToolMode::VerticalLine),
        "ray" => Ok(DrawingToolMode::Ray),
        "rectangle" => Ok(DrawingToolMode::Rectangle),
        "price_range" => Ok(DrawingToolMode::PriceRange),
        "time_range" => Ok(DrawingToolMode::TimeRange),
        "date_time_range" => Ok(DrawingToolMode::DateTimeRange),
        "fib" => Ok(DrawingToolMode::FibRetracement),
        "long" => Ok(DrawingToolMode::LongPosition),
        "short" => Ok(DrawingToolMode::ShortPosition),
        "triangle" => Ok(DrawingToolMode::Triangle),
        "circle" => Ok(DrawingToolMode::Circle),
        "ellipse" => Ok(DrawingToolMode::Ellipse),
        "text" => Ok(DrawingToolMode::Text),
        "brush" => Ok(DrawingToolMode::Brush),
        "highlighter" => Ok(DrawingToolMode::Highlighter),
        other => Err(JsValue::from_str(&format!(
            "Invalid drawing tool mode '{other}'. Use: select, hline, vline, ray, rectangle, price_range, time_range, date_time_range, fib, long, short, triangle, circle, ellipse, text, brush, highlighter"
        ))),
    }
}

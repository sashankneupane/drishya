//! WASM adapter for web usage.
//!
//! `WasmChart` is intentionally a thin bridge that:
//! 1) marshals browser/JS inputs into chart-domain calls
//! 2) asks the domain to build a scene (`DrawCommand`s)
//! 3) delegates painting to a render backend
//!
//! This keeps chart logic testable in Rust without browser dependencies.

use wasm_bindgen::prelude::*;
use web_sys::{CanvasRenderingContext2d, HtmlCanvasElement};

use crate::{
    chart::Chart,
    render::backends::canvas2d::paint_canvas2d,
    types::Candle,
};

#[wasm_bindgen]
pub struct WasmChart {
    chart: Chart,
    canvas: HtmlCanvasElement,
    ctx: CanvasRenderingContext2d,
}

#[wasm_bindgen]
impl WasmChart {
    #[wasm_bindgen(constructor)]
    pub fn new(canvas_id: &str, width: u32, height: u32) -> Result<WasmChart, JsValue> {
        // Validate browser handles eagerly so JS gets immediate constructor
        // errors instead of delayed failures during the first draw.
        let window = web_sys::window().ok_or_else(|| JsValue::from_str("No window"))?;
        let document = window.document().ok_or_else(|| JsValue::from_str("No document"))?;

        let el = document
            .get_element_by_id(canvas_id)
            .ok_or_else(|| JsValue::from_str("Canvas not found"))?;

        let canvas: HtmlCanvasElement = el.dyn_into::<HtmlCanvasElement>()?;
        canvas.set_width(width);
        canvas.set_height(height);

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
        self.canvas.set_width(width);
        self.canvas.set_height(height);
        self.chart.set_size(width as f32, height as f32);
    }

    /// Pass JSON array of candles:
    /// [{"ts":1,"open":100.0,"high":101.0,"low":99.5,"close":100.5,"volume":1200.0}, ...]
    pub fn set_ohlcv_json(&mut self, json: &str) -> Result<(), JsValue> {
        let data: Vec<Candle> = serde_json::from_str(json)
            .map_err(|e| JsValue::from_str(&format!("Invalid OHLCV JSON: {e}")))?;
        self.chart.set_data(data);
        Ok(())
    }

    pub fn pan_pixels(&mut self, dx: f32) {
        self.chart.pan_pixels(dx);
    }

    /// zoom_factor < 1.0 => zoom in, > 1.0 => zoom out
    pub fn zoom_at_x(&mut self, x: f32, zoom_factor: f32) {
        self.chart.zoom_at_x(x, zoom_factor);
    }

    // -------- Drawing tools --------

    /// Add a horizontal line at the clicked Y position (CSS pixel space).
    pub fn add_horizontal_line_at_y(&mut self, y: f32) {
        self.chart.add_horizontal_line_at_y(y);
    }

    /// Add a vertical line at the clicked X position (CSS pixel space).
    pub fn add_vertical_line_at_x(&mut self, x: f32) {
        self.chart.add_vertical_line_at_x(x);
    }

    /// Optional helpers you can use later from JS
    pub fn clear_drawings(&mut self) {
        self.chart.clear_drawings();
    }

    // -------- Rendering --------

    pub fn draw(&self) -> Result<(), JsValue> {
        // Domain builds a backend-agnostic scene; backend handles paint.
        let cmds = self.chart.build_draw_commands();
        paint_canvas2d(&self.ctx, &self.canvas, &cmds)
    }
}

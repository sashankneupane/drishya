use wasm_bindgen::prelude::*;

use crate::api::wasm::chart_handle::WasmChart;
use crate::{
    chart::appearance::ChartAppearanceConfig,
    render::{candles::CandleBodyStyle, styles::ThemeId},
    types::CursorMode,
};

#[wasm_bindgen]
impl WasmChart {
    pub fn set_theme(&mut self, theme: &str) {
        match theme.to_ascii_lowercase().as_str() {
            "light" => self.chart.set_theme(ThemeId::Light),
            _ => self.chart.set_theme(ThemeId::Dark),
        }
    }

    /// Sets chart appearance config from JSON.
    /// Expects: {"background":"#030712","candle_up":"#22c55e","candle_down":"#ef4444"}
    /// Invalid values are rejected silently.
    pub fn set_appearance_config(&mut self, json: &str) -> Result<(), JsValue> {
        let config: ChartAppearanceConfig = serde_json::from_str(json)
            .map_err(|e| JsValue::from_str(&format!("Invalid appearance config JSON: {e}")))?;
        config.validate().map_err(|e| JsValue::from_str(&e))?;
        self.chart.set_appearance_config(config);
        Ok(())
    }

    /// Returns current chart appearance config as JSON.
    pub fn appearance_config(&self) -> Result<String, JsValue> {
        serde_json::to_string(self.chart.appearance_config())
            .map_err(|e| JsValue::from_str(&format!("Failed to serialize appearance config: {e}")))
    }

    /// Sets candle body style (`solid` | `hollow`).
    pub fn set_candle_style(&mut self, style: &str) {
        let style = match style.to_ascii_lowercase().as_str() {
            "hollow" => CandleBodyStyle::Hollow,
            "bars" => CandleBodyStyle::Bars,
            "volume" | "volume_candles" => CandleBodyStyle::Volume,
            _ => CandleBodyStyle::Solid,
        };
        self.chart.set_candle_body_style(style);
    }

    /// Returns current candle body style label.
    pub fn candle_style(&self) -> String {
        match self.chart.candle_body_style() {
            CandleBodyStyle::Solid => "solid",
            CandleBodyStyle::Hollow => "hollow",
            CandleBodyStyle::Bars => "bars",
            CandleBodyStyle::Volume => "volume",
        }
        .to_string()
    }

    /// Sets cursor mode (`crosshair` | `dot` | `normal`).
    pub fn set_cursor_mode(&mut self, mode: &str) {
        let mode = match mode.to_ascii_lowercase().as_str() {
            "dot" => CursorMode::Dot,
            "normal" => CursorMode::Normal,
            _ => CursorMode::Crosshair,
        };
        self.chart.set_cursor_mode(mode);
    }

    /// Returns current cursor mode label.
    pub fn cursor_mode(&self) -> String {
        match self.chart.cursor_mode() {
            CursorMode::Crosshair => "crosshair",
            CursorMode::Dot => "dot",
            CursorMode::Normal => "normal",
        }
        .to_string()
    }
}

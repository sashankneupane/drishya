use wasm_bindgen::prelude::*;

use crate::api::wasm::chart_handle::WasmChart;
use crate::indicators::api as indicator_api;

#[wasm_bindgen]
impl WasmChart {
    /// Adds a Simple Moving Average overlay.
    pub fn add_sma_overlay(&mut self, period: u32) {
        indicator_api::add_sma(&mut self.chart, period as usize);
    }

    /// Adds an Exponential Moving Average overlay.
    pub fn add_ema_overlay(&mut self, period: u32) {
        indicator_api::add_ema(&mut self.chart, period as usize);
    }

    /// Adds Bollinger Bands overlay.
    pub fn add_bbands_overlay(&mut self, period: u32, std_mult: f64) {
        indicator_api::add_bbands(&mut self.chart, period as usize, std_mult);
    }

    /// Adds MACD on a separate pane.
    pub fn add_macd_pane_indicator(&mut self, fast: u32, slow: u32, signal: u32) {
        indicator_api::add_macd(
            &mut self.chart,
            fast as usize,
            slow as usize,
            signal as usize,
        );
    }

    /// Adds a momentum histogram overlay.
    pub fn add_momentum_histogram_overlay(&mut self) {
        indicator_api::add_momentum_histogram(&mut self.chart);
    }

    /// Adds RSI on a separate bottom pane.
    pub fn add_rsi_pane_indicator(&mut self, period: u32) {
        indicator_api::add_rsi(&mut self.chart, period as usize);
    }

    /// Adds ATR on a separate pane.
    pub fn add_atr_pane_indicator(&mut self, period: u32) {
        indicator_api::add_atr(&mut self.chart, period as usize);
    }

    /// Adds stochastic oscillator on a separate pane.
    pub fn add_stochastic_pane_indicator(&mut self, k: u32, d: u32, smooth: u32) {
        indicator_api::add_stochastic(&mut self.chart, k as usize, d as usize, smooth as usize);
    }

    /// Adds OBV on a separate pane.
    pub fn add_obv_pane_indicator(&mut self) {
        indicator_api::add_obv(&mut self.chart);
    }

    /// Adds VWAP overlay on the price pane.
    pub fn add_vwap_overlay(&mut self) {
        indicator_api::add_vwap(&mut self.chart);
    }

    /// Adds ADX with DI components on a separate pane.
    pub fn add_adx_pane_indicator(&mut self, period: u32) {
        indicator_api::add_adx(&mut self.chart, period as usize);
    }

    /// Clears all active indicator overlays.
    pub fn clear_indicator_overlays(&mut self) {
        indicator_api::clear_builtins(&mut self.chart);
    }
}

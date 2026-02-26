//! Chart appearance config for user-customizable colors.
//!
//! PoC: background, candle up, candle down. Runtime only, no persistence.

use crate::render::styles::ThemeId;
use serde::{Deserialize, Serialize};

/// User-customizable chart appearance (bg, candle up/down colors).
/// Values are CSS color strings (e.g. hex, rgb, rgba).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChartAppearanceConfig {
    pub background: String,
    pub candle_up: String,
    pub candle_down: String,
}

impl ChartAppearanceConfig {
    pub fn defaults_for_theme(theme: ThemeId) -> Self {
        match theme {
            ThemeId::Dark => Self {
                background: "#030712".to_string(),
                candle_up: "#22c55e".to_string(),
                candle_down: "#ef4444".to_string(),
            },
            ThemeId::Light => Self {
                background: "#f8fafc".to_string(),
                candle_up: "#16a34a".to_string(),
                candle_down: "#dc2626".to_string(),
            },
        }
    }

    /// Basic validation: non-empty and reasonable length.
    /// Invalid CSS strings will fail at render; we avoid crashes only.
    pub fn is_valid_color(s: &str) -> bool {
        let s = s.trim();
        !s.is_empty() && s.len() <= 128
    }

    pub fn validate(&self) -> Result<(), String> {
        if !Self::is_valid_color(&self.background) {
            return Err("Invalid background color".to_string());
        }
        if !Self::is_valid_color(&self.candle_up) {
            return Err("Invalid candle up color".to_string());
        }
        if !Self::is_valid_color(&self.candle_down) {
            return Err("Invalid candle down color".to_string());
        }
        Ok(())
    }
}

impl Default for ChartAppearanceConfig {
    fn default() -> Self {
        Self::defaults_for_theme(ThemeId::Dark)
    }
}

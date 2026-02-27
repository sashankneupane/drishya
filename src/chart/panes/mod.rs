pub mod constraints;
pub mod layout;
pub mod registry;
#[cfg(test)]
mod tests;

use crate::{chart::Chart, types::Rect};
use std::collections::HashMap;

impl Chart {
    pub fn set_chart_pane_viewports(&mut self, viewports: HashMap<String, Rect>) {
        self.chart_pane_viewports = viewports;
    }

    pub fn chart_pane_viewports(&self) -> HashMap<String, Rect> {
        self.chart_pane_viewports.clone()
    }

    pub fn set_pane_chart_pane_map(&mut self, mapping: HashMap<String, String>) {
        self.pane_chart_pane_map = mapping;
    }

    pub fn pane_chart_pane_map(&self) -> HashMap<String, String> {
        self.pane_chart_pane_map.clone()
    }
}

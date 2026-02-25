//! Chart-facing plot provider management.

use std::collections::{BTreeMap, HashSet};

use serde::{Deserialize, Serialize};

use crate::{
    layout::{compute_layout, AxisVisibilityPolicy, ChartLayout, PaneDescriptor, PaneHeightPolicy},
    plots::{model::PaneId, provider::PlotDataProvider},
    types::Size,
};

use super::Chart;

const DEFAULT_PRICE_WEIGHT: f32 = 3.0;
const DEFAULT_NAMED_PANE_WEIGHT: f32 = 1.0;
const DEFAULT_PRICE_MIN_HEIGHT: f32 = 120.0;
const DEFAULT_NAMED_PANE_MIN_HEIGHT: f32 = 56.0;
const DEFAULT_COLLAPSED_HEIGHT: f32 = 24.0;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PaneLayoutState {
    pub registered: Vec<String>,
    pub order: Vec<String>,
    pub weights: BTreeMap<String, f32>,
    pub hidden: Vec<String>,
    pub collapsed: Vec<String>,
    pub y_axis_visible: BTreeMap<String, bool>,
    pub min_heights: BTreeMap<String, f32>,
    pub max_heights: BTreeMap<String, f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlotSeriesState {
    pub id: String,
    pub name: String,
    pub pane_id: String,
    pub visible: bool,
    pub deleted: bool,
}

impl Chart {
    pub fn add_plot_provider(&mut self, provider: Box<dyn PlotDataProvider>) {
        self.plot_providers.push(provider);
    }

    pub fn clear_plot_providers(&mut self) {
        self.plot_providers.clear();
        self.hidden_series.clear();
        self.deleted_series.clear();
    }

    pub(crate) fn collect_plot_series(&self) -> Vec<crate::plots::model::PlotSeries> {
        self.plot_providers
            .iter()
            .flat_map(|provider| provider.build_series(&self.candles))
            .filter(|series| !self.deleted_series.contains(&series.id))
            .map(|mut series| {
                if self.hidden_series.contains(&series.id) {
                    series.visible = false;
                }
                series
            })
            .collect()
    }

    pub fn plot_series_state(&self) -> Vec<PlotSeriesState> {
        self.plot_providers
            .iter()
            .flat_map(|provider| provider.build_series(&self.candles))
            .map(|series| {
                let deleted = self.deleted_series.contains(&series.id);
                let visible =
                    !deleted && series.visible && !self.hidden_series.contains(&series.id);
                PlotSeriesState {
                    id: series.id,
                    name: series.name,
                    pane_id: pane_id_label(&series.pane),
                    visible,
                    deleted,
                }
            })
            .collect()
    }

    pub fn is_series_visible(&self, series_id: &str) -> bool {
        let key = series_id.trim();
        if key.is_empty() {
            return false;
        }
        !self.hidden_series.contains(key) && !self.deleted_series.contains(key)
    }

    pub fn set_series_visibility(&mut self, series_id: &str, visible: bool) {
        let key = series_id.trim().to_string();
        if key.is_empty() || self.deleted_series.contains(&key) {
            return;
        }

        if visible {
            self.hidden_series.remove(&key);
        } else {
            self.hidden_series.insert(key);
        }
    }

    pub fn delete_series(&mut self, series_id: &str) {
        let key = series_id.trim().to_string();
        if key.is_empty() {
            return;
        }
        self.hidden_series.remove(&key);
        self.deleted_series.insert(key);
    }

    pub fn restore_series(&mut self, series_id: &str) {
        let key = series_id.trim().to_string();
        if key.is_empty() {
            return;
        }
        self.deleted_series.remove(&key);
        self.hidden_series.remove(&key);
    }

    pub fn is_pane_visible(&self, pane_id: &str) -> bool {
        let key = pane_key_from_input(pane_id);
        if key == "price" {
            return true;
        }
        !self.hidden_panes.contains(&key)
    }

    pub(crate) fn pane_descriptors(&self) -> Vec<PaneDescriptor> {
        let named_panes = ordered_registered_panes(&self.pane_registry, &self.pane_order);

        let price_weight = self
            .pane_weights
            .get("price")
            .copied()
            .unwrap_or(DEFAULT_PRICE_WEIGHT)
            .max(0.1);
        let price_axis_visible = self
            .pane_y_axis_visible
            .get("price")
            .copied()
            .unwrap_or(true);
        let price_min_height = self
            .pane_min_heights
            .get("price")
            .copied()
            .unwrap_or(DEFAULT_PRICE_MIN_HEIGHT)
            .max(1.0);
        let price_max_height = self
            .pane_max_heights
            .get("price")
            .copied()
            .filter(|v| *v >= price_min_height);

        let mut panes = vec![PaneDescriptor {
            id: PaneId::Price,
            height: PaneHeightPolicy::Ratio(price_weight),
            y_axis: if price_axis_visible {
                AxisVisibilityPolicy::Visible
            } else {
                AxisVisibilityPolicy::Hidden
            },
            min_height_px: price_min_height,
            max_height_px: price_max_height,
        }];

        for pane_key in named_panes {
            if self.hidden_panes.contains(&pane_key) {
                continue;
            }

            let ratio = self
                .pane_weights
                .get(&pane_key)
                .copied()
                .unwrap_or(DEFAULT_NAMED_PANE_WEIGHT)
                .max(0.1);
            let collapsed = self.collapsed_panes.contains(&pane_key);
            let axis_visible = self
                .pane_y_axis_visible
                .get(&pane_key)
                .copied()
                .unwrap_or(true);

            let default_min = if collapsed {
                DEFAULT_COLLAPSED_HEIGHT
            } else {
                DEFAULT_NAMED_PANE_MIN_HEIGHT
            };
            let min_height = self
                .pane_min_heights
                .get(&pane_key)
                .copied()
                .unwrap_or(default_min)
                .max(1.0);
            let max_height = self
                .pane_max_heights
                .get(&pane_key)
                .copied()
                .filter(|v| *v >= min_height);

            panes.push(PaneDescriptor {
                id: PaneId::Named(pane_key),
                height: if collapsed {
                    PaneHeightPolicy::FixedPx(DEFAULT_COLLAPSED_HEIGHT)
                } else {
                    PaneHeightPolicy::Ratio(ratio)
                },
                y_axis: if axis_visible {
                    AxisVisibilityPolicy::Visible
                } else {
                    AxisVisibilityPolicy::Hidden
                },
                min_height_px: min_height,
                max_height_px: max_height,
            });
        }

        if panes.len() == 1 {
            panes[0].height = PaneHeightPolicy::Auto;
        }

        panes
    }

    pub(crate) fn current_layout(&self) -> ChartLayout {
        let pane_specs = self.pane_descriptors();
        compute_layout(
            Size {
                width: self.size.width,
                height: self.size.height,
            },
            &pane_specs,
        )
    }

    pub fn set_pane_weight(&mut self, pane_id: &str, ratio: f32) {
        if ratio <= 0.0 {
            return;
        }

        let key = pane_key_from_input(pane_id);
        self.ensure_named_pane_registered(&key);

        self.pane_weights.insert(key, ratio.max(0.1));
    }

    pub fn set_pane_weights<I>(&mut self, pane_weights: I)
    where
        I: IntoIterator<Item = (String, f32)>,
    {
        for (pane_id, ratio) in pane_weights {
            self.set_pane_weight(&pane_id, ratio);
        }
    }

    pub fn clear_pane_weights(&mut self) {
        self.pane_weights.clear();
    }

    pub fn set_pane_visibility(&mut self, pane_id: &str, visible: bool) {
        let key = pane_key_from_input(pane_id);
        if key == "price" {
            return;
        }
        self.ensure_named_pane_registered(&key);

        if visible {
            self.hidden_panes.remove(&key);
        } else {
            self.hidden_panes.insert(key);
        }
    }

    pub fn set_pane_collapsed(&mut self, pane_id: &str, collapsed: bool) {
        let key = pane_key_from_input(pane_id);
        if key == "price" {
            return;
        }
        self.ensure_named_pane_registered(&key);

        if collapsed {
            self.collapsed_panes.insert(key);
        } else {
            self.collapsed_panes.remove(&key);
        }
    }

    pub fn set_pane_y_axis_visible(&mut self, pane_id: &str, visible: bool) {
        let key = pane_key_from_input(pane_id);
        self.ensure_named_pane_registered(&key);
        self.pane_y_axis_visible.insert(key, visible);
    }

    pub fn set_pane_height_constraints(
        &mut self,
        pane_id: &str,
        min_height_px: Option<f32>,
        max_height_px: Option<f32>,
    ) {
        let key = pane_key_from_input(pane_id);
        self.ensure_named_pane_registered(&key);

        if let Some(min_height_px) = min_height_px.filter(|v| *v > 0.0) {
            self.pane_min_heights.insert(key.clone(), min_height_px);
        } else {
            self.pane_min_heights.remove(&key);
        }

        let min_value = self.pane_min_heights.get(&key).copied().unwrap_or(1.0);
        if let Some(max_height_px) = max_height_px.filter(|v| *v >= min_value) {
            self.pane_max_heights.insert(key, max_height_px);
        } else {
            self.pane_max_heights.remove(&key);
        }
    }

    pub fn set_pane_order<I>(&mut self, order: I)
    where
        I: IntoIterator<Item = String>,
    {
        let mut dedup = HashSet::new();
        let ordered: Vec<String> = order
            .into_iter()
            .map(|pane_id| pane_key_from_input(&pane_id))
            .filter(|pane_key| pane_key != "price")
            .filter(|pane_key| dedup.insert(pane_key.clone()))
            .collect();

        for pane_key in &ordered {
            self.ensure_named_pane_registered(pane_key);
        }

        self.pane_order = ordered;
    }

    pub fn register_named_pane(&mut self, pane_id: &str) {
        let key = pane_key_from_input(pane_id);
        self.ensure_named_pane_registered(&key);
    }

    pub fn unregister_named_pane(&mut self, pane_id: &str) {
        let key = pane_key_from_input(pane_id);
        if key == "price" {
            return;
        }

        self.pane_registry.retain(|pane_key| pane_key != &key);
        self.pane_order.retain(|pane_key| pane_key != &key);
        self.hidden_panes.remove(&key);
        self.collapsed_panes.remove(&key);
        self.pane_y_axis_visible.remove(&key);
        self.pane_weights.remove(&key);
        self.pane_min_heights.remove(&key);
        self.pane_max_heights.remove(&key);
    }

    pub fn registered_named_panes(&self) -> Vec<String> {
        ordered_registered_panes(&self.pane_registry, &self.pane_order)
    }

    pub fn move_named_pane_up(&mut self, pane_id: &str) -> bool {
        self.move_named_pane(pane_id, -1)
    }

    pub fn move_named_pane_down(&mut self, pane_id: &str) -> bool {
        self.move_named_pane(pane_id, 1)
    }

    pub fn export_pane_layout_state(&self) -> PaneLayoutState {
        let mut hidden = self.hidden_panes.iter().cloned().collect::<Vec<_>>();
        hidden.sort();

        let mut collapsed = self.collapsed_panes.iter().cloned().collect::<Vec<_>>();
        collapsed.sort();

        PaneLayoutState {
            registered: self.pane_registry.clone(),
            order: self.pane_order.clone(),
            weights: self
                .pane_weights
                .iter()
                .map(|(k, v)| (k.clone(), *v))
                .collect(),
            hidden,
            collapsed,
            y_axis_visible: self
                .pane_y_axis_visible
                .iter()
                .map(|(k, v)| (k.clone(), *v))
                .collect(),
            min_heights: self
                .pane_min_heights
                .iter()
                .map(|(k, v)| (k.clone(), *v))
                .collect(),
            max_heights: self
                .pane_max_heights
                .iter()
                .map(|(k, v)| (k.clone(), *v))
                .collect(),
        }
    }

    pub fn restore_pane_layout_state(&mut self, state: PaneLayoutState) {
        self.pane_registry = state
            .registered
            .into_iter()
            .map(|pane_id| pane_key_from_input(&pane_id))
            .filter(|pane_key| pane_key != "price")
            .fold(Vec::new(), |mut acc, pane_key| {
                if !acc.contains(&pane_key) {
                    acc.push(pane_key);
                }
                acc
            });
        self.set_pane_order(state.order);
        self.pane_weights = state
            .weights
            .into_iter()
            .filter(|(_, weight)| *weight > 0.0)
            .map(|(k, v)| (pane_key_from_input(&k), v.max(0.1)))
            .collect();
        self.hidden_panes = state
            .hidden
            .into_iter()
            .map(|pane_id| pane_key_from_input(&pane_id))
            .filter(|pane_key| pane_key != "price")
            .collect();
        self.collapsed_panes = state
            .collapsed
            .into_iter()
            .map(|pane_id| pane_key_from_input(&pane_id))
            .filter(|pane_key| pane_key != "price")
            .collect();
        self.pane_y_axis_visible = state
            .y_axis_visible
            .into_iter()
            .map(|(k, v)| (pane_key_from_input(&k), v))
            .collect();
        self.pane_min_heights = state
            .min_heights
            .into_iter()
            .filter(|(_, min_height)| *min_height > 0.0)
            .map(|(k, v)| (pane_key_from_input(&k), v))
            .collect();
        self.pane_max_heights = state
            .max_heights
            .into_iter()
            .filter_map(|(k, max_height)| {
                let pane_key = pane_key_from_input(&k);
                let min_height = self.pane_min_heights.get(&pane_key).copied().unwrap_or(1.0);
                if max_height >= min_height {
                    Some((pane_key, max_height))
                } else {
                    None
                }
            })
            .collect();
    }

    pub fn clear_pane_layout_state(&mut self) {
        self.pane_registry.clear();
        self.pane_weights.clear();
        self.pane_order.clear();
        self.hidden_panes.clear();
        self.collapsed_panes.clear();
        self.pane_y_axis_visible.clear();
        self.pane_min_heights.clear();
        self.pane_max_heights.clear();
    }

    fn move_named_pane(&mut self, pane_id: &str, delta: isize) -> bool {
        let pane_key = pane_key_from_input(pane_id);
        if pane_key == "price" {
            return false;
        }

        self.ensure_named_pane_registered(&pane_key);

        if !self.pane_order.contains(&pane_key) {
            self.pane_order.push(pane_key.clone());
        }

        let Some(idx) = self.pane_order.iter().position(|k| k == &pane_key) else {
            return false;
        };

        let target = idx as isize + delta;
        if target < 0 || target >= self.pane_order.len() as isize {
            return false;
        }

        self.pane_order.swap(idx, target as usize);
        true
    }

    fn ensure_named_pane_registered(&mut self, pane_key: &str) {
        if pane_key == "price" || pane_key.is_empty() {
            return;
        }

        if !self
            .pane_registry
            .iter()
            .any(|registered| registered == pane_key)
        {
            self.pane_registry.push(pane_key.to_string());
        }
    }
}

fn pane_key_from_input(pane_id: &str) -> String {
    if pane_id.eq_ignore_ascii_case("price") {
        "price".to_string()
    } else {
        pane_id.trim().to_string()
    }
}

fn ordered_registered_panes(registered: &[String], pane_order: &[String]) -> Vec<String> {
    let mut seen = registered.iter().cloned().collect::<HashSet<_>>();
    let mut ordered = Vec::new();

    for pane_key in pane_order {
        if seen.remove(pane_key) {
            ordered.push(pane_key.clone());
        }
    }

    for pane_key in registered {
        if seen.remove(pane_key) {
            ordered.push(pane_key.clone());
        }
    }

    ordered
}

fn pane_id_label(pane_id: &PaneId) -> String {
    match pane_id {
        PaneId::Price => "price".to_string(),
        PaneId::Named(name) => name.clone(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::chart::Chart;

    #[test]
    fn registry_controls_pane_presence_without_series_discovery() {
        let mut chart = Chart::new(1200.0, 800.0);
        chart.register_named_pane("rsi");
        chart.register_named_pane("momentum");

        let descriptors = chart.pane_descriptors();
        let named = descriptors
            .iter()
            .filter_map(|d| match &d.id {
                PaneId::Named(name) => Some(name.clone()),
                _ => None,
            })
            .collect::<Vec<_>>();

        assert_eq!(named, vec!["rsi".to_string(), "momentum".to_string()]);
    }

    #[test]
    fn pane_order_is_deterministic_from_registry_and_order() {
        let mut chart = Chart::new(1200.0, 800.0);
        chart.register_named_pane("rsi");
        chart.register_named_pane("momentum");
        chart.register_named_pane("macd");
        chart.set_pane_order(vec!["macd".to_string(), "rsi".to_string()]);

        let ordered = chart.registered_named_panes();
        assert_eq!(ordered, vec!["macd", "rsi", "momentum"]);
    }
}

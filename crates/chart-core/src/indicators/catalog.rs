//! Indicator discovery from external compute catalogs.

use crate::indicators::contracts::IndicatorParamSchema;
use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct DiscoveredStyleDefault {
    pub color: String,
    pub width: Option<f64>,
    pub opacity: Option<f64>,
    pub pattern: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct DiscoveredStyleSlot {
    pub slot: String,
    pub kind: String,
    pub default: DiscoveredStyleDefault,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct DiscoveredOutputVisual {
    pub output: String,
    pub primitive: String,
    pub style_slot: String,
    pub z_index: i32,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct DiscoveredIndicatorVisual {
    pub pane_hint: String,
    pub scale_group: String,
    pub output_visuals: Vec<DiscoveredOutputVisual>,
    pub style_slots: Vec<DiscoveredStyleSlot>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct DiscoveredIndicator {
    pub id: String,
    pub display_name: String,
    pub category: String,
    pub runtime_binding: String,
    pub params: Vec<IndicatorParamSchema>,
    pub outputs: Vec<String>,
    pub visual: DiscoveredIndicatorVisual,
}

pub fn list_available_indicators() -> Vec<DiscoveredIndicator> {
    let mut items = ta_engine::runtime_catalog()
        .into_iter()
        .filter(|entry| entry.plot_capability == ta_engine::metadata::PlotCapability::Plot)
        .map(|entry| DiscoveredIndicator {
            id: entry.id,
            display_name: entry.display_name,
            category: entry.category,
            runtime_binding: entry.runtime_binding,
            params: entry
                .params
                .into_iter()
                .map(|p| IndicatorParamSchema {
                    name: p.name,
                    kind: match p.kind {
                        ta_engine::metadata::IndicatorParamKind::Integer => "int".to_string(),
                        ta_engine::metadata::IndicatorParamKind::Float => "float".to_string(),
                        ta_engine::metadata::IndicatorParamKind::Boolean => "bool".to_string(),
                        ta_engine::metadata::IndicatorParamKind::String => "string".to_string(),
                    },
                    required: p.required,
                })
                .collect(),
            outputs: entry.outputs.into_iter().map(|o| o.name).collect(),
            visual: DiscoveredIndicatorVisual {
                pane_hint: match entry.visual.pane_hint {
                    ta_engine::metadata::IndicatorPaneHint::PriceOverlay => "price_overlay",
                    ta_engine::metadata::IndicatorPaneHint::SeparatePane => "separate_pane",
                    ta_engine::metadata::IndicatorPaneHint::VolumeOverlay => "volume_overlay",
                    ta_engine::metadata::IndicatorPaneHint::Auto => "auto",
                }
                .to_string(),
                scale_group: match entry.visual.scale_group {
                    ta_engine::metadata::IndicatorScaleGroup::Price => "price",
                    ta_engine::metadata::IndicatorScaleGroup::Oscillator => "oscillator",
                    ta_engine::metadata::IndicatorScaleGroup::Volume => "volume",
                    ta_engine::metadata::IndicatorScaleGroup::Normalized => "normalized",
                    ta_engine::metadata::IndicatorScaleGroup::Binary => "binary",
                }
                .to_string(),
                output_visuals: entry
                    .visual
                    .output_visuals
                    .iter()
                    .map(|v| DiscoveredOutputVisual {
                        output: v.output.to_string(),
                        primitive: match v.primitive {
                            ta_engine::metadata::OutputVisualPrimitive::Line => "line",
                            ta_engine::metadata::OutputVisualPrimitive::Histogram => "histogram",
                            ta_engine::metadata::OutputVisualPrimitive::BandFill => "band_fill",
                            ta_engine::metadata::OutputVisualPrimitive::Markers => "markers",
                            ta_engine::metadata::OutputVisualPrimitive::SignalFlag => "signal_flag",
                        }
                        .to_string(),
                        style_slot: v.style_slot.to_string(),
                        z_index: v.z_index,
                    })
                    .collect(),
                style_slots: entry
                    .visual
                    .style_slots
                    .iter()
                    .map(|s| DiscoveredStyleSlot {
                        slot: s.slot.to_string(),
                        kind: match s.kind {
                            ta_engine::metadata::StyleSlotType::Stroke => "stroke",
                            ta_engine::metadata::StyleSlotType::Fill => "fill",
                        }
                        .to_string(),
                        default: DiscoveredStyleDefault {
                            color: s.default.color.to_string(),
                            width: s.default.width,
                            opacity: s.default.opacity,
                            pattern: s.default.pattern.map(|p| {
                                match p {
                                    ta_engine::metadata::StrokePattern::Solid => "solid",
                                    ta_engine::metadata::StrokePattern::Dashed => "dashed",
                                    ta_engine::metadata::StrokePattern::Dotted => "dotted",
                                }
                                .to_string()
                            }),
                        },
                    })
                    .collect(),
            },
        })
        .collect::<Vec<_>>();

    items.sort_by(|a, b| a.id.cmp(&b.id));
    items
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ta_catalog_discovery_returns_sorted_entries() {
        let indicators = list_available_indicators();
        assert!(!indicators.is_empty());
        assert!(indicators.windows(2).all(|w| w[0].id <= w[1].id));
        assert!(indicators.iter().any(|i| i.id == "rsi"));
        assert!(indicators.iter().any(|i| i.id == "macd"));
    }
}

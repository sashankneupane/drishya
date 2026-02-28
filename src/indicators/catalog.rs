//! Indicator discovery from external compute catalogs.

use crate::indicators::contracts::IndicatorParamSchema;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DiscoveredIndicator {
    pub id: String,
    pub display_name: String,
    pub category: String,
    pub runtime_binding: String,
    pub params: Vec<IndicatorParamSchema>,
    pub outputs: Vec<String>,
}

pub fn list_available_indicators() -> Vec<DiscoveredIndicator> {
    #[cfg(feature = "external-ta")]
    {
        let mut items = ta_engine::metadata::indicator_catalog()
            .iter()
            .map(|meta| DiscoveredIndicator {
                id: meta.id.to_string(),
                display_name: meta.display_name.to_string(),
                category: meta.category.to_string(),
                runtime_binding: meta.runtime_binding.to_string(),
                params: meta
                    .params
                    .iter()
                    .map(|p| IndicatorParamSchema {
                        name: p.name.to_string(),
                        kind: match p.kind {
                            ta_engine::metadata::IndicatorParamKind::Integer => "int".to_string(),
                            ta_engine::metadata::IndicatorParamKind::Float => "float".to_string(),
                            ta_engine::metadata::IndicatorParamKind::Boolean => "bool".to_string(),
                            ta_engine::metadata::IndicatorParamKind::String => "string".to_string(),
                        },
                        required: p.required,
                    })
                    .collect(),
                outputs: meta.outputs.iter().map(|o| o.name.to_string()).collect(),
            })
            .collect::<Vec<_>>();
        items.sort_by(|a, b| a.id.cmp(&b.id));
        return items;
    }

    #[cfg(not(feature = "external-ta"))]
    {
        Vec::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(feature = "external-ta")]
    #[test]
    fn ta_catalog_discovery_returns_sorted_entries() {
        let indicators = list_available_indicators();
        assert!(!indicators.is_empty());
        assert!(indicators.windows(2).all(|w| w[0].id <= w[1].id));
        assert!(indicators.iter().any(|i| i.id == "rsi"));
        assert!(indicators.iter().any(|i| i.id == "macd"));
    }

    #[cfg(not(feature = "external-ta"))]
    #[test]
    fn catalog_is_empty_without_external_feature() {
        assert!(list_available_indicators().is_empty());
    }
}

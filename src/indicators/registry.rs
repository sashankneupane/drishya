//! Indicator definition registry for built-ins and custom indicators.

use std::collections::BTreeMap;

use crate::indicators::catalog::{list_available_indicators, DiscoveredIndicator};
use crate::indicators::contracts::IndicatorParamSchema;
use crate::indicators::error::IndicatorError;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum IndicatorSource {
    Builtin,
    Custom,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IndicatorDefinition {
    pub id: String,
    pub display_name: String,
    pub source: IndicatorSource,
    pub runtime_binding: String,
    pub params: Vec<IndicatorParamSchema>,
    pub outputs: Vec<String>,
}

#[derive(Debug, Default)]
pub struct IndicatorRegistry {
    definitions: BTreeMap<String, IndicatorDefinition>,
}

impl IndicatorRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn load_builtins_from_catalog(&mut self) {
        for item in list_available_indicators() {
            self.insert_builtin(item);
        }
    }

    pub fn register_custom(
        &mut self,
        mut definition: IndicatorDefinition,
    ) -> Result<(), IndicatorError> {
        if definition.id.trim().is_empty() {
            return Err(IndicatorError::InvalidParameter {
                name: "id".to_string(),
                reason: "must be non-empty".to_string(),
            });
        }
        if !definition.id.starts_with("custom:") {
            return Err(IndicatorError::InvalidParameter {
                name: "id".to_string(),
                reason: "custom indicator ids must start with 'custom:'".to_string(),
            });
        }
        if self.definitions.contains_key(&definition.id) {
            return Err(IndicatorError::DuplicateLineName {
                line: definition.id.clone(),
            });
        }
        definition.source = IndicatorSource::Custom;
        self.definitions.insert(definition.id.clone(), definition);
        Ok(())
    }

    pub fn unregister_custom(&mut self, id: &str) {
        if self
            .definitions
            .get(id)
            .is_some_and(|d| d.source == IndicatorSource::Custom)
        {
            self.definitions.remove(id);
        }
    }

    pub fn get(&self, id: &str) -> Option<&IndicatorDefinition> {
        self.definitions.get(id)
    }

    pub fn list(&self) -> Vec<&IndicatorDefinition> {
        self.definitions.values().collect()
    }

    fn insert_builtin(&mut self, item: DiscoveredIndicator) {
        self.definitions.insert(
            item.id.clone(),
            IndicatorDefinition {
                id: item.id,
                display_name: item.display_name,
                source: IndicatorSource::Builtin,
                runtime_binding: item.runtime_binding,
                params: item.params,
                outputs: item.outputs,
            },
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn custom_registration_requires_custom_prefix() {
        let mut registry = IndicatorRegistry::new();
        let err = registry
            .register_custom(IndicatorDefinition {
                id: "my-rsi".to_string(),
                display_name: "My RSI".to_string(),
                source: IndicatorSource::Custom,
                runtime_binding: "my_rsi".to_string(),
                params: vec![],
                outputs: vec!["result".to_string()],
            })
            .unwrap_err();
        assert_eq!(
            err,
            IndicatorError::InvalidParameter {
                name: "id".to_string(),
                reason: "custom indicator ids must start with 'custom:'".to_string()
            }
        );
    }

    #[test]
    fn registry_lists_definitions_in_deterministic_id_order() {
        let mut registry = IndicatorRegistry::new();
        registry
            .register_custom(IndicatorDefinition {
                id: "custom:z".to_string(),
                display_name: "Z".to_string(),
                source: IndicatorSource::Custom,
                runtime_binding: "z".to_string(),
                params: vec![],
                outputs: vec!["result".to_string()],
            })
            .unwrap();
        registry
            .register_custom(IndicatorDefinition {
                id: "custom:a".to_string(),
                display_name: "A".to_string(),
                source: IndicatorSource::Custom,
                runtime_binding: "a".to_string(),
                params: vec![],
                outputs: vec!["result".to_string()],
            })
            .unwrap();

        let ids: Vec<&str> = registry.list().into_iter().map(|d| d.id.as_str()).collect();
        assert_eq!(ids, vec!["custom:a", "custom:z"]);
    }
}

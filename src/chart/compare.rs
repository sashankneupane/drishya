use crate::types::Candle;

#[derive(Debug, Clone)]
pub struct CompareSeries {
    pub id: String,
    pub symbol: String,
    pub name: String,
    pub visible: bool,
    pub color: String,
    pub candles: Vec<Candle>,
}

#[derive(Debug, Default, Clone)]
pub struct CompareRegistry {
    pub series: Vec<CompareSeries>,
    next_id: u64,
}

impl CompareRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn register(&mut self, symbol: &str, name: &str, color: &str) -> String {
        let id = format!("compare-{}", self.next_id);
        self.next_id += 1;
        self.series.push(CompareSeries {
            id: id.clone(),
            symbol: symbol.to_string(),
            name: name.to_string(),
            visible: true,
            color: color.to_string(),
            candles: Vec::new(),
        });
        id
    }

    pub fn remove(&mut self, id: &str) -> bool {
        let len_before = self.series.len();
        self.series.retain(|s| s.id != id);
        self.series.len() < len_before
    }

    pub fn set_candles(&mut self, id: &str, mut candles: Vec<Candle>) -> bool {
        if let Some(s) = self.series.iter_mut().find(|s| s.id == id) {
            candles.sort_by_key(|c| c.ts);
            s.candles = candles;
            true
        } else {
            false
        }
    }

    pub fn set_visible(&mut self, id: &str, visible: bool) -> bool {
        if let Some(s) = self.series.iter_mut().find(|s| s.id == id) {
            s.visible = visible;
            true
        } else {
            false
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_compare_registry_flow() {
        let mut registry = CompareRegistry::new();
        let id = registry.register("AAPL", "Apple Inc.", "#ff0000");
        assert!(id.starts_with("compare-"));
        assert_eq!(registry.series.len(), 1);

        assert!(registry.set_candles(
            &id,
            vec![Candle {
                ts: 100,
                open: 150.0,
                high: 155.0,
                low: 149.0,
                close: 152.0,
                volume: 1000.0
            }]
        ));
        assert_eq!(registry.series[0].candles.len(), 1);

        assert!(registry.set_visible(&id, false));
        assert!(!registry.series[0].visible);

        assert!(registry.remove(&id));
        assert_eq!(registry.series.len(), 0);
    }
}

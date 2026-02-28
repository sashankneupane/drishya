use std::collections::BTreeMap;

use super::types::ChartEvent;

#[derive(Debug, Clone, Default)]
pub struct EventStore {
    by_id: BTreeMap<String, ChartEvent>,
    sorted_ids: Vec<String>,
}

impl EventStore {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn clear(&mut self) {
        self.by_id.clear();
        self.sorted_ids.clear();
    }

    pub fn set_all(&mut self, events: Vec<ChartEvent>) {
        self.clear();
        for event in events {
            self.by_id.insert(event.event_id.clone(), event);
        }
        self.rebuild_sorted_ids();
    }

    pub fn upsert(&mut self, event: ChartEvent) {
        self.by_id.insert(event.event_id.clone(), event);
        self.rebuild_sorted_ids();
    }

    pub fn remove(&mut self, event_id: &str) -> bool {
        let removed = self.by_id.remove(event_id).is_some();
        if removed {
            self.rebuild_sorted_ids();
        }
        removed
    }

    pub fn events(&self) -> Vec<&ChartEvent> {
        self.sorted_ids
            .iter()
            .filter_map(|id| self.by_id.get(id))
            .collect()
    }

    pub fn get(&self, event_id: &str) -> Option<&ChartEvent> {
        self.by_id.get(event_id)
    }

    pub fn next_after(&self, ts: i64) -> Option<&ChartEvent> {
        self.events().into_iter().find(|event| event.ts > ts)
    }

    fn rebuild_sorted_ids(&mut self) {
        let mut ids: Vec<String> = self.by_id.keys().cloned().collect();
        ids.sort_by(|a, b| {
            let ea = self.by_id.get(a);
            let eb = self.by_id.get(b);
            match (ea, eb) {
                (Some(ae), Some(be)) => ae.ts.cmp(&be.ts).then_with(|| a.cmp(b)),
                _ => a.cmp(b),
            }
        });
        self.sorted_ids = ids;
    }
}

#[cfg(test)]
mod tests {
    use super::EventStore;
    use crate::events::types::{ChartEvent, ChartEventKind};

    fn event(id: &str, ts: i64) -> ChartEvent {
        ChartEvent {
            event_id: id.to_string(),
            ts,
            kind: ChartEventKind::Signal,
            side: None,
            price: None,
            text: None,
            meta: None,
        }
    }

    #[test]
    fn set_all_orders_stably_for_equal_timestamps() {
        let mut store = EventStore::new();
        store.set_all(vec![event("b", 100), event("a", 100), event("c", 90)]);
        let ids: Vec<String> = store.events().iter().map(|e| e.event_id.clone()).collect();
        assert_eq!(ids, vec!["c", "a", "b"]);
    }

    #[test]
    fn upsert_replaces_by_id_and_keeps_sorting() {
        let mut store = EventStore::new();
        store.set_all(vec![event("a", 100), event("b", 101)]);
        store.upsert(event("a", 110));
        let ids: Vec<String> = store.events().iter().map(|e| e.event_id.clone()).collect();
        assert_eq!(ids, vec!["b", "a"]);
        assert_eq!(store.get("a").map(|e| e.ts), Some(110));
    }

    #[test]
    fn next_after_finds_strict_next_timestamp() {
        let mut store = EventStore::new();
        store.set_all(vec![event("a", 100), event("b", 101), event("c", 101)]);
        assert_eq!(
            store.next_after(100).map(|e| e.event_id.clone()),
            Some("b".to_string())
        );
        assert_eq!(store.next_after(101).map(|e| e.event_id.clone()), None);
    }
}

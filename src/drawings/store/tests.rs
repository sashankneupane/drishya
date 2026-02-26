use crate::drawings::store::DrawingStore;

#[test]
fn default_layer_exists_on_new_store() {
    let store = DrawingStore::new();
    assert!(store.layers().contains_key("drawings"));
}

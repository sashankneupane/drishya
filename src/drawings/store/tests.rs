use crate::drawings::store::DrawingStore;

#[test]
fn default_layer_exists_on_new_store() {
    let store = DrawingStore::new();
    assert!(store.layers().contains_key("drawings"));
}

#[test]
fn visible_items_respect_layer_order() {
    let mut store = DrawingStore::new();
    let a = store.add_horizontal_line(100.0);
    let b = store.add_vertical_line(3.0);
    assert!(store.set_drawing_layer(a, "a"));
    assert!(store.set_drawing_layer(b, "b"));
    store.set_layer_order(vec!["a".to_string(), "b".to_string()]);
    let ids: Vec<u64> = store
        .visible_items_in_paint_order()
        .iter()
        .map(|d| d.id())
        .collect();
    assert_eq!(ids, vec![a, b]);
}

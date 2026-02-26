use crate::chart::Chart;

#[test]
fn pane_registry_round_trip() {
    let mut chart = Chart::new(800.0, 480.0);
    chart.register_named_pane("rsi");
    assert!(chart.registered_named_panes().contains(&"rsi".to_string()));
}

#[test]
fn pane_order_move_round_trip() {
    let mut chart = Chart::new(800.0, 480.0);
    chart.register_named_pane("rsi");
    chart.register_named_pane("momentum");
    chart.set_pane_order(vec!["rsi".to_string(), "momentum".to_string()]);
    let before = chart.registered_named_panes();
    let moved = chart.move_named_pane_up("momentum") || chart.move_named_pane_down("momentum");
    assert!(moved);
    let after = chart.registered_named_panes();
    assert_ne!(before, after);
}

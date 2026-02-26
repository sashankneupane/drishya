use crate::chart::Chart;

#[test]
fn pane_registry_round_trip() {
    let mut chart = Chart::new(800.0, 480.0);
    chart.register_named_pane("rsi");
    assert!(chart.registered_named_panes().contains(&"rsi".to_string()));
}

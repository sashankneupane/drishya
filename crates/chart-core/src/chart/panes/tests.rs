use crate::chart::Chart;
use crate::types::Rect;
use std::collections::HashMap;

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

#[test]
fn chart_pane_contract_round_trip() {
    let mut chart = Chart::new(800.0, 480.0);
    let mut viewports = HashMap::new();
    viewports.insert(
        "price".to_string(),
        Rect {
            x: 0.0,
            y: 0.0,
            w: 800.0,
            h: 280.0,
        },
    );
    viewports.insert(
        "chart-2".to_string(),
        Rect {
            x: 0.0,
            y: 280.0,
            w: 800.0,
            h: 200.0,
        },
    );
    chart.set_chart_pane_viewports(viewports.clone());
    assert_eq!(chart.chart_pane_viewports().len(), 2);
    let got = chart.chart_pane_viewports();
    let got_rect = got.get("chart-2").expect("chart-2 viewport should exist");
    assert_eq!(got_rect.x, 0.0);
    assert_eq!(got_rect.y, 280.0);
    assert_eq!(got_rect.w, 800.0);
    assert_eq!(got_rect.h, 200.0);

    let mut mapping = HashMap::new();
    mapping.insert("price".to_string(), "price".to_string());
    mapping.insert("rsi".to_string(), "price".to_string());
    mapping.insert("macd".to_string(), "chart-2".to_string());
    chart.set_pane_chart_pane_map(mapping.clone());
    assert_eq!(chart.pane_chart_pane_map(), mapping);
}

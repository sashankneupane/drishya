use crate::chart::Chart;
use crate::types::Candle;

#[test]
fn scene_builds_with_empty_data() {
    let chart = Chart::new(800.0, 480.0);
    let _ = chart.build_draw_commands();
}

#[test]
fn scene_builds_commands_with_data_and_crosshair() {
    let mut chart = Chart::new(800.0, 480.0);
    chart.set_data(vec![
        Candle {
            ts: 1,
            open: 100.0,
            high: 102.0,
            low: 99.0,
            close: 101.0,
            volume: 10.0,
        },
        Candle {
            ts: 2,
            open: 101.0,
            high: 103.0,
            low: 100.0,
            close: 102.0,
            volume: 12.0,
        },
    ]);
    chart.set_crosshair_at(120.0, 140.0);
    let cmds = chart.build_draw_commands();
    assert!(!cmds.is_empty());
}

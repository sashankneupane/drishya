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

#[test]
fn scene_builds_compare_overlays() {
    let mut chart = Chart::new(800.0, 480.0);
    chart.set_data(vec![
        Candle {
            ts: 100,
            open: 10.0,
            high: 11.0,
            low: 9.0,
            close: 10.5,
            volume: 10.0,
        },
        Candle {
            ts: 200,
            open: 10.5,
            high: 11.5,
            low: 9.5,
            close: 11.0,
            volume: 10.0,
        },
    ]);

    let sid = chart.register_compare_series("BTC", "Bitcoin", "orange");
    chart.set_compare_series_candles(
        &sid,
        vec![
            Candle {
                ts: 100,
                open: 50.0,
                high: 55.0,
                low: 45.0,
                close: 52.0,
                volume: 10.0,
            },
            Candle {
                ts: 200,
                open: 52.0,
                high: 58.0,
                low: 50.0,
                close: 55.0,
                volume: 10.0,
            },
        ],
    );

    let cmds = chart.build_draw_commands();
    // Normalization should happen relative to ts=100
    assert!(!cmds.is_empty());
}

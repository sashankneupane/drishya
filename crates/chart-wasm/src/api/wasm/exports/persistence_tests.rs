use crate::{
    api::{
        dto::persistence::{
            AppearanceSnapshotDto, ChartStateDto, ChartStateSnapshotDto, DrawingSnapshotDto,
            PanesSnapshotDto, RestoreChartStateOptionsDto, ViewportSnapshotDto,
        },
        wasm::exports::persistence::validate_snapshot,
    },
    chart::Chart,
    types::Candle,
};

fn candle(ts: i64, close: f64) -> Candle {
    Candle {
        ts,
        open: close,
        high: close + 1.0,
        low: close - 1.0,
        close,
        volume: 1000.0,
    }
}

#[test]
fn validate_snapshot_rejects_invalid_viewport_values() {
    let snapshot = ChartStateSnapshotDto {
        saved_at_unix_ms: 0,
        chart_state: ChartStateDto {
            viewport: ViewportSnapshotDto {
                world_start_x: 10.0,
                world_end_x: 10.0,
                y_zoom_factor: Some(-1.0),
                y_pan_offset: Some(0.0),
            },
            ..ChartStateDto::default()
        },
    };
    let err = validate_snapshot(
        &snapshot,
        &RestoreChartStateOptionsDto {
            viewport: true,
            ..RestoreChartStateOptionsDto::default()
        },
    )
    .expect_err("viewport should fail validation");
    assert!(err.contains("viewport.world_end_x"));
}

#[test]
fn validate_snapshot_rejects_invalid_pane_and_drawing_shape() {
    let snapshot = ChartStateSnapshotDto {
        saved_at_unix_ms: 0,
        chart_state: ChartStateDto {
            panes: PanesSnapshotDto {
                order: vec!["x".to_string()],
                panes: vec![crate::api::dto::persistence::PaneSnapshotDto {
                    id: "x".to_string(),
                    visible: true,
                    weight: 0.0,
                    collapsed: false,
                    y_axis_visible: true,
                    min_height_px: None,
                    max_height_px: None,
                }],
            },
            drawings: vec![DrawingSnapshotDto {
                id: 1,
                kind: "hline".to_string(),
                geometry: serde_json::json!({ "price": 100.0 }),
                style: serde_json::json!({}),
                layer_id: "".to_string(),
                group_id: None,
                visible: true,
                locked: false,
            }],
            ..ChartStateDto::default()
        },
    };

    let pane_err = validate_snapshot(
        &snapshot,
        &RestoreChartStateOptionsDto {
            panes: true,
            ..RestoreChartStateOptionsDto::default()
        },
    )
    .expect_err("pane weight should fail validation");
    assert!(pane_err.contains("invalid weight"));

    let drawing_err = validate_snapshot(
        &snapshot,
        &RestoreChartStateOptionsDto {
            drawings: true,
            ..RestoreChartStateOptionsDto::default()
        },
    )
    .expect_err("drawing layer_id should fail validation");
    assert!(drawing_err.contains("layer_id"));
}

#[test]
fn chart_surface_roundtrip_restores_viewport_panes_appearance_and_drawings() {
    let mut chart = Chart::new(1200.0, 700.0);
    chart.set_data(vec![
        candle(1, 100.0),
        candle(2, 101.0),
        candle(3, 102.0),
        candle(4, 103.0),
    ]);
    chart.set_pane_weight("rsi", 1.5);
    chart.set_pane_collapsed("rsi", true);
    chart.set_pane_visibility("rsi", true);
    chart.set_pane_y_axis_visible("rsi", false);
    chart.set_pane_height_constraints("rsi", Some(50.0), Some(180.0));
    chart.set_theme(crate::render::styles::ThemeId::Light);
    chart
        .restore_appearance_snapshot(&AppearanceSnapshotDto {
            theme: "dark".to_string(),
            config: serde_json::json!({
                "background": "#101010",
                "candle_up": "#22c55e",
                "candle_down": "#ef4444"
            }),
        })
        .expect("appearance restore should pass");
    chart
        .restore_drawing_snapshots(&[DrawingSnapshotDto {
            id: 11,
            kind: "hline".to_string(),
            geometry: serde_json::json!({ "price": 123.0 }),
            style: serde_json::json!({ "locked": false }),
            layer_id: "drawings".to_string(),
            group_id: None,
            visible: true,
            locked: false,
        }])
        .expect("drawing restore should pass");
    chart.restore_viewport_snapshot(&ViewportSnapshotDto {
        world_start_x: 0.0,
        world_end_x: 4.0,
        y_zoom_factor: Some(1.2),
        y_pan_offset: Some(0.2),
    });

    let exported_panes = chart.export_panes_snapshot();
    let exported_viewport = chart.export_viewport_snapshot();
    let exported_appearance = chart.export_appearance_snapshot();
    let exported_drawings = chart.export_drawing_snapshots();

    let mut restored = Chart::new(1200.0, 700.0);
    restored.set_data(vec![
        candle(1, 100.0),
        candle(2, 101.0),
        candle(3, 102.0),
        candle(4, 103.0),
    ]);
    restored.restore_panes_snapshot(&exported_panes);
    restored.restore_viewport_snapshot(&exported_viewport);
    restored
        .restore_appearance_snapshot(&exported_appearance)
        .expect("appearance import should pass");
    restored
        .restore_drawing_snapshots(&exported_drawings)
        .expect("drawing import should pass");

    assert_eq!(
        serde_json::to_string(&exported_panes).expect("serialize panes"),
        serde_json::to_string(&restored.export_panes_snapshot()).expect("serialize panes restored")
    );
    assert_eq!(
        serde_json::to_string(&exported_drawings).expect("serialize drawings"),
        serde_json::to_string(&restored.export_drawing_snapshots())
            .expect("serialize drawings restored")
    );
    assert_eq!(
        serde_json::to_string(&exported_appearance).expect("serialize appearance"),
        serde_json::to_string(&restored.export_appearance_snapshot())
            .expect("serialize appearance restored")
    );
    let roundtrip_viewport = restored.export_viewport_snapshot();
    assert!(roundtrip_viewport.world_end_x > roundtrip_viewport.world_start_x);
}

#[test]
fn appearance_restore_rejects_invalid_shape() {
    let mut chart = Chart::new(1200.0, 700.0);
    let err = chart
        .restore_appearance_snapshot(&AppearanceSnapshotDto {
            theme: "dark".to_string(),
            config: serde_json::json!({
                "background": "",
                "candle_up": "#22c55e",
                "candle_down": "#ef4444"
            }),
        })
        .expect_err("invalid appearance should fail");
    assert!(err.contains("Invalid background color"));
}

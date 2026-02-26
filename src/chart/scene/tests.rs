use crate::chart::Chart;

#[test]
fn scene_builds_with_empty_data() {
    let chart = Chart::new(800.0, 480.0);
    let _ = chart.build_draw_commands();
}

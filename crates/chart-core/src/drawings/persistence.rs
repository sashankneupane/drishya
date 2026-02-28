use std::collections::HashSet;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::{
    api::dto::persistence::DrawingSnapshotDto,
    drawings::{
        store::DrawingStore,
        types::{
            BrushStroke, Circle, DateTimeRange, Drawing, DrawingStyle, Ellipse, FibRetracement,
            HighlightStroke, HorizontalLine, LongPosition, PriceRange, Ray, Rectangle,
            ShortPosition, StrokePoint, Text, TimeRange, Triangle, VerticalLine,
        },
    },
};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct DrawingStyleSnapshot {
    #[serde(default)]
    stroke_color: Option<String>,
    #[serde(default)]
    fill_color: Option<String>,
    #[serde(default)]
    fill_opacity: Option<f32>,
    #[serde(default)]
    stroke_width: Option<f32>,
    #[serde(default)]
    stroke_type: Option<crate::drawings::types::StrokeType>,
    #[serde(default)]
    font_size: Option<f32>,
    #[serde(default)]
    locked: bool,
}

impl From<DrawingStyle> for DrawingStyleSnapshot {
    fn from(value: DrawingStyle) -> Self {
        Self {
            stroke_color: value.stroke_color,
            fill_color: value.fill_color,
            fill_opacity: value.fill_opacity,
            stroke_width: value.stroke_width,
            stroke_type: value.stroke_type,
            font_size: value.font_size,
            locked: value.locked,
        }
    }
}

impl From<DrawingStyleSnapshot> for DrawingStyle {
    fn from(value: DrawingStyleSnapshot) -> Self {
        Self {
            stroke_color: value.stroke_color,
            fill_color: value.fill_color,
            fill_opacity: value.fill_opacity,
            stroke_width: value.stroke_width,
            stroke_type: value.stroke_type,
            font_size: value.font_size,
            locked: value.locked,
        }
    }
}

pub fn export_drawing_snapshots(store: &DrawingStore) -> Vec<DrawingSnapshotDto> {
    store
        .items()
        .iter()
        .map(|drawing| {
            let (kind, geometry) = geometry_for_drawing(drawing);
            let style = serde_json::to_value(DrawingStyleSnapshot::from(drawing.style().clone()))
                .unwrap_or_else(|_| json!({}));
            DrawingSnapshotDto {
                id: drawing.id(),
                kind: kind.to_string(),
                geometry,
                style,
                layer_id: drawing.layer_id().to_string(),
                group_id: drawing.group_id().map(ToString::to_string),
                visible: store.is_drawing_visible(drawing.id()),
                locked: drawing.style().locked,
            }
        })
        .collect()
}

pub fn import_drawing_snapshots(
    store: &mut DrawingStore,
    snapshots: &[DrawingSnapshotDto],
) -> Result<(), String> {
    let mut drawings = Vec::with_capacity(snapshots.len());
    let mut hidden = HashSet::new();
    for snapshot in snapshots {
        let mut drawing = drawing_from_snapshot(snapshot)?;
        drawing.set_layer_id(&snapshot.layer_id);
        drawing.set_group_id(snapshot.group_id.as_deref());
        drawing.style_mut().locked = snapshot.locked;
        if !snapshot.visible {
            hidden.insert(snapshot.id);
        }
        drawings.push(drawing);
    }
    store.replace_persisted_drawings(drawings, hidden);
    Ok(())
}

fn geometry_for_drawing(drawing: &Drawing) -> (&'static str, Value) {
    match drawing {
        Drawing::HorizontalLine(item) => ("hline", json!({ "price": item.price })),
        Drawing::VerticalLine(item) => ("vline", json!({ "index": item.index })),
        Drawing::Ray(item) => (
            "ray",
            json!({
                "start_index": item.start_index,
                "end_index": item.end_index,
                "start_price": item.start_price,
                "end_price": item.end_price
            }),
        ),
        Drawing::Rectangle(item) => (
            "rectangle",
            json!({
                "start_index": item.start_index,
                "end_index": item.end_index,
                "top_price": item.top_price,
                "bottom_price": item.bottom_price
            }),
        ),
        Drawing::PriceRange(item) => (
            "price_range",
            json!({
                "start_index": item.start_index,
                "end_index": item.end_index,
                "top_price": item.top_price,
                "bottom_price": item.bottom_price,
                "is_up": item.is_up
            }),
        ),
        Drawing::TimeRange(item) => (
            "time_range",
            json!({
                "start_index": item.start_index,
                "end_index": item.end_index,
                "top_price": item.top_price,
                "bottom_price": item.bottom_price,
                "is_up": item.is_up
            }),
        ),
        Drawing::DateTimeRange(item) => (
            "date_time_range",
            json!({
                "start_index": item.start_index,
                "end_index": item.end_index,
                "top_price": item.top_price,
                "bottom_price": item.bottom_price,
                "is_up": item.is_up
            }),
        ),
        Drawing::LongPosition(item) => (
            "long",
            json!({
                "start_index": item.start_index,
                "end_index": item.end_index,
                "entry_index": item.entry_index,
                "entry_price": item.entry_price,
                "stop_price": item.stop_price,
                "target_price": item.target_price
            }),
        ),
        Drawing::ShortPosition(item) => (
            "short",
            json!({
                "start_index": item.start_index,
                "end_index": item.end_index,
                "entry_index": item.entry_index,
                "entry_price": item.entry_price,
                "stop_price": item.stop_price,
                "target_price": item.target_price
            }),
        ),
        Drawing::FibRetracement(item) => (
            "fib",
            json!({
                "start_index": item.start_index,
                "end_index": item.end_index,
                "start_price": item.start_price,
                "end_price": item.end_price
            }),
        ),
        Drawing::Circle(item) => (
            "circle",
            json!({
                "center_index": item.center_index,
                "center_price": item.center_price,
                "radius_index": item.radius_index,
                "radius_price": item.radius_price
            }),
        ),
        Drawing::Triangle(item) => (
            "triangle",
            json!({
                "p1_index": item.p1_index,
                "p1_price": item.p1_price,
                "p2_index": item.p2_index,
                "p2_price": item.p2_price,
                "p3_index": item.p3_index,
                "p3_price": item.p3_price
            }),
        ),
        Drawing::Ellipse(item) => (
            "ellipse",
            json!({
                "p1_index": item.p1_index,
                "p1_price": item.p1_price,
                "p2_index": item.p2_index,
                "p2_price": item.p2_price,
                "p3_index": item.p3_index,
                "p3_price": item.p3_price
            }),
        ),
        Drawing::Text(item) => (
            "text",
            json!({
                "index": item.index,
                "price": item.price,
                "text": item.text
            }),
        ),
        Drawing::BrushStroke(item) => ("brush", json!({ "points": item.points })),
        Drawing::HighlightStroke(item) => ("highlighter", json!({ "points": item.points })),
    }
}

fn drawing_from_snapshot(snapshot: &DrawingSnapshotDto) -> Result<Drawing, String> {
    let style_snapshot = serde_json::from_value::<DrawingStyleSnapshot>(snapshot.style.clone())
        .map_err(|e| format!("invalid style for drawing {}: {e}", snapshot.id))?;
    let style: DrawingStyle = style_snapshot.into();
    let id = snapshot.id;
    let layer_id = snapshot.layer_id.clone();
    let group_id = snapshot.group_id.clone();

    let drawing = match snapshot.kind.as_str() {
        "hline" => {
            let payload: HLinePayload = parse_geometry(snapshot)?;
            Drawing::HorizontalLine(HorizontalLine {
                id,
                price: payload.price,
                layer_id,
                group_id,
                style,
            })
        }
        "vline" => {
            let payload: VLinePayload = parse_geometry(snapshot)?;
            Drawing::VerticalLine(VerticalLine {
                id,
                index: payload.index,
                layer_id,
                group_id,
                style,
            })
        }
        "ray" => {
            let payload: RayPayload = parse_geometry(snapshot)?;
            Drawing::Ray(Ray {
                id,
                start_index: payload.start_index,
                end_index: payload.end_index,
                start_price: payload.start_price,
                end_price: payload.end_price,
                layer_id,
                group_id,
                style,
            })
        }
        "rectangle" => {
            let payload: RectPayload = parse_geometry(snapshot)?;
            Drawing::Rectangle(Rectangle {
                id,
                start_index: payload.start_index,
                end_index: payload.end_index,
                top_price: payload.top_price,
                bottom_price: payload.bottom_price,
                layer_id,
                group_id,
                style,
            })
        }
        "price_range" => {
            let payload: RangePayload = parse_geometry(snapshot)?;
            Drawing::PriceRange(PriceRange {
                id,
                start_index: payload.start_index,
                end_index: payload.end_index,
                top_price: payload.top_price,
                bottom_price: payload.bottom_price,
                is_up: payload.is_up,
                layer_id,
                group_id,
                style,
            })
        }
        "time_range" => {
            let payload: RangePayload = parse_geometry(snapshot)?;
            Drawing::TimeRange(TimeRange {
                id,
                start_index: payload.start_index,
                end_index: payload.end_index,
                top_price: payload.top_price,
                bottom_price: payload.bottom_price,
                is_up: payload.is_up,
                layer_id,
                group_id,
                style,
            })
        }
        "date_time_range" => {
            let payload: RangePayload = parse_geometry(snapshot)?;
            Drawing::DateTimeRange(DateTimeRange {
                id,
                start_index: payload.start_index,
                end_index: payload.end_index,
                top_price: payload.top_price,
                bottom_price: payload.bottom_price,
                is_up: payload.is_up,
                layer_id,
                group_id,
                style,
            })
        }
        "long" => {
            let payload: PositionPayload = parse_geometry(snapshot)?;
            Drawing::LongPosition(LongPosition {
                id,
                start_index: payload.start_index,
                end_index: payload.end_index,
                entry_index: payload.entry_index,
                entry_price: payload.entry_price,
                stop_price: payload.stop_price,
                target_price: payload.target_price,
                layer_id,
                group_id,
                style,
            })
        }
        "short" => {
            let payload: PositionPayload = parse_geometry(snapshot)?;
            Drawing::ShortPosition(ShortPosition {
                id,
                start_index: payload.start_index,
                end_index: payload.end_index,
                entry_index: payload.entry_index,
                entry_price: payload.entry_price,
                stop_price: payload.stop_price,
                target_price: payload.target_price,
                layer_id,
                group_id,
                style,
            })
        }
        "fib" => {
            let payload: FibPayload = parse_geometry(snapshot)?;
            Drawing::FibRetracement(FibRetracement {
                id,
                start_index: payload.start_index,
                end_index: payload.end_index,
                start_price: payload.start_price,
                end_price: payload.end_price,
                layer_id,
                group_id,
                style,
            })
        }
        "circle" => {
            let payload: CirclePayload = parse_geometry(snapshot)?;
            Drawing::Circle(Circle {
                id,
                center_index: payload.center_index,
                center_price: payload.center_price,
                radius_index: payload.radius_index,
                radius_price: payload.radius_price,
                layer_id,
                group_id,
                style,
            })
        }
        "triangle" => {
            let payload: TrianglePayload = parse_geometry(snapshot)?;
            Drawing::Triangle(Triangle {
                id,
                p1_index: payload.p1_index,
                p1_price: payload.p1_price,
                p2_index: payload.p2_index,
                p2_price: payload.p2_price,
                p3_index: payload.p3_index,
                p3_price: payload.p3_price,
                layer_id,
                group_id,
                style,
            })
        }
        "ellipse" => {
            let payload: EllipsePayload = parse_geometry(snapshot)?;
            Drawing::Ellipse(Ellipse {
                id,
                p1_index: payload.p1_index,
                p1_price: payload.p1_price,
                p2_index: payload.p2_index,
                p2_price: payload.p2_price,
                p3_index: payload.p3_index,
                p3_price: payload.p3_price,
                layer_id,
                group_id,
                style,
            })
        }
        "text" => {
            let payload: TextPayload = parse_geometry(snapshot)?;
            Drawing::Text(Text {
                id,
                index: payload.index,
                price: payload.price,
                text: payload.text,
                layer_id,
                group_id,
                style,
            })
        }
        "brush" => {
            let payload: StrokePayload = parse_geometry(snapshot)?;
            Drawing::BrushStroke(BrushStroke {
                id,
                points: payload.points,
                layer_id,
                group_id,
                style,
            })
        }
        "highlighter" => {
            let payload: StrokePayload = parse_geometry(snapshot)?;
            Drawing::HighlightStroke(HighlightStroke {
                id,
                points: payload.points,
                layer_id,
                group_id,
                style,
            })
        }
        other => {
            return Err(format!(
                "unsupported drawing kind '{other}' for drawing {}",
                id
            ))
        }
    };

    Ok(drawing)
}

fn parse_geometry<T: for<'de> Deserialize<'de>>(
    snapshot: &DrawingSnapshotDto,
) -> Result<T, String> {
    serde_json::from_value(snapshot.geometry.clone()).map_err(|e| {
        format!(
            "invalid geometry for drawing {} ({}): {e}",
            snapshot.id, snapshot.kind
        )
    })
}

#[derive(Debug, Deserialize)]
struct HLinePayload {
    price: f64,
}
#[derive(Debug, Deserialize)]
struct VLinePayload {
    index: f32,
}
#[derive(Debug, Deserialize)]
struct RayPayload {
    start_index: f32,
    end_index: f32,
    start_price: f64,
    end_price: f64,
}
#[derive(Debug, Deserialize)]
struct RectPayload {
    start_index: f32,
    end_index: f32,
    top_price: f64,
    bottom_price: f64,
}
#[derive(Debug, Deserialize)]
struct RangePayload {
    start_index: f32,
    end_index: f32,
    top_price: f64,
    bottom_price: f64,
    is_up: bool,
}
#[derive(Debug, Deserialize)]
struct PositionPayload {
    start_index: f32,
    end_index: f32,
    entry_index: f32,
    entry_price: f64,
    stop_price: f64,
    target_price: f64,
}
#[derive(Debug, Deserialize)]
struct FibPayload {
    start_index: f32,
    end_index: f32,
    start_price: f64,
    end_price: f64,
}
#[derive(Debug, Deserialize)]
struct CirclePayload {
    center_index: f32,
    center_price: f64,
    radius_index: f32,
    radius_price: f64,
}
#[derive(Debug, Deserialize)]
struct TrianglePayload {
    p1_index: f32,
    p1_price: f64,
    p2_index: f32,
    p2_price: f64,
    p3_index: f32,
    p3_price: f64,
}
#[derive(Debug, Deserialize)]
struct EllipsePayload {
    p1_index: f32,
    p1_price: f64,
    p2_index: f32,
    p2_price: f64,
    p3_index: f32,
    p3_price: f64,
}
#[derive(Debug, Deserialize)]
struct TextPayload {
    index: f32,
    price: f64,
    text: String,
}
#[derive(Debug, Deserialize)]
struct StrokePayload {
    points: Vec<StrokePoint>,
}

#[cfg(test)]
mod tests {
    use super::{export_drawing_snapshots, import_drawing_snapshots};
    use crate::drawings::store::DrawingStore;

    #[test]
    fn roundtrip_preserves_all_drawing_kinds() {
        let mut store = DrawingStore::new();
        store.create_layer("custom".to_string(), "Custom".to_string());
        store.create_group(
            "grp".to_string(),
            "Main group".to_string(),
            "custom".to_string(),
            None,
        );

        let ids = vec![
            store.add_horizontal_line(100.0),
            store.add_vertical_line(3.5),
            store.add_ray(1.0, 5.0, 101.0, 104.0),
            store.add_rectangle(2.0, 8.0, 110.0, 90.0),
            store.add_price_range(4.0, 9.0, 112.0, 97.0, true),
            store.add_time_range(5.0, 10.0, 113.0, 96.0, false),
            store.add_date_time_range(6.0, 11.0, 115.0, 95.0, true),
            store.add_long_position(2.0, 12.0, 7.0, 100.0, 95.0, 110.0),
            store.add_short_position(3.0, 13.0, 8.0, 100.0, 108.0, 92.0),
            store.add_fib_retracement(1.5, 9.5, 120.0, 80.0),
            store.add_circle(7.0, 10.0, 102.0, 106.0),
            store.add_triangle(1.0, 4.0, 7.0, 99.0, 107.0, 95.0),
            store.add_ellipse(2.0, 8.0, 5.0, 98.0, 104.0, 101.0),
            store.add_text(6.0, 103.0, "hello".to_string()),
            store.add_brush_stroke(vec![crate::drawings::types::StrokePoint {
                index: 1.0,
                price: 100.0,
            }]),
            store.add_highlight_stroke(vec![crate::drawings::types::StrokePoint {
                index: 2.0,
                price: 101.0,
            }]),
        ];

        for id in &ids {
            let _ = store.set_drawing_layer(*id, "custom");
            let _ = store.set_drawing_group(*id, Some("grp"));
            let _ = store.set_drawing_visible(*id, true);
            if let Some(item) = store.drawing_mut(*id) {
                item.style_mut().stroke_color = Some("#00ff00".to_string());
                item.style_mut().locked = *id % 2 == 0;
            }
        }
        let _ = store.set_drawing_visible(ids[2], false);

        let exported = export_drawing_snapshots(&store);
        let mut restored = DrawingStore::new();
        import_drawing_snapshots(&mut restored, &exported).expect("import must succeed");
        let re_exported = export_drawing_snapshots(&restored);

        assert_eq!(
            serde_json::to_string(&exported).expect("serialize exported"),
            serde_json::to_string(&re_exported).expect("serialize re-exported")
        );
    }
}

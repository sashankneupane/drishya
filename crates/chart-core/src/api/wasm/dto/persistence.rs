use serde::{Deserialize, Serialize};

/// Beta contract for downstream chart persistence.
///
/// Compatibility policy for beta:
/// - Field names are explicit and stable.
/// - New optional fields may be added.
/// - Removing or renaming existing fields is breaking.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ChartStateSnapshotDto {
    #[serde(default)]
    pub saved_at_unix_ms: u64,
    #[serde(default)]
    pub chart_state: ChartStateDto,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ChartStateDto {
    #[serde(default)]
    pub viewport: ViewportSnapshotDto,
    #[serde(default)]
    pub panes: PanesSnapshotDto,
    #[serde(default)]
    pub appearance: AppearanceSnapshotDto,
    #[serde(default)]
    pub drawings: Vec<DrawingSnapshotDto>,
    #[serde(default)]
    pub object_tree: ObjectTreeSnapshotDto,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub selection: Option<SelectionSnapshotDto>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ViewportSnapshotDto {
    pub world_start_x: f64,
    pub world_end_x: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub y_zoom_factor: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub y_pan_offset: Option<f32>,
}

impl Default for ViewportSnapshotDto {
    fn default() -> Self {
        Self {
            world_start_x: 0.0,
            world_end_x: 120.0,
            y_zoom_factor: Some(1.0),
            y_pan_offset: Some(0.0),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PanesSnapshotDto {
    #[serde(default)]
    pub order: Vec<String>,
    #[serde(default)]
    pub panes: Vec<PaneSnapshotDto>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaneSnapshotDto {
    pub id: String,
    pub visible: bool,
    pub weight: f32,
    pub collapsed: bool,
    pub y_axis_visible: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub min_height_px: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_height_px: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppearanceSnapshotDto {
    pub theme: String,
    pub config: serde_json::Value,
}

impl Default for AppearanceSnapshotDto {
    fn default() -> Self {
        Self {
            theme: "dark".to_string(),
            config: serde_json::json!({
                "background": "#030712",
                "candle_up": "#22c55e",
                "candle_down": "#ef4444"
            }),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DrawingSnapshotDto {
    pub id: u64,
    pub kind: String,
    pub geometry: serde_json::Value,
    pub style: serde_json::Value,
    pub layer_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub group_id: Option<String>,
    pub visible: bool,
    pub locked: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ObjectTreeSnapshotDto {
    #[serde(default)]
    pub panes: Vec<PaneTreeSnapshotDto>,
    #[serde(default)]
    pub series: Vec<SeriesTreeSnapshotDto>,
    #[serde(default)]
    pub layers: Vec<LayerTreeSnapshotDto>,
    #[serde(default)]
    pub groups: Vec<GroupTreeSnapshotDto>,
    #[serde(default)]
    pub drawings: Vec<DrawingTreeSnapshotDto>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaneTreeSnapshotDto {
    pub id: String,
    pub visible: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SeriesTreeSnapshotDto {
    pub id: String,
    pub name: String,
    pub pane_id: String,
    pub visible: bool,
    pub deleted: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DrawingTreeSnapshotDto {
    pub id: u64,
    pub kind: String,
    pub layer_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub group_id: Option<String>,
    pub visible: bool,
    pub locked: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LayerTreeSnapshotDto {
    pub id: String,
    pub name: String,
    pub visible: bool,
    pub locked: bool,
    pub order: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GroupTreeSnapshotDto {
    pub id: String,
    pub name: String,
    pub layer_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent_group_id: Option<String>,
    pub visible: bool,
    pub locked: bool,
    pub order: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SelectionSnapshotDto {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub selected_drawing_id: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tool_mode: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cursor_mode: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct RestoreChartStateOptionsDto {
    #[serde(default)]
    pub appearance: bool,
    #[serde(default)]
    pub panes: bool,
    #[serde(default)]
    pub viewport: bool,
    #[serde(default)]
    pub drawings: bool,
    #[serde(default)]
    pub selection: bool,
}

impl RestoreChartStateOptionsDto {
    pub fn all_enabled() -> Self {
        Self {
            appearance: true,
            panes: true,
            viewport: true,
            drawings: true,
            selection: true,
        }
    }
}

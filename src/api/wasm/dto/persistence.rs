use serde::{Deserialize, Serialize};

/// Beta contract for downstream chart persistence.
///
/// Compatibility policy for beta:
/// - Field names are explicit and stable.
/// - New optional fields may be added.
/// - Removing or renaming existing fields is breaking.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChartStateSnapshotDto {
    pub saved_at_unix_ms: u64,
    pub chart_state: ChartStateDto,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChartStateDto {
    pub viewport: ViewportSnapshotDto,
    pub panes: PanesSnapshotDto,
    pub appearance: AppearanceSnapshotDto,
    pub drawings: Vec<DrawingSnapshotDto>,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PanesSnapshotDto {
    pub order: Vec<String>,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ObjectTreeSnapshotDto {
    pub panes: Vec<PaneTreeSnapshotDto>,
    pub series: Vec<SeriesTreeSnapshotDto>,
    pub layers: Vec<LayerTreeSnapshotDto>,
    pub groups: Vec<GroupTreeSnapshotDto>,
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

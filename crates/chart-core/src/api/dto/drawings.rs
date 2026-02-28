use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct DrawingConfigJson {
    pub stroke_color: Option<String>,
    pub fill_color: Option<String>,
    pub fill_opacity: Option<f32>,
    pub stroke_width: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stroke_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub font_size: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text_content: Option<String>,
    pub locked: bool,
    pub supports_fill: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct PaneTreeState {
    pub id: String,
    pub visible: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct SeriesTreeState {
    pub id: String,
    pub name: String,
    pub pane_id: String,
    pub visible: bool,
    pub deleted: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct DrawingTreeState {
    pub id: u64,
    pub kind: String,
    pub layer_id: String,
    pub group_id: Option<String>,
    pub visible: bool,
    pub locked: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct LayerTreeState {
    pub id: String,
    pub name: String,
    pub visible: bool,
    pub locked: bool,
    pub order: i32,
}

#[derive(Debug, Clone, Serialize)]
pub struct GroupTreeState {
    pub id: String,
    pub name: String,
    pub layer_id: String,
    pub parent_group_id: Option<String>,
    pub visible: bool,
    pub locked: bool,
    pub order: i32,
}

#[derive(Debug, Clone, Serialize)]
pub struct ObjectTreeState {
    pub panes: Vec<PaneTreeState>,
    pub series: Vec<SeriesTreeState>,
    pub layers: Vec<LayerTreeState>,
    pub groups: Vec<GroupTreeState>,
    pub drawings: Vec<DrawingTreeState>,
}

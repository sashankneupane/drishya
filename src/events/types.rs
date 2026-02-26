use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ChartEventKind {
    Signal,
    Entry,
    Exit,
    Stop,
    Target,
    Reject,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ChartEventSide {
    Long,
    Short,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ChartEvent {
    pub event_id: String,
    pub ts: i64,
    pub kind: ChartEventKind,
    pub side: Option<ChartEventSide>,
    pub price: Option<f64>,
    pub text: Option<String>,
    pub meta: Option<Value>,
}

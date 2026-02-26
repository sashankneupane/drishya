use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct ReplayState {
    pub playing: bool,
    pub cursor_ts: Option<i64>,
}

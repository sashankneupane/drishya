use serde::{Deserialize, Serialize};

/// Mode for the price axis (Y-axis).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PriceAxisMode {
    #[default]
    Linear,
    Log,
    Percent,
}

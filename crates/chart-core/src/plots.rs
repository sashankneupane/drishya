//! Generic plotting contracts for the chart engine.
//!
//! The chart core works with pane/series/primitive concepts and does not need
//! to know indicator names (SMA/RSI/BBands/etc.).

pub mod model;
pub mod provider;
pub mod render;

//! Indicator subsystem.
//!
//! This module is an optional analytics adapter layer. `drishya` core remains
//! indicator-agnostic and consumes neutral plot contracts from `plots::*`.

pub mod api;
pub mod builtins;
pub mod catalog;
pub mod contracts;
pub mod engine;
pub mod error;
pub mod provider;

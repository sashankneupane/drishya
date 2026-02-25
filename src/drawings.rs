//! User drawing feature module.
//!
//! This boundary isolates annotation tools from chart core so new drawing types
//! can evolve independently.

pub mod commands;
pub mod hit_test;
pub mod render;
pub mod shape;
pub mod store;
pub mod types;

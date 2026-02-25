//! Rendering module split by responsibility.
//!
//! `axes`/`candles`/`volume` build scene commands, while `backends` paints
//! those commands to concrete targets.

pub mod axes;
pub mod backends;
pub mod candles;
pub mod primitives;
pub mod volume;

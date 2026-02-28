//! Rendering backends.
//!
//! Backends consume backend-agnostic `DrawCommand`s and paint them onto a
//! concrete target (Canvas2D now, others later).

pub mod canvas2d;

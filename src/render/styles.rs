//! Typed style system and theme palette.
//!
//! Render builders should prefer palette tokens instead of raw CSS strings.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ThemeId {
    Dark,
    Light,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ColorToken {
    CanvasBg,
    PaneBorder,
    GridLine,
    AxisText,
    AxisGridStrong,
    Crosshair,
    Bull,
    Bear,
    BullMuted,
    BearMuted,
    DrawingPrimary,
    DrawingPrimaryText,
    DrawingSecondary,
    DrawingSecondaryText,
}

#[derive(Debug, Clone)]
pub enum ColorRef {
    Token(ColorToken),
    Css(String),
}

impl From<ColorToken> for ColorRef {
    fn from(value: ColorToken) -> Self {
        Self::Token(value)
    }
}

#[derive(Debug, Clone)]
pub struct StrokeStyle {
    pub color: ColorRef,
    pub width: f32,
}

impl Default for StrokeStyle {
    fn default() -> Self {
        Self {
            color: ColorToken::AxisText.into(),
            width: 1.0,
        }
    }
}

impl StrokeStyle {
    pub fn token(color: ColorToken, width: f32) -> Self {
        Self {
            color: color.into(),
            width,
        }
    }

    pub fn css(color: String, width: f32) -> Self {
        Self {
            color: ColorRef::Css(color),
            width,
        }
    }
}

#[derive(Debug, Clone)]
pub struct FillStyle {
    pub color: ColorRef,
}

impl Default for FillStyle {
    fn default() -> Self {
        Self {
            color: ColorToken::CanvasBg.into(),
        }
    }
}

impl FillStyle {
    pub fn token(color: ColorToken) -> Self {
        Self {
            color: color.into(),
        }
    }

    pub fn css(color: String) -> Self {
        Self {
            color: ColorRef::Css(color),
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub enum TextAlign {
    Left,
    Right,
    Center,
}

#[derive(Debug, Clone)]
pub struct TextStyle {
    pub color: ColorRef,
    pub size: f32,
    pub align: TextAlign,
}

impl Default for TextStyle {
    fn default() -> Self {
        Self {
            color: ColorToken::AxisText.into(),
            size: 11.0,
            align: TextAlign::Left,
        }
    }
}

impl TextStyle {
    pub fn token(color: ColorToken, size: f32, align: TextAlign) -> Self {
        Self {
            color: color.into(),
            size,
            align,
        }
    }

    pub fn css(color: String, size: f32, align: TextAlign) -> Self {
        Self {
            color: ColorRef::Css(color),
            size,
            align,
        }
    }
}

pub fn resolve_color(theme: ThemeId, color: &ColorRef) -> String {
    match color {
        ColorRef::Css(v) => v.clone(),
        ColorRef::Token(token) => resolve_token(theme, *token).to_string(),
    }
}

fn resolve_token(theme: ThemeId, token: ColorToken) -> &'static str {
    match theme {
        ThemeId::Dark => resolve_dark(token),
        ThemeId::Light => resolve_light(token),
    }
}

fn resolve_dark(token: ColorToken) -> &'static str {
    match token {
        ColorToken::CanvasBg => "#030712",
        ColorToken::PaneBorder => "#1f2937",
        ColorToken::GridLine => "#111827",
        ColorToken::AxisText => "#9ca3af",
        ColorToken::AxisGridStrong => "rgba(17,24,39,0.7)",
        ColorToken::Crosshair => "rgba(148,163,184,0.78)",
        ColorToken::Bull => "#22c55e",
        ColorToken::Bear => "#ef4444",
        ColorToken::BullMuted => "rgba(34,197,94,0.30)",
        ColorToken::BearMuted => "rgba(239,68,68,0.30)",
        ColorToken::DrawingPrimary => "#f59e0b",
        ColorToken::DrawingPrimaryText => "#fbbf24",
        ColorToken::DrawingSecondary => "#38bdf8",
        ColorToken::DrawingSecondaryText => "#7dd3fc",
    }
}

fn resolve_light(token: ColorToken) -> &'static str {
    match token {
        ColorToken::CanvasBg => "#f8fafc",
        ColorToken::PaneBorder => "#cbd5e1",
        ColorToken::GridLine => "#e2e8f0",
        ColorToken::AxisText => "#334155",
        ColorToken::AxisGridStrong => "rgba(148,163,184,0.45)",
        ColorToken::Crosshair => "rgba(71,85,105,0.62)",
        ColorToken::Bull => "#16a34a",
        ColorToken::Bear => "#dc2626",
        ColorToken::BullMuted => "rgba(22,163,74,0.28)",
        ColorToken::BearMuted => "rgba(220,38,38,0.28)",
        ColorToken::DrawingPrimary => "#d97706",
        ColorToken::DrawingPrimaryText => "#b45309",
        ColorToken::DrawingSecondary => "#0284c7",
        ColorToken::DrawingSecondaryText => "#0369a1",
    }
}

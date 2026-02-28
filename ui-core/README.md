# ui-core

TypeScript + Tailwind workspace UI library for Drishya.

## Purpose

1. Typed WASM chart contracts and client wrapper
2. Importable workspace shell API (`createChartWorkspace`)
3. Modular UI primitives (left drawing rail, right object tree)
4. Tailwind-based styling tokens/components
5. Chart appearance config (background, candle up/down colors) via top-strip **Config** button
6. Per-drawing style and lock config via floating panel on selection (stroke, fill when supported, lock toggle, delete)

## Source layout

1. `src/wasm/*` - typed chart bridge
2. `src/workspace/*` - modular shell implementation
3. `src/chrome/*` - object tree models/layout types
4. `src/styles/tailwind.css` - Tailwind component classes

## Drawing config workflow

When a drawing is selected (select tool active, click on a drawing), a floating config panel appears in the top-right of the chart area. The panel provides:

- **Stroke color** – text input + color picker
- **Fill color** – only for fill-capable shapes (rectangles, circles, ellipses, etc.)
- **Lock toggle** – locked drawings are selectable but not movable or editable
- **Delete** – removes the selected drawing and closes the panel

Use the WASM client `getDrawingConfig`, `setDrawingConfig`, `getSelectedDrawingConfig`, and `deleteSelectedDrawing` for programmatic access.

## Multi-Pane Layout

The workspace supports multiple vertically stacked panes (e.g., Price, RSI, MACD).

- **Layout Engine**: TS-driven (`WorkspaceController`). Owns pane order, ratios, and visibility.
- **Synchronization**: Rust-driven authoritative crosshair and time-mapping.
- **Persistence**: Pane arrangements are saved to `localStorage` via the `persistKey` option.

### Pane API

Use `WorkspaceController` for layout management:
- `registerPane(spec)`: Add a new pane (price, indicator, or custom).
- `unregisterPane(paneId)`: Remove a pane.
- `setPaneVisible(paneId, visible)`: Toggle visibility.
- `setPaneRatio(paneId, ratio)`: Explicitly set height ratio (0.0 to 1.0).

### Crosshair Sync Contract

WASM exports `crosshair_sync_snapshot_json()` which returns:
- `x`: Pointer x-coordinate.
- `index`: Global candle index.
- `timestamp`: Synced timestamp across all panes.
- `readouts`: Array of `{ pane_id, value }` for each synchronized pane.

## Build output

Source is TypeScript-only under `src/`. JavaScript should come from `dist/` via `npm run build`.

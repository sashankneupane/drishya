# ui-core

TypeScript + Tailwind workspace UI library for Drishya.

## Purpose

1. Typed WASM chart contracts and client wrapper
2. Importable workspace shell API (`createChartWorkspace`)
3. Modular UI primitives (left drawing rail, right object tree)
4. Tailwind-based styling tokens/components

## Source layout

1. `src/wasm/*` - typed chart bridge
2. `src/workspace/*` - modular shell implementation
3. `src/chrome/*` - object tree models/layout types
4. `src/styles/tailwind.css` - Tailwind component classes

## Build output

Source is TypeScript-only under `src/`. JavaScript should come from `dist/` via `npm run build`.

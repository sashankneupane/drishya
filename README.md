# Drishya

Drishya is a Rust charting engine with a TypeScript SDK and a playground app.

## Repository Topology

```text
crates/
  chart-core/      Rust chart domain/core implementation
  chart-wasm/      Thin wasm-facing crate boundary
packages/
  chart-sdk/       TypeScript SDK/workspace layer
apps/
  playground/      Demo/playground app wiring
```

## Common Commands

```bash
# Rust quality checks
make rust

# TypeScript SDK checks
make ts

# Build wasm package into SDK output path
make wasm

# Full local quality gate
make quality
```

## Streaming OHLCV API

```js
chart.set_ohlcv_json(JSON.stringify(history));
chart.append_ohlcv_json(JSON.stringify(nextCandle));
chart.append_ohlcv_batch_json(JSON.stringify(batch));
chart.draw();
```

Upsert semantics:
- same `ts` as last candle: replace last candle
- newer `ts`: append candle
- older `ts` that exists: replace matching candle

# Drishya

A lightweight charting engine built in Rust and compiled to WebAssembly.

This project is currently a focused MVP foundation: modular rendering pipeline, command-based drawing mutations, and a thin web adapter.

## Streaming OHLCV API

Use `set_ohlcv_json` for initial history, then push live updates incrementally:

```js
chart.set_ohlcv_json(JSON.stringify(history));

// one live candle update
chart.append_ohlcv_json(
	JSON.stringify({
		ts: 1700000120,
		open: 101.2,
		high: 101.6,
		low: 100.9,
		close: 101.4,
		volume: 920.0,
	})
);

// or many updates at once
chart.append_ohlcv_batch_json(JSON.stringify(batch));
chart.draw();
```

Upsert semantics:
- same `ts` as last candle: replaces last candle (in-progress bar update)
- newer `ts`: appends a new candle
- older `ts` that exists: replaces matching candle

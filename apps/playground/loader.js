const BINANCE_LIMIT = 1000;
const COMPARE_COLORS = ["#f59e0b", "#60a5fa", "#34d399", "#f472b6", "#f97316", "#a78bfa"];

function parseBinanceKlineRow(row) {
  return {
    ts: Math.floor(Number(row[0]) / 1000),
    open: Number(row[1]),
    high: Number(row[2]),
    low: Number(row[3]),
    close: Number(row[4]),
    volume: Number(row[5])
  };
}

function parseBinanceWsKline(kline) {
  return {
    ts: Math.floor(Number(kline.t) / 1000),
    open: Number(kline.o),
    high: Number(kline.h),
    low: Number(kline.l),
    close: Number(kline.c),
    volume: Number(kline.v)
  };
}

function colorForCompareSymbol(symbol) {
  let hash = 0;
  for (let i = 0; i < symbol.length; i += 1) {
    hash = (hash * 31 + symbol.charCodeAt(i)) >>> 0;
  }
  return COMPARE_COLORS[hash % COMPARE_COLORS.length];
}

export function createBinanceLoader({ workspace, requestRedraw, getDefaultSymbol, getDefaultInterval }) {
  let workspaceRef = workspace;
  let requestRedrawRef = requestRedraw;
  const sourceStreams = new Map();
  const compareSeriesByPane = new Map();

  function sourceKey(source) {
    return `${source.symbol}::${source.timeframe}`;
  }

  function ensureSourceStream(source) {
    const key = sourceKey(source);
    if (!sourceStreams.has(key)) {
      sourceStreams.set(key, {
        source,
        ws: null,
        listeners: new Set()
      });
    }
    return sourceStreams.get(key);
  }

  function connectSourceStream(entry) {
    if (entry.ws) return;
    const stream = `${entry.source.symbol.toLowerCase()}@kline_${entry.source.timeframe}`;
    const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${stream}`);
    entry.ws = ws;
    ws.addEventListener("message", (event) => {
      try {
        const payload = JSON.parse(event.data);
        const kline = payload?.k;
        if (!kline) return;
        const candle = parseBinanceWsKline(kline);
        for (const listener of entry.listeners) {
          listener(candle);
        }
      } catch (error) {
        console.warn("Failed to process Binance WS message:", error);
      }
    });
    ws.addEventListener("close", () => {
      if (entry.ws === ws) entry.ws = null;
    });
  }

  function disconnectSourceStreamIfUnused(entry) {
    if (entry.listeners.size > 0) return;
    if (entry.ws) {
      entry.ws.close();
      entry.ws = null;
    }
    sourceStreams.delete(sourceKey(entry.source));
  }

  async function loadCompareSeries(paneId, symbol, interval) {
    if (!symbol) return;
    const runtime = workspaceRef?.getChart?.(paneId);
    if (!runtime) return;
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${BINANCE_LIMIT}`;
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Binance REST failed for compare ${symbol}: ${response.status}`);
      const raw = await response.json();
      const candles = raw.map(parseBinanceKlineRow);

      let paneSeries = compareSeriesByPane.get(paneId);
      if (!paneSeries) {
        paneSeries = new Map();
        compareSeriesByPane.set(paneId, paneSeries);
      }
      let seriesId = paneSeries.get(symbol);
      if (!seriesId) {
        seriesId = runtime.chart.registerCompareSeries(symbol, symbol, colorForCompareSymbol(symbol));
        if (!seriesId) throw new Error(`Failed to register compare series for ${symbol}`);
        paneSeries.set(symbol, seriesId);
      }

      runtime.chart.setCompareSeriesCandles(seriesId, candles);
      requestRedrawRef?.();
    } catch (error) {
      console.warn(`Failed to load compare series for ${symbol}:`, error);
    }
  }

  async function loadSnapshot(source) {
    const { symbol, timeframe } = source;
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${timeframe}&limit=${BINANCE_LIMIT}`;

    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Binance REST failed: ${response.status}`);

      const raw = await response.json();
      return raw.map(parseBinanceKlineRow);
    } catch (error) {
      console.error("Failed to load Binance data:", error);
      return [];
    }
  }

  async function subscribe(source, onCandle) {
    const entry = ensureSourceStream(source);
    entry.listeners.add(onCandle);
    connectSourceStream(entry);
    return () => {
      entry.listeners.delete(onCandle);
      disconnectSourceStreamIfUnused(entry);
    };
  }

  function dispose() {
    for (const entry of sourceStreams.values()) {
      entry.listeners.clear();
      if (entry.ws) entry.ws.close();
    }
    sourceStreams.clear();
    compareSeriesByPane.clear();
  }

  return {
    loadSnapshot,
    subscribe,
    dispose,
    loadCompareSeries,
    setWorkspace: (workspaceHandle) => {
      workspaceRef = workspaceHandle;
    },
    setRequestRedraw: (nextRequestRedraw) => {
      requestRedrawRef = nextRequestRedraw;
    }
  };
}

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
  const paneFeeds = new Map();

  function paneFeed(paneId) {
    return paneFeeds.get(paneId) ?? null;
  }

  function ensurePaneFeed(paneId) {
    if (!paneFeeds.has(paneId)) {
      paneFeeds.set(paneId, {
        ws: null,
        symbol: getDefaultSymbol(),
        interval: getDefaultInterval(),
        compareSeriesBySymbol: new Map()
      });
    }
    return paneFeeds.get(paneId);
  }

  function disconnectLiveCandles(paneId) {
    const feed = paneFeed(paneId);
    if (!feed) return;
    if (feed.ws) {
      feed.ws.close();
      feed.ws = null;
    }
  }

  async function loadCompareSeries(paneId, symbol, interval) {
    const feed = ensurePaneFeed(paneId);
    if (!symbol || symbol === feed.symbol) return;
    const runtime = workspace.getChart(paneId);
    if (!runtime) return;
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${BINANCE_LIMIT}`;
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Binance REST failed for compare ${symbol}: ${response.status}`);
      const raw = await response.json();
      const candles = raw.map(parseBinanceKlineRow);

      let seriesId = feed.compareSeriesBySymbol.get(symbol);
      if (!seriesId) {
        seriesId = runtime.chart.registerCompareSeries(symbol, symbol, colorForCompareSymbol(symbol));
        if (!seriesId) throw new Error(`Failed to register compare series for ${symbol}`);
        feed.compareSeriesBySymbol.set(symbol, seriesId);
      }

      runtime.chart.setCompareSeriesCandles(seriesId, candles);
      requestRedraw();
    } catch (error) {
      console.warn(`Failed to load compare series for ${symbol}:`, error);
    }
  }

  async function refreshAllCompareSeries(paneId, interval) {
    const feed = paneFeed(paneId);
    if (!feed) return;
    const symbols = Array.from(feed.compareSeriesBySymbol.keys());
    if (symbols.length === 0) return;
    await Promise.all(symbols.map((symbol) => loadCompareSeries(paneId, symbol, interval)));
  }

  async function loadInitialCandles(paneId, symbol, interval) {
    const runtime = workspace.getChart(paneId);
    if (!runtime) return false;
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${BINANCE_LIMIT}`;

    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Binance REST failed: ${response.status}`);

      const raw = await response.json();
      runtime.chart.setCandles(raw.map(parseBinanceKlineRow));
      requestRedraw();
      return true;
    } catch (error) {
      console.error("Failed to load Binance data:", error);
      return false;
    }
  }

  function connectLiveCandles(paneId, symbol, interval) {
    const runtime = workspace.getChart(paneId);
    if (!runtime) return;
    const feed = ensurePaneFeed(paneId);
    disconnectLiveCandles(paneId);

    const stream = `${symbol.toLowerCase()}@kline_${interval}`;
    const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${stream}`);
    feed.ws = ws;

    ws.addEventListener("message", (event) => {
      try {
        const payload = JSON.parse(event.data);
        const kline = payload?.k;
        if (!kline) return;
        runtime.chart.appendCandle(parseBinanceWsKline(kline));
        requestRedraw();
      } catch (error) {
        console.warn("Failed to process Binance WS message:", error);
      }
    });
  }

  async function startBinanceFeed(paneId, symbol, interval) {
    const feed = ensurePaneFeed(paneId);
    feed.symbol = symbol;
    feed.interval = interval;
    disconnectLiveCandles(paneId);
    const loaded = await loadInitialCandles(paneId, symbol, interval);
    if (loaded) {
      await refreshAllCompareSeries(paneId, interval);
      connectLiveCandles(paneId, symbol, interval);
    }
  }

  async function bootstrapAllPanes(symbol, interval) {
    for (const paneId of workspace.listCharts()) {
      await startBinanceFeed(paneId, symbol, interval);
    }
  }

  function syncPanesWithState(state, activeSymbol, activeInterval) {
    for (const paneId of workspace.listCharts()) {
      const src = state.chartPaneSources[paneId] ?? {};
      const symbol = src.symbol ?? activeSymbol;
      const interval = src.timeframe ?? activeInterval;
      const existing = paneFeed(paneId);
      if (!existing || existing.symbol !== symbol || existing.interval !== interval) {
        startBinanceFeed(paneId, symbol, interval).catch((err) => {
          console.warn(`Failed to bootstrap pane ${paneId}:`, err);
        });
      }
    }
    for (const paneId of Array.from(paneFeeds.keys())) {
      if (!workspace.getChart(paneId)) {
        disconnectLiveCandles(paneId);
        paneFeeds.delete(paneId);
      }
    }
  }

  function dispose() {
    for (const paneId of paneFeeds.keys()) {
      disconnectLiveCandles(paneId);
    }
  }

  return {
    bootstrapAllPanes,
    dispose,
    loadCompareSeries,
    startBinanceFeed,
    syncPanesWithState
  };
}

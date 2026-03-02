/**
 * Drishya Demo Application
 * Modernized to use the new Headless Controller Architecture.
 */
import { createBinanceLoader } from "./loader.js";

const DEFAULT_BINANCE_SYMBOL = "BTCUSDT";
const DEFAULT_BINANCE_INTERVAL = "1m";
const BINANCE_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "ADAUSDT", "XRPUSDT"];
const BINANCE_INTERVALS = ["1m", "5m", "15m", "1h", "4h", "1d", "1w", "1M"];
const DEMO_PERSIST_KEY = "drishya-playground-config-v5";
const PLAYGROUND_RESET_STAMP = "drishya-playground-reset-v5";

function cleanupDemoStorage() {
  try {
    const hasReset = localStorage.getItem(PLAYGROUND_RESET_STAMP) === "1";
    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
      const key = localStorage.key(i);
      if (!key) continue;
      const isLegacyPlayground = key.startsWith("drishya-playground-config-") && key !== DEMO_PERSIST_KEY;
      const shouldHardResetPlayground = !hasReset && key.startsWith("drishya-playground-config-");
      const isLegacyWorkspace = key === "drishya-config";
      if (isLegacyPlayground || shouldHardResetPlayground || isLegacyWorkspace) {
        localStorage.removeItem(key);
      }
    }
    if (!hasReset) {
      localStorage.setItem(PLAYGROUND_RESET_STAMP, "1");
    }
  } catch {
    // no-op
  }
}

async function main() {
  const version = Date.now();
  const loader = document.getElementById("loader");
  cleanupDemoStorage();
  let activeSymbol = DEFAULT_BINANCE_SYMBOL;
  let activeInterval = DEFAULT_BINANCE_INTERVAL;
  let loaderApi = null;
  let controllerRef = null;

  // Dynamically import the modernized UI core
  const { createChartWorkspaceFromModule } = await import(`/packages/chart-sdk/dist/index.js?v=${version}`);
  const host = document.getElementById("chart-root");

  // Initialize the workspace with the new controller-based API
  const workspace = await createChartWorkspaceFromModule({
    host,
    loadWasmModule: () => import(`/packages/chart-sdk/pkg/chart_wasm.js?v=${version}`),
    initialTheme: "dark",
    initialTool: "select",
    injectStyles: true,
    persistKey: DEMO_PERSIST_KEY,
    marketControls: {
      symbols: BINANCE_SYMBOLS,
      timeframes: BINANCE_INTERVALS,
      selectedSymbol: DEFAULT_BINANCE_SYMBOL,
      selectedTimeframe: DEFAULT_BINANCE_INTERVAL,
      onSymbolChange: async (symbol) => {
        activeSymbol = symbol;
      },
      onTimeframeChange: async (timeframe) => {
        activeInterval = timeframe;
      },
      onChartPaneSourceChange: async (_chartPaneId, next) => {
        if (next.symbol) activeSymbol = next.symbol;
        if (next.timeframe) activeInterval = next.timeframe;
        const paneId = _chartPaneId || controllerRef?.getState?.().activeChartPaneId || "price";
        if (loaderApi) {
          await loaderApi.startBinanceFeed(paneId, activeSymbol, activeInterval);
        }
      },
      onCompareSymbol: async (symbol) => {
        const paneId = controllerRef?.getState?.().activeChartPaneId || "price";
        if (loaderApi) {
          await loaderApi.loadCompareSeries(paneId, symbol, activeInterval);
        }
      }
    }
  });

  const { draw, controller } = workspace;
  controllerRef = controller;

  const initialState = controller.getState();
  const initialActivePane = initialState.activeChartPaneId;
  const initialActiveSource = initialState.chartPaneSources[initialActivePane] ?? {};
  if (initialActiveSource.symbol) activeSymbol = initialActiveSource.symbol;
  if (initialActiveSource.timeframe) activeInterval = initialActiveSource.timeframe;

  // Hide loader once chart is ready
  if (loader) loader.classList.add("hidden");

  // Demonstrate programmatic control via the new WorkspaceController
  console.log("Initial Workspace State:", controller.getState());

  // Subscribe to state changes (e.g., for analytics or external UI)
  controller.subscribe((state) => {
    console.log("Workspace State Updated:", state);
    document.title = `Drishya | ${activeSymbol} | ${state.theme.toUpperCase()}`;
  });

  let redrawQueued = false;
  function requestRedraw() {
    if (redrawQueued) return;
    redrawQueued = true;
    requestAnimationFrame(() => {
      redrawQueued = false;
      draw();
    });
  }

  loaderApi = createBinanceLoader({
    workspace,
    requestRedraw,
    getDefaultSymbol: () => activeSymbol,
    getDefaultInterval: () => activeInterval
  });

  // Initial load: respect restored per-pane sources from persisted workspace state.
  for (const paneId of workspace.listCharts()) {
    const source = controller.getState().chartPaneSources[paneId] ?? {};
    const symbol = source.symbol ?? activeSymbol;
    const timeframe = source.timeframe ?? activeInterval;
    await loaderApi.startBinanceFeed(paneId, symbol, timeframe);
  }

  controller.subscribe((state) => {
    loaderApi.syncPanesWithState(state, activeSymbol, activeInterval);
  });

  window.addEventListener("beforeunload", () => {
    loaderApi.dispose();
    workspace.destroy();
  });
}

main().catch((err) => {
  console.error("Demo bootstrap failed:", err);
  const pre = document.createElement("pre");
  pre.textContent = String(err?.stack || err);
  pre.style.cssText = "color:#f87171; background:#09090b; padding:20px; margin:0; position:fixed; inset:0; z-index:9999;";
  document.body.appendChild(pre);
});

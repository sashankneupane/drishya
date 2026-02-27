import type { DrawingToolId } from "../toolbar/model.js";
import type { ChartAppearanceConfig } from "../wasm/contracts.js";
import type { LayoutRect } from "../layout/splitTree.js";
import { DrishyaChartClient } from "../wasm/client.js";
import { DEFAULT_APPEARANCE_CONFIG, WORKSPACE_DRAW_TOOLS } from "./constants.js";
import { createDrawingConfigPanel } from "./components/DrawingConfigPanel.js";
import { bindWorkspaceInteractions } from "./interactions.js";
import { createLeftStrip } from "./leftStrip.js";
import { computeIndicatorRectsForChartPane } from "./layout/index.js";
import { createObjectTreePanel } from "./objectTreePanel.js";
import { createSymbolSearchModal } from "./SymbolSearchModal.js";
import { createTopStrip } from "./topStrip.js";
import { ReplayController } from "./replay/ReplayController.js";
import type { ChartPaneRuntime } from "./runtimeTypes.js";
import { WorkspaceController } from "./WorkspaceController.js";
import type {
  ChartWorkspaceHandle,
  CreateChartWorkspaceOptions,
  WorkspacePaneLayoutState,
  WorkspaceChartSplitNode,
  WorkspaceChartPaneSpec,
} from "./types.js";

const WORKSPACE_STYLE_LINK_ID = "drishya-workspace-styles";

interface PersistedWorkspaceState {
  theme?: "dark" | "light";
  appearance?: ChartAppearanceConfig;
  paneState?: string | null;
  paneStates?: Record<string, string | null>;
  candleStyle?: string;
  activeTool?: string;
  cursorMode?: string;
  isObjectTreeOpen?: boolean;
  objectTreeWidth?: number;
  isLeftStripOpen?: boolean;
  priceAxisMode?: "linear" | "log" | "percent";
  paneLayout?: WorkspacePaneLayoutState;
  chartPanes?: Record<string, WorkspaceChartPaneSpec>;
  chartLayoutTree?: WorkspaceChartSplitNode;
  activeChartPaneId?: string;
  chartPaneSources?: Record<string, { symbol?: string; timeframe?: string }>;
  workspaceTiles?: Record<string, { id: string; kind: "chart" | "objects"; title: string; widthRatio: number; chartTileId?: string }>;
  workspaceTileOrder?: string[];
  chartTiles?: Record<string, { id: string; tabs: Array<{ id: string; title: string; chartPaneId: string }>; activeTabId: string }>;
  activeChartTileId?: string;
  indicators?: string[];
  indicatorsByPane?: Record<string, string[]>;
}

export function createChartWorkspace(options: CreateChartWorkspaceOptions): ChartWorkspaceHandle {
  const { host, createWasmChart } = options;
  if (options.injectStyles !== false) {
    ensureWorkspaceStyles();
  }
  ensureHostHasViewport(host);
  host.innerHTML = "";

  const persistKey = options.persistKey ?? null;

  const controller = new WorkspaceController({
    theme: options.initialTheme,
    activeTool: "select"
  });
  if (options.marketControls?.selectedSymbol || options.marketControls?.selectedTimeframe) {
    controller.setChartPaneSource("price", {
      symbol: options.marketControls?.selectedSymbol,
      timeframe: options.marketControls?.selectedTimeframe
    });
  }
  let restoredObjectTreeWidth: number | null = null;
  let restoredPaneStatesByPane: Record<string, string | null> = {};
  let restoredIndicatorsByPane: Record<string, string[]> = {};

  // root element fills host completely and hides any overflow
  const root = document.createElement("div");
  // vertical layout: top strip, then main workspace row
  root.className = "h-full w-full min-h-0 min-w-0 flex flex-col bg-workspace-bg text-workspace-text overflow-hidden font-sans select-none";

  const mainRow = document.createElement("div");
  mainRow.className = "flex flex-1 min-h-0 min-w-0 relative";
  const tilesRow = document.createElement("div");
  tilesRow.className = "flex flex-1 min-h-0 min-w-0 relative overflow-hidden";

  const stage = document.createElement("div");
  stage.className = "min-h-0 min-w-0 bg-chart-bg flex-shrink-0 relative overflow-hidden flex-1";
  const chartLayer = document.createElement("div");
  chartLayer.className = "absolute inset-0";
  stage.appendChild(chartLayer);

  const priceContainer = document.createElement("div");
  priceContainer.className = "absolute overflow-hidden";
  chartLayer.appendChild(priceContainer);

  const canvas = document.createElement("canvas");
  canvas.className = "block h-full w-full bg-transparent absolute inset-0";
  const canvasId = `drishya-canvas-${Math.random().toString(36).slice(2, 10)}`;
  canvas.id = canvasId;
  priceContainer.appendChild(canvas);

  const configPanelOverlay = document.createElement("div");
  configPanelOverlay.className = "absolute inset-0 pointer-events-none z-40";
  stage.appendChild(configPanelOverlay);

  const caretOverlay = document.createElement("div");
  caretOverlay.className = "absolute inset-0 pointer-events-none z-50";
  caretOverlay.setAttribute("aria-hidden", "true");
  caretOverlay.style.display = "none";
  stage.appendChild(caretOverlay);

  if (typeof document !== "undefined" && !document.getElementById("drishya-caret-style")) {
    const caretStyle = document.createElement("style");
    caretStyle.id = "drishya-caret-style";
    caretStyle.textContent = "@keyframes drishya-caret-blink{0%,49%{opacity:1}50%,100%{opacity:0}}";
    document.head.appendChild(caretStyle);
  }

  // Mount elements to documented DOM before WASM initialization
  mainRow.appendChild(tilesRow);
  root.appendChild(mainRow);
  host.appendChild(root);

  // WASM Chart setup - NOW canvas is in DOM
  const primaryRawChart = createWasmChart(canvasId, 300, 300);
  const primaryChart = new DrishyaChartClient(primaryRawChart);
  const chartRuntimes = new Map<string, ChartPaneRuntime>();
  const replay = new ReplayController(primaryChart);
  controller.setReplayController(replay);
  primaryChart.setTheme(controller.getState().theme);
  chartRuntimes.set("price", {
    paneId: "price",
    container: priceContainer,
    canvas,
    rawChart: primaryRawChart,
    chart: primaryChart,
    draw: () => primaryChart.draw(),
    resize: (width: number, height: number) => primaryChart.resize(width, height)
  });

  const getActiveRuntime = () => {
    const activeId = controller.getState().activeChartPaneId;
    if (chartRuntimes.has(activeId)) return chartRuntimes.get(activeId) ?? null;
    if (controller.getState().chartPanes[activeId]) {
      const created = createRuntimeForPane(activeId);
      chartRuntimes.set(activeId, created);
      return created;
    }
    return chartRuntimes.get("price") ?? null;
  };
  const getRuntime = (paneId: string) => {
    if (chartRuntimes.has(paneId)) return chartRuntimes.get(paneId) ?? null;
    if (!controller.getState().chartPanes[paneId]) return null;
    const created = createRuntimeForPane(paneId);
    chartRuntimes.set(paneId, created);
    return created;
  };
  const getPrimaryRuntime = () => chartRuntimes.get("price") ?? chartRuntimes.values().next().value ?? null;
  // Apply default appearance on init (wasm may not support it in older builds)
  const applyAppearance = (config: { background: string; candle_up: string; candle_down: string }) => {
    for (const runtime of chartRuntimes.values()) {
      try {
        runtime.chart.setAppearanceConfig(config);
      } catch {
        // ignore if wasm doesn't support appearance config
      }
    }
  };
  applyAppearance(DEFAULT_APPEARANCE_CONFIG);

  const applyBuiltInIndicator = (targetChart: DrishyaChartClient, id: string) => {
    switch (id) {
      case "sma":
        targetChart.addSmaOverlay(20);
        return;
      case "ema":
        targetChart.addEmaOverlay(20);
        return;
      case "bb":
        targetChart.addBbandsOverlay(20, 2.0);
        return;
      case "rsi":
        targetChart.addRsiPaneIndicator(14);
        return;
      case "macd":
        targetChart.addMacdPaneIndicator(12, 26, 9);
        return;
      case "atr":
        targetChart.addAtrPaneIndicator(14);
        return;
      case "stoch":
        targetChart.addStochasticPaneIndicator(14, 3, 3);
        return;
      case "obv":
        targetChart.addObvPaneIndicator();
        return;
      case "vwap":
        targetChart.addVwapOverlay();
        return;
      case "adx":
        targetChart.addAdxPaneIndicator(14);
        return;
      case "mom":
        targetChart.addMomentumHistogramOverlay();
        return;
      default:
        return;
    }
  };

  const collectActiveBuiltInIndicators = (targetChart: DrishyaChartClient): string[] => {
    const ids = new Set<string>();
    for (const series of targetChart.objectTreeState().series) {
      if (series.deleted) continue;
      const seriesId = series.id;
      if (seriesId.startsWith("sma:")) ids.add("sma");
      else if (seriesId.startsWith("ema:")) ids.add("ema");
      else if (seriesId.startsWith("bbands:")) ids.add("bb");
      else if (seriesId.startsWith("rsi:")) ids.add("rsi");
      else if (seriesId.startsWith("macd:") || seriesId.startsWith("macd-signal:") || seriesId.startsWith("macd-hist:")) ids.add("macd");
      else if (seriesId.startsWith("atr:")) ids.add("atr");
      else if (seriesId.startsWith("stoch-k:") || seriesId.startsWith("stoch-d:")) ids.add("stoch");
      else if (seriesId === "obv") ids.add("obv");
      else if (seriesId === "vwap") ids.add("vwap");
      else if (seriesId.startsWith("adx:") || seriesId.startsWith("plus-di:") || seriesId.startsWith("minus-di:")) ids.add("adx");
      else if (seriesId === "momentum-histogram") ids.add("mom");
    }
    return Array.from(ids);
  };

  // Restore persisted state before building UI
  if (persistKey && typeof localStorage !== "undefined") {
    try {
      const raw = localStorage.getItem(persistKey);
      if (raw) {
        const saved = JSON.parse(raw) as PersistedWorkspaceState;
        if (saved.theme) {
          controller.setTheme(saved.theme);
          for (const runtime of chartRuntimes.values()) {
            runtime.chart.setTheme(saved.theme);
          }
        }
        if (saved.cursorMode) {
          controller.setCursorMode(saved.cursorMode as "crosshair" | "dot" | "normal");
          getPrimaryRuntime()?.chart.setCursorMode(saved.cursorMode);
        }
        if (saved.isObjectTreeOpen !== undefined) controller.setObjectTreeOpen(saved.isObjectTreeOpen);
        if (typeof saved.objectTreeWidth === "number" && Number.isFinite(saved.objectTreeWidth)) {
          restoredObjectTreeWidth = saved.objectTreeWidth;
        }
        if (saved.isLeftStripOpen !== undefined) controller.setLeftStripOpen(saved.isLeftStripOpen);
        if (saved.priceAxisMode) {
          controller.setPriceAxisMode(saved.priceAxisMode);
          getPrimaryRuntime()?.chart.setPriceAxisMode(saved.priceAxisMode);
        }
        if (saved.paneLayout) {
          controller.loadPaneLayout(saved.paneLayout);
        }
        if (saved.chartPanes && saved.chartLayoutTree) {
          controller.loadChartLayout(
            saved.chartPanes,
            saved.chartLayoutTree,
            saved.activeChartPaneId ?? undefined
          );
        } else if (saved.activeChartPaneId) {
          controller.setActiveChartPane(saved.activeChartPaneId);
        }
        if (saved.chartPaneSources) {
          for (const [paneId, source] of Object.entries(saved.chartPaneSources)) {
            controller.setChartPaneSource(paneId, source ?? {});
          }
        }
        if (saved.workspaceTiles && saved.workspaceTileOrder && saved.chartTiles) {
          controller.loadWorkspaceTiles?.(
            saved.workspaceTiles as any,
            saved.workspaceTileOrder,
            saved.chartTiles as any,
            saved.activeChartTileId
          );
        }
        if (saved.appearance) applyAppearance(saved.appearance);
        const validStyle = saved.candleStyle as "solid" | "hollow" | "bars" | "volume" | undefined;
        if (validStyle && ["solid", "hollow", "bars", "volume"].includes(validStyle)) {
          getPrimaryRuntime()?.chart.setCandleStyle(validStyle);
        }
        restoredPaneStatesByPane = saved.paneStates ?? {};
        restoredIndicatorsByPane = saved.indicatorsByPane ?? {};
        if (!Object.keys(restoredPaneStatesByPane).length && saved.paneState !== undefined) {
          restoredPaneStatesByPane.price = saved.paneState;
        }
        if (!Object.keys(restoredIndicatorsByPane).length && Array.isArray(saved.indicators)) {
          restoredIndicatorsByPane.price = saved.indicators.filter((x): x is string => typeof x === "string");
        }
      }
    } catch {
      // ignore corrupt or incompatible persisted data
    }
  }

  const savePersistedState = (() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const DEBOUNCE_MS = 400;
    return () => {
      if (!persistKey || typeof localStorage === "undefined") return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        try {
          const paneStates: Record<string, string | null> = {};
          const indicatorsByPane: Record<string, string[]> = {};
          for (const [paneId, runtime] of chartRuntimes) {
            paneStates[paneId] = runtime.chart.getPaneStateJson();
            indicatorsByPane[paneId] = collectActiveBuiltInIndicators(runtime.chart);
          }
          const state: PersistedWorkspaceState = {
            theme: controller.getState().theme,
            // Do not persist activeTool for the demo app; always restore as "select"
            cursorMode: controller.getState().cursorMode,
            isObjectTreeOpen: controller.getState().isObjectTreeOpen,
            objectTreeWidth,
            isLeftStripOpen: controller.getState().isLeftStripOpen,
            priceAxisMode: controller.getState().priceAxisMode,
            candleStyle: getActiveRuntime()?.chart.candleStyle() ?? getPrimaryRuntime()?.chart.candleStyle(),
            appearance: getActiveRuntime()?.chart.getAppearanceConfig() ?? getPrimaryRuntime()?.chart.getAppearanceConfig() ?? undefined,
            paneLayout: controller.getState().paneLayout,
            chartPanes: controller.getState().chartPanes,
            chartLayoutTree: controller.getState().chartLayoutTree,
            activeChartPaneId: controller.getState().activeChartPaneId,
            chartPaneSources: controller.getState().chartPaneSources,
            workspaceTiles: controller.getState().workspaceTiles,
            workspaceTileOrder: controller.getState().workspaceTileOrder,
            chartTiles: controller.getState().chartTiles,
            activeChartTileId: controller.getState().activeChartTileId,
            paneStates,
            indicatorsByPane
          };
          localStorage.setItem(persistKey, JSON.stringify(state));
        } catch {
          // ignore quota or parse errors
        }
      }, DEBOUNCE_MS);
    };
  })();

  // top control strip
  const chartFacade = new Proxy({} as DrishyaChartClient, {
    get(_target, prop: keyof DrishyaChartClient) {
      const runtime = getActiveRuntime();
      const activeChart = runtime?.chart ?? getPrimaryRuntime()?.chart;
      if (!activeChart) return undefined;
      const value = (activeChart as any)[prop];
      if (typeof value === "function") {
        return (...args: unknown[]) => (activeChart as any)[prop](...args);
      }
      return value;
    }
  }) as DrishyaChartClient;

  const topHandle = createTopStrip({
    chart: chartFacade,
    controller,
    getAppearanceConfig: () => getActiveRuntime()?.chart.getAppearanceConfig() ?? getPrimaryRuntime()?.chart.getAppearanceConfig() ?? null,
    applyAppearanceConfig: (cfg) => {
      applyAppearanceConfig(cfg);
      savePersistedState();
    },
    symbols: options.marketControls?.symbols ?? [],
    timeframes: options.marketControls?.timeframes ?? [],
    selectedSymbol: options.marketControls?.selectedSymbol,
    selectedTimeframe: options.marketControls?.selectedTimeframe,
    onSymbolChange: async (symbol) => {
      const paneId = controller.getState().activeChartPaneId;
      controller.setChartPaneSource(paneId, { symbol });
      await options.marketControls?.onChartPaneSourceChange?.(paneId, {
        symbol,
        timeframe: controller.getState().chartPaneSources[paneId]?.timeframe
      });
      await options.marketControls?.onSymbolChange?.(symbol);
    },
    onTimeframeChange: async (timeframe) => {
      const paneId = controller.getState().activeChartPaneId;
      controller.setChartPaneSource(paneId, { timeframe });
      const symbol =
        controller.getState().chartPaneSources[paneId]?.symbol ??
        options.marketControls?.selectedSymbol ??
        options.marketControls?.symbols?.[0];
      if (symbol) {
        await options.marketControls?.onChartPaneSourceChange?.(paneId, { symbol, timeframe });
      }
      await options.marketControls?.onTimeframeChange?.(timeframe);
    },
    onCompareSymbol: options.marketControls?.onCompareSymbol,
    onCandleTypeChange: (mode) => {
      getActiveRuntime()?.chart.setCandleStyle(mode);
      getActiveRuntime()?.chart.draw();
      savePersistedState();
    },
    onLayout: () => { },
    onMutate: () => draw()
  });

  const stripHandle = createLeftStrip({
    tools: WORKSPACE_DRAW_TOOLS,
    controller,
    drawingToolsEnabled: typeof getPrimaryRuntime()?.rawChart.set_drawing_tool_mode === "function",
    onClear: () => {
      clearDrawings();
      draw();
    }
  });

  const treeHandle = createObjectTreePanel({
    getChart: () => getActiveRuntime()?.chart ?? getPrimaryRuntime()?.chart ?? null,
    controller,
    symbols: options.marketControls?.symbols ?? [],
    onPaneSourceChange: async (paneId, symbol) => {
      controller.setChartPaneSource(paneId, { symbol });
      await options.marketControls?.onChartPaneSourceChange?.(paneId, {
        symbol,
        timeframe: controller.getState().chartPaneSources[paneId]?.timeframe
      });
      await options.marketControls?.onSymbolChange?.(symbol);
      draw();
    },
    onMutate: () => draw()
  });

  const treeResizeHandle = document.createElement("div");
  treeResizeHandle.className = "h-full w-2 shrink-0 cursor-col-resize bg-transparent hover:bg-zinc-800/70 transition-colors";
  treeResizeHandle.title = "Resize Objects";
  treeResizeHandle.style.display = "none";

  const OBJECT_TREE_MIN_WIDTH = 300;
  const OBJECT_TREE_MAX_WIDTH = 760;
  let objectTreeWidth = 360;
  const applyObjectTreeWidth = (width: number) => {
    objectTreeWidth = Math.max(OBJECT_TREE_MIN_WIDTH, Math.min(OBJECT_TREE_MAX_WIDTH, Math.floor(width)));
    treeHandle.root.style.width = "100%";
    treeHandle.root.style.minWidth = "0";
  };
  if (restoredObjectTreeWidth !== null) {
    applyObjectTreeWidth(restoredObjectTreeWidth);
  }

  const syncTileWidths = () => {
    const state = controller.getState();
    const order = state.workspaceTileOrder.filter((tileId) => state.workspaceTiles[tileId]);
    for (const tileId of order) {
      const tile = state.workspaceTiles[tileId];
      const el = tileShellById.get(tileId);
      if (!tile || !el) continue;
      const ratio = Math.max(0.08, tile.widthRatio || 0);
      el.style.flex = `0 0 ${ratio * 100}%`;
      el.style.minWidth = tile.kind === "objects" ? "260px" : "360px";
    }
  };

  const renderChartTabs = (chartTileId: string) => {
    const tabStrip = chartTileTabById.get(chartTileId);
    if (!tabStrip) return;
    tabStrip.innerHTML = "";
    const chartTile = controller.getState().chartTiles[chartTileId];
    if (!chartTile) return;
    for (const tab of chartTile.tabs) {
      const tabBtn = document.createElement("button");
      const active = tab.id === chartTile.activeTabId;
      tabBtn.className = `h-6 px-2 rounded text-[10px] border ${active ? "border-zinc-600 text-zinc-100 bg-zinc-900/80" : "border-transparent text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900/50"} cursor-pointer`;
      tabBtn.textContent = tab.title;
      tabBtn.onclick = () => controller.setActiveChartTab(chartTileId, tab.id);
      tabStrip.appendChild(tabBtn);

      if (chartTile.tabs.length > 1) {
        const closeBtn = document.createElement("button");
        closeBtn.className = "h-6 w-6 rounded text-[10px] text-zinc-600 hover:text-zinc-200 hover:bg-zinc-900/50 border-none bg-transparent cursor-pointer";
        closeBtn.textContent = "x";
        closeBtn.title = "Close tab";
        closeBtn.onclick = () => controller.removeChartTab(chartTileId, tab.id);
        tabStrip.appendChild(closeBtn);
      }
    }
    const addBtn = document.createElement("button");
    addBtn.className = "ml-auto h-6 w-6 rounded text-[12px] text-zinc-500 hover:text-zinc-100 hover:bg-zinc-900/70 border-none bg-transparent cursor-pointer";
    addBtn.textContent = "+";
    addBtn.title = "Add tab";
    addBtn.onclick = () => controller.addChartTab(chartTileId);
    tabStrip.appendChild(addBtn);
  };

  const renderWorkspaceTiles = () => {
    const state = controller.getState();
    const order = state.workspaceTileOrder.filter((tileId) => state.workspaceTiles[tileId]);
    paneHostByPaneId.clear();
    const seen = new Set(order);
    for (const existing of Array.from(tileShellById.keys())) {
      if (seen.has(existing)) continue;
      tileShellById.get(existing)?.remove();
      tileShellById.delete(existing);
      tileHeaderById.delete(existing);
    }

    for (let index = 0; index < order.length; index += 1) {
      const tileId = order[index];
      const tile = state.workspaceTiles[tileId];
      if (!tile) continue;
      let shell = tileShellById.get(tileId);
      if (!shell) {
        shell = document.createElement("div");
        shell.className = "h-full min-h-0 min-w-0 flex flex-col border-r border-zinc-900/80 bg-zinc-950/60";
        const header = createTileHeader(tile.title);
        tileHeaderById.set(tileId, header);
        const body = document.createElement("div");
        body.className = "flex-1 min-h-0 min-w-0";
        shell.append(header, body);
        tileShellById.set(tileId, shell);
      }
      const header = tileHeaderById.get(tileId)!;
      header.onclick = () => {
        if (tile.kind === "chart" && tile.chartTileId) {
          controller.setActiveChartTile(tile.chartTileId);
        }
      };
      header.onpointerdown = (event) => {
        const startX = event.clientX;
        const startIndex = controller.getState().workspaceTileOrder.indexOf(tileId);
        let dragging = false;
        const onMove = (moveEvent: PointerEvent) => {
          const dx = moveEvent.clientX - startX;
          if (!dragging && Math.abs(dx) > 10) dragging = true;
          if (!dragging) return;
          const width = shell?.getBoundingClientRect().width ?? 1;
          const shift = dx > width * 0.5 ? 1 : (dx < -width * 0.5 ? -1 : 0);
          const nextIndex = Math.max(0, Math.min(order.length - 1, startIndex + shift));
          controller.moveWorkspaceTile(tileId, nextIndex);
        };
        const onUp = () => {
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", onUp);
        };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
      };
      const body = shell.children[1] as HTMLDivElement;
      body.innerHTML = "";
      if (tile.kind === "chart" && tile.chartTileId) {
        let tileBody = chartTileBodyByChartTileId.get(tile.chartTileId);
        if (!tileBody) {
          tileBody = document.createElement("div");
          tileBody.className = "h-full w-full min-h-0 min-w-0 flex flex-col";
          const tabs = createChartTabStrip(tile.chartTileId);
          tileBody.appendChild(tabs);
          chartTileBodyByChartTileId.set(tile.chartTileId, tileBody);
        }
        while (tileBody.children.length > 1) {
          tileBody.removeChild(tileBody.lastChild!);
        }
        const stageHost = ensureChartTileStage(tile.chartTileId);
        tileBody.appendChild(stageHost.stage);
        const chartTile = state.chartTiles[tile.chartTileId];
        const activeTab = chartTile?.tabs.find((tab) => tab.id === chartTile.activeTabId) ?? chartTile?.tabs[0];
        if (activeTab) {
          paneHostByPaneId.set(activeTab.chartPaneId, stageHost);
        }
        body.appendChild(tileBody);
        renderChartTabs(tile.chartTileId);
      } else {
        body.appendChild(treeHandle.root);
      }
      if (tilesRow.children[index] !== shell) {
        if (index >= tilesRow.children.length) {
          tilesRow.appendChild(shell);
        } else {
          tilesRow.insertBefore(shell, tilesRow.children[index]);
        }
      }
      let resizer = shell.querySelector("[data-tile-resizer='1']") as HTMLDivElement | null;
      if (!resizer) {
        resizer = document.createElement("div");
        resizer.dataset.tileResizer = "1";
        resizer.className = "absolute top-0 right-0 h-full w-1.5 cursor-col-resize bg-transparent hover:bg-zinc-700/60 transition-colors";
        shell.style.position = "relative";
        shell.appendChild(resizer);
      }
      resizer.style.display = index < order.length - 1 ? "block" : "none";
      if (resizer.style.display === "block") {
        const nextTileId = order[index + 1];
        resizer.onpointerdown = (event) => {
          event.preventDefault();
          const rowRect = tilesRow.getBoundingClientRect();
          const startX = event.clientX;
          const stateNow = controller.getState();
          const leftRatio = stateNow.workspaceTiles[tileId]?.widthRatio ?? 0.5;
          const rightRatio = stateNow.workspaceTiles[nextTileId]?.widthRatio ?? 0.5;
          const pair = leftRatio + rightRatio;
          const onMove = (moveEvent: PointerEvent) => {
            const dx = moveEvent.clientX - startX;
            const deltaRatio = dx / Math.max(1, rowRect.width);
            const nextLeft = Math.max(0.12, Math.min(pair - 0.12, leftRatio + deltaRatio));
            const nextRight = pair - nextLeft;
            controller.updateWorkspaceTileRatios({
              [tileId]: nextLeft,
              [nextTileId]: nextRight
            });
          };
          const onUp = () => {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
            savePersistedState();
          };
          window.addEventListener("pointermove", onMove);
          window.addEventListener("pointerup", onUp);
        };
      } else {
        resizer.onpointerdown = null;
      }
    }
    syncTileWidths();
  };

  const tileShellById = new Map<string, HTMLDivElement>();
  const tileHeaderById = new Map<string, HTMLDivElement>();
  const chartTileBodyByChartTileId = new Map<string, HTMLDivElement>();
  const chartTileTabById = new Map<string, HTMLDivElement>();
  const chartTileStageByChartTileId = new Map<string, { stage: HTMLDivElement; chartLayer: HTMLDivElement }>();
  const paneHostByPaneId = new Map<string, { stage: HTMLDivElement; chartLayer: HTMLDivElement }>();

  const createTileHeader = (label: string) => {
    const header = document.createElement("div");
    header.className = "h-8 shrink-0 border-b border-zinc-800/80 bg-zinc-950/95 px-2 flex items-center gap-2 text-[10px] uppercase tracking-wider text-zinc-400";
    const grip = document.createElement("span");
    grip.textContent = "⋮⋮";
    grip.className = "cursor-grab select-none text-zinc-600";
    const title = document.createElement("span");
    title.textContent = label;
    title.className = "truncate";
    header.append(grip, title);
    return header;
  };

  const createChartTabStrip = (chartTileId: string) => {
    const strip = document.createElement("div");
    strip.className = "h-8 shrink-0 border-b border-zinc-800/80 bg-zinc-950/95 px-1 flex items-center gap-1 overflow-x-auto";
    chartTileTabById.set(chartTileId, strip);
    return strip;
  };

  const ensureChartTileStage = (chartTileId: string) => {
    const existing = chartTileStageByChartTileId.get(chartTileId);
    if (existing) return existing;
    const tileStage = document.createElement("div");
    tileStage.className = "min-h-0 min-w-0 bg-chart-bg flex-shrink-0 relative overflow-hidden flex-1";
    const tileChartLayer = document.createElement("div");
    tileChartLayer.className = "absolute inset-0";
    tileStage.appendChild(tileChartLayer);
    chartTileStageByChartTileId.set(chartTileId, { stage: tileStage, chartLayer: tileChartLayer });
    return { stage: tileStage, chartLayer: tileChartLayer };
  };

  // Final assembly of UI pieces
  root.insertBefore(topHandle.root, mainRow);
  mainRow.insertBefore(stripHandle.root, tilesRow);

  let treeResizing = false;
  const onTreeResizeMouseMove = (event: MouseEvent) => {
    if (!treeResizing) return;
    const rect = mainRow.getBoundingClientRect();
    const width = rect.right - event.clientX;
    applyObjectTreeWidth(width);
    draw();
  };
  const onTreeResizeMouseUp = () => {
    if (!treeResizing) return;
    treeResizing = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    savePersistedState();
  };
  treeResizeHandle.addEventListener("mousedown", (event) => {
    event.preventDefault();
    treeResizing = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  });
  window.addEventListener("mousemove", onTreeResizeMouseMove);
  window.addEventListener("mouseup", onTreeResizeMouseUp);

  const setupCanvasBackingStore = () => {
    updateChartRuntimeLayout();
  };

  const createRuntimeForPane = (paneId: string): ChartPaneRuntime => {
    const container = document.createElement("div");
    container.className = "absolute overflow-hidden";
    const paneCanvas = document.createElement("canvas");
    paneCanvas.className = "block h-full w-full bg-transparent absolute inset-0";
    const paneCanvasId = `drishya-canvas-${paneId}-${Math.random().toString(36).slice(2, 10)}`;
    paneCanvas.id = paneCanvasId;
    container.appendChild(paneCanvas);

    const paneRaw = createWasmChart(paneCanvasId, 300, 300);
    const paneChart = new DrishyaChartClient(paneRaw);
    paneChart.setTheme(controller.getState().theme);
    try {
      paneChart.setAppearanceConfig(DEFAULT_APPEARANCE_CONFIG);
    } catch {
      // ignore unsupported appearance config in older wasm
    }
    const restoredPaneState = restoredPaneStatesByPane[paneId];
    if (restoredPaneState) {
      paneChart.restorePaneStateJson(restoredPaneState);
    }
    const restoredIndicators = restoredIndicatorsByPane[paneId] ?? [];
    for (const indicatorId of restoredIndicators) {
      applyBuiltInIndicator(paneChart, indicatorId);
    }

    const runtime: ChartPaneRuntime = {
      paneId,
      container,
      canvas: paneCanvas,
      viewport: { x: 0, y: 0, w: 0, h: 0 },
      rawChart: paneRaw,
      chart: paneChart,
      draw: () => paneChart.draw(),
      resize: (width: number, height: number) => paneChart.resize(width, height)
    };
    ensureRuntimeInteractions(runtime);
    return runtime;
  };

  let fastDrawRafId: number | null = null;
  const fastDrawTargets = new Set<string>();
  const flushFastDraw = () => {
    fastDrawRafId = null;
    if (fastDrawTargets.size === 0) return;
    for (const paneId of fastDrawTargets) {
      const runtime = chartRuntimes.get(paneId);
      runtime?.draw();
    }
    fastDrawTargets.clear();
  };
  const scheduleFastDrawPane = (paneId: string) => {
    if (!chartRuntimes.has(paneId)) return;
    fastDrawTargets.add(paneId);
    if (fastDrawRafId !== null) return;
    fastDrawRafId = requestAnimationFrame(flushFastDraw);
  };

  const ensureRuntimeInteractions = (runtime: ChartPaneRuntime) => {
    if (runtime.unbindInteractions) return;
    const paneId = runtime.paneId;
    runtime.unbindInteractions = bindWorkspaceInteractions({
      canvas: runtime.canvas,
      chart: runtime.chart,
      rawChart: runtime.rawChart,
      redraw: draw,
      redrawFast: () => scheduleFastDrawPane(paneId),
      getPaneLayouts: () => runtime.chart.paneLayouts(),
      controller,
      paneId,
      getPaneViewport: () => runtime.viewport ?? null,
      getWorkspaceViewport: () => {
        const hostStage = paneHostByPaneId.get(paneId)?.stage ?? stage;
        const stageRect = hostStage.getBoundingClientRect();
        return {
          x: 0,
          y: 0,
          w: Math.max(1, Math.floor(stageRect.width)),
          h: Math.max(1, Math.floor(stageRect.height))
        };
      },
      onSourceReadoutClick: () => {
        const symbols = options.marketControls?.symbols ?? [];
        if (symbols.length === 0) return;
        createSymbolSearchModal({
          symbols,
          onSelect: async (nextSymbol) => {
            controller.setChartPaneSource(paneId, { symbol: nextSymbol });
            await options.marketControls?.onChartPaneSourceChange?.(paneId, {
              symbol: nextSymbol,
              timeframe: controller.getState().chartPaneSources[paneId]?.timeframe
            });
            await options.marketControls?.onSymbolChange?.(nextSymbol);
          },
          onClose: () => { }
        });
      },
    });
  };

  const updateChartRuntimeLayout = () => {
    const state = controller.getState();
    const activePaneIds = new Set<string>();

    for (const [paneId, host] of paneHostByPaneId) {
      if (state.chartPanes[paneId]?.visible === false) continue;
      const stageRect = host.stage.getBoundingClientRect();
      const rect: LayoutRect = {
        x: 0,
        y: 0,
        w: Math.max(1, Math.floor(stageRect.width)),
        h: Math.max(1, Math.floor(stageRect.height))
      };
      activePaneIds.add(paneId);
      let runtime = chartRuntimes.get(paneId);
      if (!runtime) {
        runtime = createRuntimeForPane(paneId);
        chartRuntimes.set(paneId, runtime);
      }
      ensureRuntimeInteractions(runtime);
      if (runtime.container.parentElement !== host.chartLayer) {
        runtime.container.parentElement?.removeChild(runtime.container);
        host.chartLayer.appendChild(runtime.container);
      }
      runtime.container.style.left = "0px";
      runtime.container.style.top = "0px";
      runtime.container.style.width = `${rect.w}px`;
      runtime.container.style.height = `${rect.h}px`;
      runtime.viewport = rect;

      const dpr = Math.max(1, window.devicePixelRatio || 1);
      const width = Math.max(300, Math.floor(rect.w));
      const height = Math.max(300, Math.floor(rect.h));
      runtime.canvas.width = Math.floor(width * dpr);
      runtime.canvas.height = Math.floor(height * dpr);
      const ctx = runtime.canvas.getContext("2d");
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      runtime.resize(width, height);
    }

    for (const [paneId, runtime] of chartRuntimes) {
      if (activePaneIds.has(paneId)) continue;
      runtime.unbindInteractions?.();
      if (runtime.container.parentElement) {
        runtime.container.parentElement.removeChild(runtime.container);
      }
      chartRuntimes.delete(paneId);
    }
  };

  const clearDrawings = () => {
    const runtime = getActiveRuntime();
    if (!runtime) return;
    runtime.chart.clearDrawings();
    if (typeof runtime.rawChart.cancel_drawing_interaction === "function") {
      runtime.rawChart.cancel_drawing_interaction();
    }
    controller.setActiveTool("select");
  };

  let configPanelEl: HTMLElement | null = null;
  let configPanelDrawingId: number | null = null;

  const refreshConfigPanel = () => {
    const activeChart = getActiveRuntime()?.chart ?? getPrimaryRuntime()?.chart;
    if (!activeChart) return;
    const id = activeChart.selectedDrawingId();
    if (id === null) {
      if (configPanelEl) {
        configPanelEl.remove();
        configPanelEl = null;
        configPanelDrawingId = null;
      }
      return;
    }
    const config = activeChart.getSelectedDrawingConfig();
    if (!config) {
      if (configPanelEl) {
        configPanelEl.remove();
        configPanelEl = null;
        configPanelDrawingId = null;
      }
      return;
    }
    if (configPanelEl && configPanelDrawingId === id) return;
    if (configPanelEl) configPanelEl.remove();
    configPanelEl = createDrawingConfigPanel({
      chart: activeChart,
      drawingId: id,
      config,
      onMutate: draw,
      onClose: () => {
        activeChart.clearSelectedDrawing();
        draw();
      }
    });
    configPanelDrawingId = id;
    configPanelOverlay.appendChild(configPanelEl);
  };

  const updateTextCaret = () => {
    const bounds = getActiveRuntime()?.chart.selectedTextCaretBounds?.() ?? null;
    caretOverlay.innerHTML = "";
    if (bounds) {
      const caret = document.createElement("div");
      caret.style.position = "absolute";
      caret.style.left = `${bounds.x}px`;
      caret.style.top = `${bounds.y}px`;
      caret.style.width = "2px";
      caret.style.height = `${bounds.height}px`;
      caret.style.backgroundColor = bounds.color;
      caret.style.animation = "drishya-caret-blink 1s step-end infinite";
      caret.style.pointerEvents = "none";
      caretOverlay.appendChild(caret);
      caretOverlay.style.display = "";
    } else {
      caretOverlay.style.display = "none";
    }
  };

  const draw = () => {
    for (const runtime of chartRuntimes.values()) {
      runtime.draw();
    }
    treeHandle.refresh();
    refreshConfigPanel();
    updateTextCaret();
    savePersistedState();
  };

  const drawFast = () => {
    for (const paneId of chartRuntimes.keys()) {
      scheduleFastDrawPane(paneId);
    }
  };

  const syncReadoutSourceLabel = (state: ReturnType<typeof controller.getState>) => {
    for (const paneId of chartRuntimes.keys()) {
      const runtime = getRuntime(paneId);
      if (!runtime) continue;
      const source = state.chartPaneSources[paneId] ?? {};
      const symbol = source.symbol ?? options.marketControls?.selectedSymbol ?? "";
      const timeframe = source.timeframe ?? options.marketControls?.selectedTimeframe ?? "";
      const label = [symbol, timeframe].filter(Boolean).join(" · ");
      runtime.chart.setReadoutSourceLabel(label);
    }
  };

  const unbindInteractions = () => {
    for (const runtime of chartRuntimes.values()) {
      runtime.unbindInteractions?.();
    }
  };

  // Controller subscriptions
  const applyToolToChart = (tool: string) => {
    const activeChart = getActiveRuntime()?.chart ?? getPrimaryRuntime()?.chart;
    if (!activeChart) return;
    if (tool === "crosshair" || tool === "dot" || tool === "normal") {
      activeChart.setCursorMode(tool);
      if (tool === "normal") {
        activeChart.setDrawingTool("select");
      }
      return;
    }
    try {
      activeChart.setDrawingTool(tool);
    } catch (err) {
      console.warn(`[workspace] failed to set drawing tool '${tool}', falling back to select`, err);
      activeChart.setDrawingTool("select");
    }
  };

  let lastLayoutJson = "";
  const syncChartPaneContracts = (state: ReturnType<typeof controller.getState>) => {
    const chartPaneViewports: Record<string, { x: number; y: number; w: number; h: number }> = {};
    const paneChartPaneMap: Record<string, string> = {};

    for (const [paneId, host] of paneHostByPaneId) {
      const chartPane = state.chartPanes[paneId];
      if (chartPane && chartPane.visible === false) continue;
      const hostRect = host.stage.getBoundingClientRect();
      const rect: LayoutRect = {
        x: 0,
        y: 0,
        w: Math.max(1, Math.floor(hostRect.width)),
        h: Math.max(1, Math.floor(hostRect.height))
      };
      chartPaneViewports[paneId] = {
        x: rect.x,
        y: rect.y,
        w: rect.w,
        h: rect.h
      };
      const scopedPanes = computeIndicatorRectsForChartPane(
        state.paneLayout,
        paneId,
        rect
      );
      for (const scoped of scopedPanes) {
        paneChartPaneMap[scoped.paneId] = paneId;
      }
    }

    for (const runtime of chartRuntimes.values()) {
      runtime.chart.setChartPaneViewports(chartPaneViewports);
      runtime.chart.setPaneChartPaneMap(paneChartPaneMap);
    }
  };

  const unsubscribe = controller.subscribe((state) => {
    const layout = state.paneLayout;
    const currentLayoutJson = JSON.stringify({
      theme: state.theme,
      tool: state.activeTool,
      cursor: state.cursorMode,
      axis: state.priceAxisMode,
      activeChartPaneId: state.activeChartPaneId,
      chartPaneSources: state.chartPaneSources,
      objectTreeOpen: state.isObjectTreeOpen,
      objectTreeWidth,
      ratios: layout.ratios,
      order: layout.order,
      visibility: layout.visibility,
      collapsed: layout.collapsed
    });

    if (currentLayoutJson !== lastLayoutJson) {
      lastLayoutJson = currentLayoutJson;
      for (const runtime of chartRuntimes.values()) {
        runtime.chart.setTheme(state.theme);
      }
      applyToolToChart(state.activeTool);
      const activeChart = getActiveRuntime()?.chart ?? getPrimaryRuntime()?.chart;
      if (!activeChart) return;
      activeChart.setCursorMode(state.cursorMode);
      activeChart.setPriceAxisMode(state.priceAxisMode);
      const objectsTileId = state.workspaceTileOrder.find((tileId) => state.workspaceTiles[tileId]?.kind === "objects");
      if (objectsTileId && state.workspaceTiles[objectsTileId]) {
        const objectsTile = state.workspaceTiles[objectsTileId];
        if (state.isObjectTreeOpen && objectsTile.widthRatio < 0.12) {
          controller.setWorkspaceTileWidthRatio(objectsTileId, 0.2);
        }
      }
      renderWorkspaceTiles();
      syncChartPaneContracts(state);
      syncReadoutSourceLabel(state);
      updateChartRuntimeLayout();

      const raw = getActiveRuntime()?.rawChart ?? getPrimaryRuntime()?.rawChart;
      if (!raw) {
        draw();
        savePersistedState();
        return;
      }
      const namedOrder = state.paneLayout.order.filter((id) => {
        if (id === "price") return false;
        const kind = state.paneLayout.panes[id]?.kind;
        return kind === "indicator" || kind === "custom";
      });
      raw.set_pane_order_json?.(JSON.stringify(namedOrder));
      const registeredPanes = (() => {
        const json = raw.registered_panes_json?.();
        if (!json) return [] as string[];
        try {
          const parsed = JSON.parse(json);
          return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
        } catch {
          return [] as string[];
        }
      })();
      for (const paneId of registeredPanes) {
        if (!namedOrder.includes(paneId)) {
          raw.unregister_pane?.(paneId);
        }
      }
      for (const id of namedOrder) {
        raw.register_pane?.(id);
        raw.set_pane_visible?.(id, !!state.paneLayout.visibility[id]);
        raw.set_pane_collapsed?.(id, !!state.paneLayout.collapsed[id]);
      }

      const weightMap: Record<string, number> = {};
      for (const id of ["price", ...namedOrder]) {
        if (state.paneLayout.visibility[id] && !state.paneLayout.collapsed[id]) {
          weightMap[id] = state.paneLayout.ratios[id] || 0;
        }
      }
      const weightSum = Object.values(weightMap).reduce((sum, weight) => sum + Math.max(0, weight), 0);
      if (weightSum > 0) {
        for (const id of Object.keys(weightMap)) {
          weightMap[id] = Math.max(0, weightMap[id]) / weightSum;
        }
      } else {
        weightMap.price = 1;
      }
      activeChart.setPaneWeights(weightMap);
      draw();
      savePersistedState();
    }
  });

  // hotkeyToolMap
  const hotkeyToolMap: Record<string, DrawingToolId> = {};
  for (const tool of WORKSPACE_DRAW_TOOLS) {
    if (tool.children && Array.isArray(tool.children)) {
      for (const child of tool.children) {
        hotkeyToolMap[child.hotkey.toLowerCase()] = child.id as DrawingToolId;
      }
    } else {
      hotkeyToolMap[tool.hotkey.toLowerCase()] = tool.id as DrawingToolId;
    }
  }

  const onKeyDown = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null;
    const isEditableTarget =
      !!target &&
      (target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable);
    if (isEditableTarget) return;

    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const key = event.key;

    // Inline text editing: when a Text drawing is selected and not locked, type directly
    const activeChart = getActiveRuntime()?.chart ?? getPrimaryRuntime()?.chart;
    if (!activeChart) return;
    const selectedId = activeChart.selectedDrawingId();
    if (selectedId !== null) {
      const config = activeChart.getSelectedDrawingConfig();
      const isTextDrawing =
        config && typeof config.text_content === "string" && !config.locked;
      if (isTextDrawing && config) {
        let text = config.text_content ?? "";
        if (event.key === "Escape") {
          activeChart.clearSelectedDrawing();
          draw();
          event.preventDefault();
          return;
        }
        if (event.key === "Backspace") {
          text = text.slice(0, -1);
          activeChart.setDrawingConfig(selectedId, { text_content: text });
          draw();
          event.preventDefault();
          return;
        }
        // Delete is not intercepted here; it falls through to delete the drawing
        if (event.key === "Enter") {
          text += "\n";
          activeChart.setDrawingConfig(selectedId, { text_content: text });
          draw();
          event.preventDefault();
          return;
        }
        if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
          text += key;
          activeChart.setDrawingConfig(selectedId, { text_content: text });
          draw();
          event.preventDefault();
          return;
        }
      }
    }

    const keyLower = key.toLowerCase();
    const mode = hotkeyToolMap[keyLower];
    if (mode) {
      event.preventDefault();
      const m = mode as string;
      if (m === "crosshair" || m === "dot" || m === "normal") {
        controller.setCursorMode(m as any);
        if (m === "normal") controller.setActiveTool("select");
      } else {
        controller.setActiveTool(mode, { force: true });
      }
      return;
    }

    if (keyLower === "c") {
      clearDrawings();
      draw();
      return;
    }

    if (event.key === "Escape") {
      const activeRaw = getActiveRuntime()?.rawChart ?? getPrimaryRuntime()?.rawChart;
      if (activeRaw && typeof activeRaw.cancel_drawing_interaction === "function") {
        activeRaw.cancel_drawing_interaction();
      }
      activeChart.clearSelectedDrawing();
      activeChart.clearSelectedSeries();
      controller.setActiveTool("select", { force: true });
      draw();
      return;
    }

    if (event.key === "Backspace" || event.key === "Delete") {
      if (activeChart.deleteSelectedDrawing() || activeChart.deleteSelectedSeries()) {
        event.preventDefault();
        draw();
      }
      return;
    }

    if (keyLower === "t") {
      controller.toggleTheme();
    }
  };
  window.addEventListener("keydown", onKeyDown);

  let resizeObserver: ResizeObserver | null = null;
  if (typeof ResizeObserver === "function") {
    resizeObserver = new ResizeObserver(() => {
      setupCanvasBackingStore();
      draw();
    });
    resizeObserver.observe(tilesRow);
  } else {
    window.addEventListener("resize", setupCanvasBackingStore);
  }

  renderWorkspaceTiles();
  setupCanvasBackingStore();
  syncReadoutSourceLabel(controller.getState());
  getActiveRuntime()?.chart.setDrawingTool(controller.getState().activeTool);
  draw();

  const applyAppearanceConfig = (config: { background: string; candle_up: string; candle_down: string }) => {
    try {
      for (const runtime of chartRuntimes.values()) {
        runtime.chart.setAppearanceConfig(config);
      }
      draw();
    } catch {
      // invalid config - fail gracefully
    }
  };

  const getAppearanceConfig = () => getActiveRuntime()?.chart.getAppearanceConfig() ?? getPrimaryRuntime()?.chart.getAppearanceConfig() ?? null;

  return {
    root: root as HTMLDivElement,
    strip: stripHandle.root,
    tree: treeHandle.root,
    controller,
    replay,
    draw,
    applyAppearanceConfig,
    getAppearanceConfig,
    resize: () => {
      setupCanvasBackingStore();
      draw();
    },
    setTool: (toolId) => controller.setActiveTool(toolId),
    clearDrawings,
    toggleTheme: () => controller.toggleTheme(),
    refreshObjectTree: treeHandle.refresh,
    listCharts: () => Object.keys(controller.getState().chartPanes),
    getChart: (chartPaneId) => getRuntime(chartPaneId),
    getActiveChart: () => chartRuntimes.get(controller.getState().activeChartPaneId) ?? null,
    destroy: () => {
      if (configPanelEl) configPanelEl.remove();
      unsubscribe();
      replay.destroy();
      controller.setReplayController(null);
      topHandle.destroy();
      stripHandle.destroy();
      treeHandle.destroy();
      unbindInteractions();
      window.removeEventListener("mousemove", onTreeResizeMouseMove);
      window.removeEventListener("mouseup", onTreeResizeMouseUp);
      window.removeEventListener("keydown", onKeyDown);
      if (resizeObserver) {
        resizeObserver.disconnect();
      } else {
        window.removeEventListener("resize", setupCanvasBackingStore);
      }
      if (fastDrawRafId !== null) {
        cancelAnimationFrame(fastDrawRafId);
        fastDrawRafId = null;
      }
      fastDrawTargets.clear();
      for (const runtime of chartRuntimes.values()) {
        runtime.unbindInteractions?.();
      }
      chartRuntimes.clear();
      host.innerHTML = "";
    }
  };
}

function ensureWorkspaceStyles(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(WORKSPACE_STYLE_LINK_ID)) return;

  const link = document.createElement("link");
  link.id = WORKSPACE_STYLE_LINK_ID;
  link.rel = "stylesheet";
  link.href = new URL("./styles.css", import.meta.url).href;
  document.head.appendChild(link);
}

function ensureHostHasViewport(host: HTMLElement): void {
  if (!host.style.width) {
    host.style.width = "100%";
  }
  if (!host.style.height) {
    host.style.height = "100vh";
  }
  host.style.overflow = "hidden";
}

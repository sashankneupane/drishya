import type { DrawingToolId } from "../toolbar/model.js";
import type { ChartAppearanceConfig, SeriesStyleOverride } from "../wasm/contracts.js";
import type { Candle } from "../wasm/contracts.js";
import type { LayoutRect } from "../layout/splitTree.js";
import { DrishyaChartClient } from "../wasm/client.js";
import { DEFAULT_APPEARANCE_CONFIG, WORKSPACE_DRAW_TOOLS } from "./constants.js";
import { createDrawingConfigPanel } from "./components/DrawingConfigPanel.js";
import { createConfigModal } from "./ConfigModal.js";
import { bindWorkspaceInteractions } from "./interactions.js";
import { createLeftStrip } from "./leftStrip.js";
import { computeIndicatorRectsForChartPane } from "./layout/index.js";
import type { ObjectTreePanelHandle } from "./objectTreePanel.js";
import { makeSvgIcon } from "./icons.js";
import { createSymbolSearchModal } from "./SymbolSearchModal.js";
import { createIndicatorModal } from "./IndicatorModal.js";
import { createIndicatorConfigModal } from "./IndicatorConfigModal.js";
import {
  applyIndicatorParams,
  applyIndicatorSetToChart,
  defaultIndicatorParams,
  defaultIndicatorToken,
  findTokenParamsForSeriesId,
} from "./indicatorRuntime.js";
import { canonicalRuntimePaneId } from "./paneSpec.js";
import { createTopStrip } from "./topStrip.js";
import {
  canonicalIndicatorId,
  decodeIndicatorToken,
  encodeIndicatorToken,
  isSameIndicatorInstance,
  isSeriesInIndicatorFamily,
  normalizeIndicatorIds,
  parseIndicatorParamsFromSeriesId,
} from "./indicatorIdentity.js";
import {
  buildChartLayoutTree,
  deriveActivePaneIdFromPersistedTiles,
  deriveChartPanesFromPersistedTiles,
  normalizePersistedChartTileConfig,
  normalizePersistedChartTiles,
  type PersistedChartTileConfig,
  type PersistedChartTileStoredShape,
} from "./persistenceHelpers.js";
import { ReplayController } from "./replay/ReplayController.js";
import type { ChartPaneRuntime } from "./runtimeTypes.js";
import { createWorkspaceIntentController } from "./workspaceIntentController.js";
import { WorkspaceController } from "./WorkspaceController.js";
import { syncChartPaneContracts } from "./paneContracts.js";
import { reconcilePaneSpecsForRuntime } from "./paneSpecReconcile.js";
import { createTileObjectTreeHandle } from "./objectTreeHandleFactory.js";
import { getActiveTab } from "./chartTileSelection.js";
import { getActiveChartForTileFromState, getChartsForTileFromState } from "./runtimeSelection.js";
import { applyIndicatorsToTileCharts } from "./indicatorTileSync.js";
import { initializeChartTileSourceState } from "./chartTileSourceInit.js";
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
  candleStyle?: string;
  cursorMode?: string;
  isObjectTreeOpen?: boolean;
  objectTreeWidth?: number;
  isLeftStripOpen?: boolean;
  priceAxisMode?: "linear" | "log" | "percent";
  workspaceTiles?: Record<string, { id: string; kind: "chart" | "objects"; title: string; widthRatio: number; chartTileId?: string }>;
  workspaceTileOrder?: string[];
  chartTiles?: Record<string, PersistedChartTileStoredShape>;
  activeChartTileId?: string;
  paneLayout?: WorkspacePaneLayoutState;
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
  let restoredIndicatorStyleOverridesByPane: Record<string, Record<string, SeriesStyleOverride>> = {};
  const chartTileIndicatorState = new Map<string, string[]>();
  const latestCandlesByPane = new Map<string, { latest: Candle; prevClose: number | null }>();
  const chartTileTreeOpen = new Map<string, boolean>();

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
  // Keep a mounted fallback stage so wasm chart creation always has a DOM canvas target.
  stage.style.display = "none";
  tilesRow.appendChild(stage);
  root.appendChild(mainRow);
  host.appendChild(root);

  // WASM Chart setup - NOW canvas is in DOM
  const primaryRawChart = createWasmChart(canvasId, 300, 300);
  const primaryChart = new DrishyaChartClient(primaryRawChart);
  const primarySetCandles = primaryChart.setCandles.bind(primaryChart);
  const primarySnapshotIndicatorIds = () => {
    const indicators = primaryChart.readoutSnapshot()?.indicators ?? [];
    const out: string[] = [];
    const seen = new Set<string>();
    for (const item of indicators) {
      const id = canonicalIndicatorId(item.id.split(":")[0] ?? "");
      if (!id) continue;
      const token = encodeIndicatorToken(id, parseIndicatorParamsFromSeriesId(id, item.id));
      if (!seen.has(token)) {
        seen.add(token);
        out.push(token);
      }
    }
    return out;
  };
  primaryChart.setCandles = (candles: Candle[]) => {
    const beforeIndicatorIds = primarySnapshotIndicatorIds();
    primarySetCandles(candles);
    if (!candles.length) {
      latestCandlesByPane.delete("price");
      return;
    }
    latestCandlesByPane.set("price", {
      latest: candles[candles.length - 1],
      prevClose: candles.length > 1 ? candles[candles.length - 2].close : null
    });
    const afterIndicatorIds = primarySnapshotIndicatorIds();
    if (beforeIndicatorIds.length && afterIndicatorIds.length === 0) {
      applyIndicatorSetToChart(primaryChart, beforeIndicatorIds);
    }
  };
  const primaryAppendCandle = primaryChart.appendCandle.bind(primaryChart);
  primaryChart.appendCandle = (candle: Candle) => {
    const prevClose = latestCandlesByPane.get("price")?.latest.close ?? null;
    primaryAppendCandle(candle);
    latestCandlesByPane.set("price", { latest: candle, prevClose });
  };
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

  const applyIndicatorSetToTile = (chartTileId: string) => {
    const ids = chartTileIndicatorState.get(chartTileId) ?? [];
    const chartTile = controller.getState().chartTiles[chartTileId];
    applyIndicatorsToTileCharts({
      chartTile,
      indicatorIds: ids,
      controller,
      getRuntime,
      applyIndicatorSetToChart,
      reconcilePaneSpecsForRuntime,
    });
  };

  const getActiveChartForTile = (chartTileId: string): DrishyaChartClient | null => {
    return getActiveChartForTileFromState(controller.getState(), chartTileId, getRuntime);
  };

  const getChartsForTile = (chartTileId: string): DrishyaChartClient[] => {
    return getChartsForTileFromState(controller.getState(), chartTileId, getRuntime);
  };

  const workspaceIntents = createWorkspaceIntentController({
    controller,
    chartTileIndicatorState,
    getChartForTile: getActiveChartForTile,
    getChartsForTile,
    applyIndicatorSetToTile,
    savePersistedState: () => savePersistedStateImmediate(),
  });

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
        const persistedChartTiles = normalizePersistedChartTiles(saved.chartTiles);
        if (
          saved.workspaceTiles &&
          saved.workspaceTileOrder &&
          Object.keys(persistedChartTiles).length > 0
        ) {
          const derivedChartPanes = deriveChartPanesFromPersistedTiles(persistedChartTiles);
          const derivedActivePaneId = deriveActivePaneIdFromPersistedTiles(
            persistedChartTiles,
            saved.activeChartTileId
          );
          controller.loadChartLayout(
            derivedChartPanes,
            buildChartLayoutTree(Object.keys(derivedChartPanes)),
            derivedActivePaneId
          );
          const runtimeChartTiles = Object.fromEntries(
            Object.entries(persistedChartTiles).map(([id, tile]) => [
              id,
              {
                id: tile.id,
                tabs: tile.tabs,
                activeTabId: tile.activeTabId,
              },
            ])
          );
          controller.loadWorkspaceTiles?.(
            saved.workspaceTiles as any,
            saved.workspaceTileOrder,
            runtimeChartTiles as any,
            saved.activeChartTileId
          );
        }
        for (const [chartTileId, tile] of Object.entries(persistedChartTiles)) {
          const tileCfg = normalizePersistedChartTileConfig(tile.config);
          chartTileTreeOpen.set(chartTileId, tileCfg.treeOpen === true);
          chartTileIndicatorState.set(chartTileId, tileCfg.indicators ?? []);
          for (const [paneId, source] of Object.entries(tileCfg.paneSourcesByPane ?? {})) {
            controller.setChartPaneSource(paneId, {
              symbol: source?.symbol,
              timeframe:
                source?.timeframe ??
                options.marketControls?.selectedTimeframe ??
                options.marketControls?.timeframes?.[0],
            });
          }
          for (const [paneId, paneState] of Object.entries(tileCfg.paneStateByPane ?? {})) {
            restoredPaneStatesByPane[paneId] = paneState ?? null;
          }
          for (const [paneId, styleMap] of Object.entries(tileCfg.indicatorStyleOverridesByPane ?? {})) {
            restoredIndicatorStyleOverridesByPane[paneId] = styleMap ?? {};
            const runtime = chartRuntimes.get(paneId);
            if (runtime) {
              for (const [seriesId, style] of Object.entries(styleMap ?? {})) {
                runtime.chart.setSeriesStyleOverride(seriesId, style);
              }
            }
          }
        }

        if (saved.appearance) applyAppearance(saved.appearance);
        const validStyle = saved.candleStyle as "solid" | "hollow" | "bars" | "volume" | undefined;
        if (validStyle && ["solid", "hollow", "bars", "volume"].includes(validStyle)) {
          getPrimaryRuntime()?.chart.setCandleStyle(validStyle);
        }
      }
    } catch {
      // ignore corrupt or incompatible persisted data
    }
  }

  let persistTimer: ReturnType<typeof setTimeout> | null = null;
  const DEBOUNCE_PERSIST_MS = 400;
  const persistNow = () => {
    if (!persistKey || typeof localStorage === "undefined") return;
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    try {
      const persistedChartTiles: Record<string, PersistedChartTileStoredShape> = {};
      for (const [chartTileId, chartTile] of Object.entries(controller.getState().chartTiles)) {
        const activeTab = chartTile.tabs.find((tab) => tab.id === chartTile.activeTabId) ?? null;
        const orderedTabs = activeTab ? [activeTab, ...chartTile.tabs.filter((tab) => tab.id !== activeTab.id)] : chartTile.tabs;
        const runtime = orderedTabs.map((tab) => chartRuntimes.get(tab.chartPaneId)).find((value): value is ChartPaneRuntime => !!value) ?? null;
        const tilePaneState = runtime?.chart.getPaneStateJson() ?? null;
        const tileIndicators = normalizeIndicatorIds(chartTileIndicatorState.get(chartTileId) ?? []);
        const paneSourcesByPane: Record<string, { symbol?: string; timeframe?: string }> = {};
        const paneStateByPane: Record<string, string | null> = {};
        const indicatorStyleOverridesByPane: Record<string, Record<string, SeriesStyleOverride>> = {};
        for (const tab of chartTile.tabs) {
          const src = controller.getState().chartPaneSources[tab.chartPaneId] ?? {};
          paneSourcesByPane[tab.chartPaneId] = {
            symbol: src.symbol ?? tab.title,
            timeframe:
              src.timeframe ??
              options.marketControls?.selectedTimeframe ??
              options.marketControls?.timeframes?.[0],
          };
          paneStateByPane[tab.chartPaneId] = chartRuntimes.get(tab.chartPaneId)?.chart.getPaneStateJson() ?? tilePaneState;
          indicatorStyleOverridesByPane[tab.chartPaneId] =
            chartRuntimes.get(tab.chartPaneId)?.chart.allSeriesStyleOverrides() ?? {};
        }
        persistedChartTiles[chartTileId] = {
          id: chartTile.id,
          tabs: chartTile.tabs.map((tab) => ({ id: tab.id, title: tab.title, chartPaneId: tab.chartPaneId })),
          activeTabId: chartTile.activeTabId,
          config: {
            paneSourcesByPane,
            paneStateByPane,
            indicators: tileIndicators,
            indicatorStyleOverridesByPane,
            treeOpen: chartTileTreeOpen.get(chartTileId) === true
          }
        };
      }
      const state: PersistedWorkspaceState = {
        theme: controller.getState().theme,
        cursorMode: controller.getState().cursorMode,
        isObjectTreeOpen: controller.getState().isObjectTreeOpen,
        objectTreeWidth,
        isLeftStripOpen: controller.getState().isLeftStripOpen,
        priceAxisMode: controller.getState().priceAxisMode,
        candleStyle: getActiveRuntime()?.chart.candleStyle() ?? getPrimaryRuntime()?.chart.candleStyle(),
        appearance: getActiveRuntime()?.chart.getAppearanceConfig() ?? getPrimaryRuntime()?.chart.getAppearanceConfig() ?? undefined,
        workspaceTiles: controller.getState().workspaceTiles,
        workspaceTileOrder: controller.getState().workspaceTileOrder,
        chartTiles: persistedChartTiles,
        activeChartTileId: controller.getState().activeChartTileId,
        paneLayout: controller.getState().paneLayout,
      };
      localStorage.setItem(persistKey, JSON.stringify(state));
    } catch {
      // ignore quota or parse errors
    }
  };
  const savePersistedState = () => {
    if (!persistKey || typeof localStorage === "undefined") return;
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      persistTimer = null;
      persistNow();
    }, DEBOUNCE_PERSIST_MS);
  };
  const savePersistedStateImmediate = () => {
    persistNow();
  };

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

  const initializeChartTileSource = async (chartTileId: string) => {
    const { paneId, symbol, timeframe } = initializeChartTileSourceState({
      chartTileId,
      controller,
      marketControls: options.marketControls,
    });
    if (paneId && symbol) {
      await options.marketControls?.onChartPaneSourceChange?.(paneId, { symbol, timeframe });
      await options.marketControls?.onSymbolChange?.(symbol);
    }
  };

  const topHandle = createTopStrip({
    chart: chartFacade,
    controller,
    getAppearanceConfig: () => getActiveRuntime()?.chart.getAppearanceConfig() ?? getPrimaryRuntime()?.chart.getAppearanceConfig() ?? null,
    getCandleStyle: () => {
      const value = getActiveRuntime()?.chart.candleStyle() ?? getPrimaryRuntime()?.chart.candleStyle() ?? null;
      return value === "solid" || value === "hollow" || value === "bars" || value === "volume"
        ? value
        : null;
    },
    applyAppearanceConfig: (cfg) => {
      applyAppearanceConfig(cfg);
      savePersistedState();
    },
    applyCandleStyle: (style) => {
      getActiveRuntime()?.chart.setCandleStyle(style);
      getActiveRuntime()?.chart.draw();
      savePersistedState();
    },
    onAddChartTile: async () => {
      const chartTileId = controller.addChartTile();
      await initializeChartTileSource(chartTileId);
      draw();
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
    onMutate: () => draw()
  });

  const stripHandle = createLeftStrip({
    tools: WORKSPACE_DRAW_TOOLS,
    controller,
    drawingToolsEnabled: typeof getPrimaryRuntime()?.rawChart.set_drawing_tool_mode === "function",
    onAddChartTile: async () => {
      const chartTileId = controller.addChartTile();
      await initializeChartTileSource(chartTileId);
      draw();
    },
    onOpenSettings: () => {
      const current = getActiveRuntime()?.chart.getAppearanceConfig() ?? getPrimaryRuntime()?.chart.getAppearanceConfig() ?? {
        background: "#030712",
        candle_up: "#22c55e",
        candle_down: "#ef4444"
      };
      createConfigModal({
        initialConfig: current,
        initialCandleStyle: (getActiveRuntime()?.chart.candleStyle() ?? getPrimaryRuntime()?.chart.candleStyle() ?? "solid") as "solid" | "hollow" | "bars" | "volume",
        onApply: (cfg, candleStyle) => {
          applyAppearanceConfig(cfg);
          getActiveRuntime()?.chart.setCandleStyle(candleStyle);
          draw();
        },
        onClose: () => { }
      });
    },
    onClear: () => {
      clearDrawings();
      draw();
    }
  });

  const treeHandleByChartTileId = new Map<string, ObjectTreePanelHandle>();
  const openIndicatorConfig = (target: { paneId?: string; seriesId?: string; indicatorId?: string }, chartHint?: DrishyaChartClient | null) => {
    const chart = chartHint ?? getActiveRuntime()?.chart ?? getPrimaryRuntime()?.chart ?? null;
    if (!chart) return;
    const runtime = [...chartRuntimes.values()].find((entry) => entry.chart === chart) ?? null;
    const snapshot = chart.readoutSnapshot();
    const rawIndicatorId =
      target.indicatorId ??
      (target.seriesId ? target.seriesId.split(":")[0] : undefined) ??
      snapshot?.indicators.find((item) => item.pane_id === target.paneId)?.id.split(":")[0];
    const indicatorId = canonicalIndicatorId(rawIndicatorId ?? "");
    if (!indicatorId) return;
    const catalog = chart.indicatorCatalog();
    const catalogEntry =
      catalog.find((item) => canonicalIndicatorId(item.id) === indicatorId) ??
      catalog.find((item) => item.id === indicatorId) ??
      null;
    const indicatorName =
      snapshot?.indicators.find((item) => canonicalIndicatorId(item.id.split(":")[0]) === indicatorId)?.name ??
      catalogEntry?.display_name ??
      indicatorId.toUpperCase();
    const initialTokenParams = findTokenParamsForSeriesId(
      chartTileIndicatorState,
      runtime?.chartTileId,
      indicatorId,
      target.seriesId
    );
    createIndicatorConfigModal({
      indicatorId,
      indicatorName,
      indicatorCatalogEntry: catalogEntry,
      initialParams: {
        ...(defaultIndicatorParams(chart, indicatorId) as Record<string, unknown>),
        ...(initialTokenParams as Record<string, unknown>),
      } as Record<string, string | number | boolean>,
      onApplyParams: (params) => {
        const targetInstanceParams =
          (initialTokenParams as Record<string, unknown>)?.__instance != null
            ? { __instance: (initialTokenParams as Record<string, unknown>).__instance }
            : parseIndicatorParamsFromSeriesId(indicatorId, target.seriesId);
        const nextWithInstance = {
          ...params,
          ...(typeof targetInstanceParams.__instance === "string" ? { __instance: targetInstanceParams.__instance } : {}),
        };
        const applyTargets = new Set<DrishyaChartClient>();
        if (runtime?.chartTileId) {
          const tile = controller.getState().chartTiles[runtime.chartTileId];
          for (const tab of tile?.tabs ?? []) {
            const tabRuntime = getRuntime(tab.chartPaneId);
            if (tabRuntime?.chart) applyTargets.add(tabRuntime.chart);
          }
        }
        if (!applyTargets.size) applyTargets.add(chart);
        let anyApplied = false;
        for (const targetChart of applyTargets) {
          anyApplied = applyIndicatorParams(targetChart, indicatorId, nextWithInstance, target.seriesId) || anyApplied;
          if (runtime?.chartTileId) {
            const tile = controller.getState().chartTiles[runtime.chartTileId];
            for (const tab of tile?.tabs ?? []) {
              if (getRuntime(tab.chartPaneId)?.chart === targetChart) {
                reconcilePaneSpecsForRuntime({ ownerChartPaneId: tab.chartPaneId, chart: targetChart, controller });
              }
            }
          }
        }
        if (anyApplied) {
          if (runtime?.chartTileId) {
            const current = chartTileIndicatorState.get(runtime.chartTileId) ?? [];
            const targetParams = parseIndicatorParamsFromSeriesId(indicatorId, target.seriesId);
            let replaced = false;
            const next = current.map((token) => {
              if (replaced) return token;
              const decoded = decodeIndicatorToken(token);
              if (decoded.indicatorId !== canonicalIndicatorId(indicatorId)) return token;
              if (
                typeof targetInstanceParams.__instance === "string" &&
                typeof decoded.params?.__instance === "string"
              ) {
                if (decoded.params.__instance !== targetInstanceParams.__instance) return token;
                replaced = true;
                return encodeIndicatorToken(indicatorId, nextWithInstance as Record<string, unknown>);
              }
              if (JSON.stringify(decoded.params ?? {}) !== JSON.stringify(targetParams ?? {})) return token;
              replaced = true;
              return encodeIndicatorToken(indicatorId, nextWithInstance as Record<string, unknown>);
            });
            if (!replaced) {
              next.push(encodeIndicatorToken(indicatorId, nextWithInstance as Record<string, unknown>));
            }
            chartTileIndicatorState.set(runtime.chartTileId, normalizeIndicatorIds(next));
          }
          savePersistedStateImmediate();
          draw();
        }
      },
      styleSeries: chart
        .seriesStyleSnapshot()
        .filter((item) => {
          if (!target.seriesId) return isSeriesInIndicatorFamily(indicatorId, item.series_id);
          return isSameIndicatorInstance(indicatorId, target.seriesId, item.series_id);
        }),
      onApplySeriesStyle: (seriesId, style) => {
        const applyTargets = new Set<DrishyaChartClient>();
        if (runtime?.chartTileId) {
          const tile = controller.getState().chartTiles[runtime.chartTileId];
          for (const tab of tile?.tabs ?? []) {
            const tabRuntime = getRuntime(tab.chartPaneId);
            if (tabRuntime?.chart) applyTargets.add(tabRuntime.chart);
          }
        }
        if (!applyTargets.size) applyTargets.add(chart);
        for (const targetChart of applyTargets) {
          targetChart.setSeriesStyleOverride(seriesId, style);
        }
        savePersistedStateImmediate();
        draw();
      },
      onResetSeriesStyle: (seriesId) => {
        const applyTargets = new Set<DrishyaChartClient>();
        if (runtime?.chartTileId) {
          const tile = controller.getState().chartTiles[runtime.chartTileId];
          for (const tab of tile?.tabs ?? []) {
            const tabRuntime = getRuntime(tab.chartPaneId);
            if (tabRuntime?.chart) applyTargets.add(tabRuntime.chart);
          }
        }
        if (!applyTargets.size) applyTargets.add(chart);
        for (const targetChart of applyTargets) {
          targetChart.clearSeriesStyleOverride(seriesId);
        }
        savePersistedStateImmediate();
        draw();
      },
      onClose: () => draw()
    });
  };

  const openDrawingConfig = (drawingId: number, chartHint?: DrishyaChartClient | null) => {
    const chart = chartHint ?? getActiveRuntime()?.chart ?? getPrimaryRuntime()?.chart ?? null;
    if (!chart) return;
    if (!chart.selectDrawingById(drawingId)) return;
    const runtime = [...chartRuntimes.values()].find((entry) => entry.chart === chart) ?? null;
    if (runtime && controller.getState().activeChartPaneId !== runtime.paneId) {
      controller.setActiveChartPane(runtime.paneId);
    }
    draw();
  };

  const ensureTreeHandleForTile = (chartTileId: string) => {
    const existing = treeHandleByChartTileId.get(chartTileId);
    if (existing) return existing;
    const handle = createTileObjectTreeHandle({
      chartTileId,
      controller,
      chartTileTreeOpen,
      getChartForTile: getActiveChartForTile,
      symbols: options.marketControls?.symbols ?? [],
      onPaneSourceChange: async (paneId, symbol) => {
        controller.setChartPaneSource(paneId, { symbol });
        await options.marketControls?.onChartPaneSourceChange?.(paneId, {
          symbol,
          timeframe: controller.getState().chartPaneSources[paneId]?.timeframe,
        });
        await options.marketControls?.onSymbolChange?.(symbol);
        draw();
      },
      onIndicatorConfig: openIndicatorConfig,
      onDrawingConfig: openDrawingConfig,
      workspaceIntents,
      onSetOpen: () => {
        renderWorkspaceTiles();
        setupCanvasBackingStore();
        draw();
      },
      onMutate: () => draw(),
    });
    treeHandleByChartTileId.set(chartTileId, handle);
    return handle;
  };

  const OBJECT_TREE_MIN_WIDTH = 300;
  const OBJECT_TREE_MAX_WIDTH = 760;
  let objectTreeWidth = 360;
  const applyObjectTreeWidth = (width: number) => {
    objectTreeWidth = Math.max(OBJECT_TREE_MIN_WIDTH, Math.min(OBJECT_TREE_MAX_WIDTH, Math.floor(width)));
    for (const handle of treeHandleByChartTileId.values()) {
      handle.root.style.width = "100%";
      handle.root.style.minWidth = "0";
    }
  };
  if (restoredObjectTreeWidth !== null) {
    applyObjectTreeWidth(restoredObjectTreeWidth);
  }

  const syncTileWidths = () => {
    const state = controller.getState();
    const order = state.workspaceTileOrder.filter((tileId) => state.workspaceTiles[tileId]);
    const visibleChartTiles = order.filter((tileId) => state.workspaceTiles[tileId]?.kind === "chart");
    const sum = visibleChartTiles.reduce((acc, tileId) => acc + Math.max(0.0001, state.workspaceTiles[tileId]?.widthRatio ?? 0), 0);
    for (const tileId of order) {
      const tile = state.workspaceTiles[tileId];
      const el = tileShellById.get(tileId);
      if (!tile || !el) continue;
      if (tile.kind !== "chart") {
        el.style.display = "none";
        continue;
      }
      el.style.display = "";
      const ratio = Math.max(0.0001, tile.widthRatio || 0) / Math.max(0.0001, sum);
      el.style.flex = `0 0 ${ratio * 100}%`;
      el.style.minWidth = "360px";
    }
  };

  const renderChartTabs = (chartTileId: string) => {
    const tabStrip = chartTileTabById.get(chartTileId);
    if (!tabStrip) return;
    tabStrip.innerHTML = "";
    const clearDropPreview = () => {
      tabStrip.style.boxShadow = "";
    };
    tabStrip.ondragover = (event) => {
      event.preventDefault();
      tabStrip.style.boxShadow = "inset 0 0 0 1px rgba(161,161,170,0.45)";
    };
    tabStrip.ondragleave = () => clearDropPreview();
    tabStrip.ondrop = (event) => {
      event.preventDefault();
      clearDropPreview();
      const raw = event.dataTransfer?.getData("application/x-drishya-tab");
      if (!raw) return;
      try {
        const payload = JSON.parse(raw) as { sourceChartTileId: string; tabId: string };
        controller.moveChartTab(payload.sourceChartTileId, payload.tabId, chartTileId, Number.MAX_SAFE_INTEGER);
      } catch {
        // ignore malformed payload
      }
    };
    const chartTile = controller.getState().chartTiles[chartTileId];
    if (!chartTile) return;
    const closeTabOrTile = (tabId: string) => {
      const currentTile = controller.getState().chartTiles[chartTileId];
      if (!currentTile) return;
      if (currentTile.tabs.length > 1) {
        controller.removeChartTab(chartTileId, tabId);
      } else {
        const workspaceTileId = controller
          .getState()
          .workspaceTileOrder
          .find((id) => controller.getState().workspaceTiles[id]?.chartTileId === chartTileId);
        if (workspaceTileId) {
          controller.removeWorkspaceTile(workspaceTileId);
        }
      }
      draw();
    };
    for (const tab of chartTile.tabs) {
      const tabBtn = document.createElement("button");
      const active = tab.id === chartTile.activeTabId;
      tabBtn.className = `h-7 px-3 rounded-none text-[11px] font-medium normal-case border-none transition-colors ${active ? "text-zinc-100 bg-zinc-800/40" : "text-zinc-500 bg-transparent hover:text-zinc-100 hover:bg-zinc-900/50"} cursor-pointer`;
      tabBtn.textContent = "";
      tabBtn.dataset.noTileDrag = "1";
      tabBtn.draggable = true;
      tabBtn.style.boxShadow = "";
      const tabLabel = document.createElement("span");
      const tabSource = controller.getState().chartPaneSources[tab.chartPaneId];
      tabLabel.textContent = tabSource?.symbol || tab.title;
      tabBtn.appendChild(tabLabel);
      const closeInline = document.createElement("button");
      closeInline.type = "button";
      closeInline.className = "ml-2 h-4 w-4 inline-flex items-center justify-center text-zinc-600 hover:text-zinc-100 border-none bg-transparent cursor-pointer";
      closeInline.title = chartTile.tabs.length > 1 ? "Close tab" : "Close chart tile";
      closeInline.dataset.noTileDrag = "1";
      closeInline.draggable = false;
      closeInline.appendChild(makeSvgIcon("close", "h-3 w-3"));
      closeInline.onpointerdown = (event) => {
        event.preventDefault();
        event.stopPropagation();
      };
      closeInline.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        closeTabOrTile(tab.id);
      };
      tabBtn.appendChild(closeInline);
      tabBtn.ondragstart = (event) => {
        event.dataTransfer?.setData(
          "application/x-drishya-tab",
          JSON.stringify({ sourceChartTileId: chartTileId, tabId: tab.id })
        );
        event.dataTransfer!.effectAllowed = "move";
      };
      tabBtn.ondragover = (event) => {
        event.preventDefault();
        tabBtn.style.boxShadow = "inset 2px 0 0 rgba(161,161,170,0.7)";
      };
      tabBtn.ondragleave = () => {
        tabBtn.style.boxShadow = "";
      };
      tabBtn.ondrop = (event) => {
        event.preventDefault();
        tabBtn.style.boxShadow = "";
        clearDropPreview();
        const raw = event.dataTransfer?.getData("application/x-drishya-tab");
        if (!raw) return;
        try {
          const payload = JSON.parse(raw) as { sourceChartTileId: string; tabId: string };
          const targetIndex = chartTile.tabs.findIndex((candidate) => candidate.id === tab.id);
          controller.moveChartTab(payload.sourceChartTileId, payload.tabId, chartTileId, targetIndex);
        } catch {
          // ignore malformed payload
        }
      };
      tabBtn.onclick = () => {
        controller.setActiveChartTab(chartTileId, tab.id);
        applyIndicatorSetToTile(chartTileId);
      };
      tabStrip.appendChild(tabBtn);
    }
    const actions = document.createElement("div");
    actions.className = "ml-auto h-7 flex items-center gap-0.5";
    actions.dataset.noTileDrag = "1";
    const activeTab = getActiveTab(chartTile);
    const activePaneId = activeTab?.chartPaneId ?? null;
    const activeSource = activePaneId ? (controller.getState().chartPaneSources[activePaneId] ?? {}) : {};
    const activeRuntime = activePaneId ? getRuntime(activePaneId) : null;

    const mkHeaderBtn = (label: string) => {
      const btn = document.createElement("button");
      btn.dataset.noTileDrag = "1";
      btn.className = "h-7 px-2 rounded-none inline-flex items-center justify-center gap-1 leading-none text-[11px] text-zinc-500 hover:text-zinc-100 hover:bg-zinc-900/50 border-none bg-transparent cursor-pointer transition-colors";
      btn.textContent = label;
      return btn;
    };
    const createDropdown = (owner: HTMLElement, items: { label: string; value: string }[], onSelect: (val: string) => void) => {
      const dropdown = document.createElement("div");
      dropdown.className = "fixed bg-zinc-950 border border-workspace-border py-1 shadow-2xl z-50 flex flex-col min-w-[100px]";
      const rect = owner.getBoundingClientRect();
      dropdown.style.top = `${rect.bottom}px`;
      dropdown.style.left = `${rect.left}px`;
      items.forEach((item) => {
        const btn = document.createElement("button");
        btn.className = "px-4 py-2 text-left text-[11px] text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors border-none outline-none bg-transparent cursor-pointer";
        btn.textContent = item.label;
        btn.onclick = () => {
          onSelect(item.value);
          dropdown.remove();
        };
        dropdown.appendChild(btn);
      });
      const close = () => {
        dropdown.remove();
        window.removeEventListener("click", close);
      };
      window.addEventListener("click", close);
      document.body.appendChild(dropdown);
    };

    if (activePaneId) {
      const tfLabel =
        activeSource.timeframe ??
        options.marketControls?.selectedTimeframe ??
        options.marketControls?.timeframes?.[0] ??
        "TF";
      const tfBtn = mkHeaderBtn(tfLabel);
      tfBtn.onclick = (event) => {
        event.stopPropagation();
        createDropdown(tfBtn, (options.marketControls?.timeframes ?? []).map((t) => ({ label: t, value: t })), async (tf) => {
          controller.setChartPaneSource(activePaneId, { timeframe: tf });
          const symbol = controller.getState().chartPaneSources[activePaneId]?.symbol;
          if (symbol) {
            await options.marketControls?.onChartPaneSourceChange?.(activePaneId, { symbol, timeframe: tf });
          }
          await options.marketControls?.onTimeframeChange?.(tf);
        });
      };
      actions.appendChild(tfBtn);

      const compareBtn = mkHeaderBtn("+ Compare");
      compareBtn.onclick = (event) => {
        event.stopPropagation();
        createSymbolSearchModal({
          symbols: options.marketControls?.symbols ?? [],
          onSelect: async (sym) => options.marketControls?.onCompareSymbol?.(sym),
          onClose: () => { }
        });
      };
      actions.appendChild(compareBtn);

      const indBtn = mkHeaderBtn("Indicators");
      indBtn.onclick = (event) => {
        event.stopPropagation();
        if (!activeRuntime) return;
        createIndicatorModal({
          chart: activeRuntime.chart,
          controller,
          getTargetCharts: () => {
            const currentTile = controller.getState().chartTiles[chartTileId];
            if (!currentTile) return [activeRuntime.chart];
            const charts: DrishyaChartClient[] = [];
            for (const tab of currentTile.tabs) {
              const runtime = getRuntime(tab.chartPaneId);
              if (runtime) charts.push(runtime.chart);
            }
            return charts.length ? charts : [activeRuntime.chart];
          },
          onIndicatorSelected: (indicatorId) => {
            const current = chartTileIndicatorState.get(chartTileId) ?? [];
            const base = canonicalIndicatorId(indicatorId);
            const existingCount = current.filter((t) => decodeIndicatorToken(t).indicatorId === base).length;
            const token = defaultIndicatorToken(activeRuntime.chart, base, existingCount);
            chartTileIndicatorState.set(chartTileId, normalizeIndicatorIds([...current, token]));
            applyIndicatorSetToTile(chartTileId);
            savePersistedStateImmediate();
            draw();
          },
          onApply: () => draw(),
          onClose: () => { }
        });
      };
      actions.appendChild(indBtn);

      const replayState = controller.getState().replay;
      const replayBtn = mkHeaderBtn("Replay");
      replayBtn.prepend(makeSvgIcon("play", "h-3.5 w-3.5"));
      replayBtn.onclick = () => controller.replay().play();
      actions.appendChild(replayBtn);
      if (replayState.playing) {
        const mkReplayIconBtn = (icon: string, onClick: () => void) => {
          const btn = document.createElement("button");
          btn.dataset.noTileDrag = "1";
          btn.className = "h-7 w-7 rounded-none text-zinc-500 hover:text-zinc-100 hover:bg-zinc-900/50 border-none bg-transparent cursor-pointer transition-colors inline-flex items-center justify-center";
          btn.appendChild(makeSvgIcon(icon, "h-3.5 w-3.5"));
          btn.onclick = onClick;
          return btn;
        };
        actions.append(
          mkReplayIconBtn("pause", () => controller.replay().pause()),
          mkReplayIconBtn("stop", () => controller.replay().stop()),
          mkReplayIconBtn("step-forward", () => { controller.replay().stepBar(); }),
          mkReplayIconBtn("skip-forward", () => { controller.replay().stepEvent(); })
        );
      }
    }

    const addBtn = document.createElement("button");
    addBtn.dataset.noTileDrag = "1";
    addBtn.className = "h-7 w-7 rounded-none inline-flex items-center justify-center leading-none text-[13px] text-zinc-500 hover:text-zinc-100 hover:bg-zinc-900/50 border-none bg-transparent cursor-pointer transition-colors";
    addBtn.textContent = "+";
    addBtn.title = "Add tab";
    addBtn.onclick = () => {
      const symbols = options.marketControls?.symbols ?? [];
      if (!symbols.length) {
        const tabId = controller.addChartTab(chartTileId);
        if (!tabId) return;
        const nextTile = controller.getState().chartTiles[chartTileId];
        const nextTab = nextTile?.tabs.find((candidate) => candidate.id === tabId);
        const paneId = nextTab?.chartPaneId;
        if (paneId) {
          const activePaneId = controller.getState().activeChartPaneId;
          const inherited = controller.getState().chartPaneSources[activePaneId] ?? {};
          controller.setChartPaneSource(paneId, {
            symbol: inherited.symbol ?? options.marketControls?.selectedSymbol,
            timeframe:
              inherited.timeframe ??
              options.marketControls?.selectedTimeframe ??
              options.marketControls?.timeframes?.[0],
          });
        }
        applyIndicatorSetToTile(chartTileId);
        draw();
        return;
      }
      createSymbolSearchModal({
        symbols,
        onSelect: async (symbol) => {
          const tabId = controller.addChartTab(chartTileId);
          if (!tabId) return;
          const nextTile = controller.getState().chartTiles[chartTileId];
          const nextTab = nextTile?.tabs.find((candidate) => candidate.id === tabId);
          const paneId = nextTab?.chartPaneId;
          if (!paneId) return;
          controller.setChartTabTitle(chartTileId, tabId, symbol);
          const activePaneId = controller.getState().activeChartPaneId;
          const inherited = controller.getState().chartPaneSources[activePaneId] ?? {};
          const timeframe =
            inherited.timeframe ??
            options.marketControls?.selectedTimeframe ??
            options.marketControls?.timeframes?.[0];
          controller.setChartPaneSource(paneId, { symbol, timeframe });
          applyIndicatorSetToTile(chartTileId);
          await options.marketControls?.onChartPaneSourceChange?.(paneId, {
            symbol,
            timeframe
          });
          await options.marketControls?.onSymbolChange?.(symbol);
          draw();
        },
        onClose: () => { }
      });
    };
    const treeBtn = document.createElement("button");
    treeBtn.dataset.noTileDrag = "1";
    treeBtn.className = "h-7 w-7 rounded-none text-[12px] text-zinc-500 hover:text-zinc-100 hover:bg-zinc-900/50 border-none bg-transparent cursor-pointer transition-colors inline-flex items-center justify-center";
    treeBtn.title = "Object Tree";
    treeBtn.appendChild(makeSvgIcon("panels", "h-3.5 w-3.5"));
    treeBtn.onclick = () => {
      const open = chartTileTreeOpen.get(chartTileId) === true;
      chartTileTreeOpen.set(chartTileId, !open);
      renderWorkspaceTiles();
      setupCanvasBackingStore();
      draw();
    };
    const removeTileBtn = document.createElement("button");
    removeTileBtn.dataset.noTileDrag = "1";
    removeTileBtn.className = "h-7 w-7 rounded-none text-[12px] text-zinc-500 hover:text-zinc-100 hover:bg-zinc-900/50 border-none bg-transparent cursor-pointer transition-colors inline-flex items-center justify-center";
    removeTileBtn.title = "Close chart tile";
    removeTileBtn.appendChild(makeSvgIcon("close", "h-3.5 w-3.5"));
    removeTileBtn.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      const stateNow = controller.getState();
      const tileId = stateNow.workspaceTileOrder.find(
        (workspaceTileId) => stateNow.workspaceTiles[workspaceTileId]?.kind === "chart" && stateNow.workspaceTiles[workspaceTileId]?.chartTileId === chartTileId
      );
      if (!tileId) return;
      controller.removeWorkspaceTile(tileId);
      draw();
    };
    actions.append(addBtn, treeBtn, removeTileBtn);
    tabStrip.appendChild(actions);
  };

  const renderWorkspaceTiles = () => {
    const state = controller.getState();
    const order = state.workspaceTileOrder.filter((tileId) => state.workspaceTiles[tileId]);
    const visibleChartOrder = order.filter((tileId) => state.workspaceTiles[tileId]?.kind === "chart");
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
        if (event.button !== 0) return;
        const target = event.target as HTMLElement | null;
        if (target?.closest("[data-no-tile-drag='1']")) return;
        const startX = event.clientX;
        let dragging = false;
        let didReorder = false;
        const draggedShell = shell;
        (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
        document.body.style.userSelect = "none";
        document.body.style.cursor = "grabbing";
        const onMove = (moveEvent: PointerEvent) => {
          const dx = moveEvent.clientX - startX;
          if (!dragging && Math.abs(dx) > 10) dragging = true;
          if (!dragging) return;
          if (draggedShell) {
            draggedShell.style.transform = `translateX(${dx}px)`;
            draggedShell.style.zIndex = "30";
            draggedShell.style.opacity = "0.92";
            draggedShell.style.pointerEvents = "none";
          }
          const stateNow = controller.getState();
          const orderedIds = stateNow.workspaceTileOrder.filter((id) => stateNow.workspaceTiles[id]);
          const centers = orderedIds.map((id) => {
            const el = tileShellById.get(id);
            const rect = el?.getBoundingClientRect();
            return rect ? rect.left + rect.width / 2 : Number.POSITIVE_INFINITY;
          });
          let targetIndex = orderedIds.length - 1;
          for (let i = 0; i < centers.length; i += 1) {
            if (moveEvent.clientX < centers[i]) {
              targetIndex = i;
              break;
            }
          }
          const currentIndex = orderedIds.indexOf(tileId);
          if (currentIndex >= 0 && targetIndex !== currentIndex) {
            controller.moveWorkspaceTile(tileId, targetIndex);
            didReorder = true;
          }
        };
        const onUp = () => {
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", onUp);
          if (draggedShell) {
            draggedShell.style.transform = "";
            draggedShell.style.zIndex = "";
            draggedShell.style.opacity = "";
            draggedShell.style.pointerEvents = "";
          }
          document.body.style.userSelect = "";
          document.body.style.cursor = "";
          if (didReorder) {
            savePersistedState();
          }
        };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
      };
      const body = shell.children[1] as HTMLDivElement;
      body.innerHTML = "";
      if (tile.kind === "chart" && tile.chartTileId) {
        let tabs = chartTileTabById.get(tile.chartTileId);
        if (!tabs) {
          tabs = createChartTabStrip(tile.chartTileId);
        }
        if (!header.contains(tabs)) {
          header.appendChild(tabs);
        }
        header.ondragover = (event) => {
          event.preventDefault();
          if (tabs) tabs.style.boxShadow = "inset 0 0 0 1px rgba(161,161,170,0.45)";
        };
        header.ondragleave = () => {
          if (tabs) tabs.style.boxShadow = "";
        };
        header.ondrop = (event) => {
          event.preventDefault();
          if (tabs) tabs.style.boxShadow = "";
          const raw = event.dataTransfer?.getData("application/x-drishya-tab");
          if (!raw) return;
          try {
            const payload = JSON.parse(raw) as { sourceChartTileId: string; tabId: string };
            controller.moveChartTab(payload.sourceChartTileId, payload.tabId, tile.chartTileId!, Number.MAX_SAFE_INTEGER);
          } catch {
            // ignore malformed payload
          }
        };
        let tileBody = chartTileBodyByChartTileId.get(tile.chartTileId);
        if (!tileBody) {
          tileBody = document.createElement("div");
          tileBody.className = "h-full w-full min-h-0 min-w-0 flex flex-col";
          chartTileBodyByChartTileId.set(tile.chartTileId, tileBody);
        }
        while (tileBody.children.length > 0) {
          tileBody.removeChild(tileBody.lastChild!);
        }
        const stageHost = ensureChartTileStage(tile.chartTileId);
        const tileTree = ensureTreeHandleForTile(tile.chartTileId);
        const contentRow = document.createElement("div");
        contentRow.className = "flex-1 min-h-0 min-w-0 flex";
        stageHost.stage.classList.add("flex-1");
        contentRow.appendChild(stageHost.stage);
        if (chartTileTreeOpen.get(tile.chartTileId) === true) {
          tileTree.root.style.display = "flex";
          tileTree.root.style.width = "320px";
          tileTree.root.style.minWidth = "280px";
          contentRow.appendChild(tileTree.root);
        } else {
          tileTree.root.style.display = "none";
        }
        tileBody.appendChild(contentRow);
        const chartTile = state.chartTiles[tile.chartTileId];
        const activeTab = getActiveTab(chartTile);
        if (activeTab) {
          paneHostByPaneId.set(activeTab.chartPaneId, stageHost);
          const runtime = getRuntime(activeTab.chartPaneId);
          if (runtime && runtime.container.parentElement !== stageHost.chartLayer) {
            runtime.container.parentElement?.removeChild(runtime.container);
            stageHost.chartLayer.appendChild(runtime.container);
          }
        }
        body.appendChild(tileBody);
        renderChartTabs(tile.chartTileId);
      } else {
        // objects tile is intentionally hidden; object tree renders within chart tile.
        header.ondragover = null;
        header.ondragleave = null;
        header.ondrop = null;
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
      const visibleIndex = visibleChartOrder.indexOf(tileId);
      resizer.style.display = tile.kind === "chart" && visibleIndex >= 0 && visibleIndex < visibleChartOrder.length - 1 ? "block" : "none";
      if (resizer.style.display === "block") {
        const nextTileId = visibleChartOrder[visibleIndex + 1];
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
    renderIndicatorOverlays();
  };

  const addChartTileAtPointer = async (clientX: number) => {
    const before = controller.getState().workspaceTileOrder.filter((tileId) => controller.getState().workspaceTiles[tileId]?.kind === "chart");
    const chartTileId = controller.addChartTile();
    await initializeChartTileSource(chartTileId);
    const afterState = controller.getState();
    const after = afterState.workspaceTileOrder.filter((tileId) => afterState.workspaceTiles[tileId]?.kind === "chart");
    const newTileId = after.find((id) => !before.includes(id));
    if (!newTileId) return;
    const ordered = afterState.workspaceTileOrder.filter((id) => afterState.workspaceTiles[id]?.kind === "chart");
    const centers = ordered.map((id) => {
      const el = tileShellById.get(id);
      const rect = el?.getBoundingClientRect();
      return rect ? rect.left + rect.width / 2 : Number.POSITIVE_INFINITY;
    });
    let targetIndex = ordered.length - 1;
    for (let i = 0; i < centers.length; i += 1) {
      if (clientX < centers[i]) {
        targetIndex = i;
        break;
      }
    }
    controller.moveWorkspaceTile(newTileId, targetIndex);
    draw();
    savePersistedState();
  };

  const tileShellById = new Map<string, HTMLDivElement>();
  const tileHeaderById = new Map<string, HTMLDivElement>();
  const chartTileBodyByChartTileId = new Map<string, HTMLDivElement>();
  const chartTileTabById = new Map<string, HTMLDivElement>();
  const chartTileStageByChartTileId = new Map<string, { stage: HTMLDivElement; chartLayer: HTMLDivElement }>();
  const paneHostByPaneId = new Map<string, { stage: HTMLDivElement; chartLayer: HTMLDivElement }>();
  const indicatorOverlayByPaneId = new Map<string, HTMLDivElement>();

  const createTileHeader = (label: string) => {
    const header = document.createElement("div");
    header.className = "h-9 shrink-0 border-b border-zinc-800/80 bg-zinc-950/95 px-2 flex items-center gap-2 text-[10px] uppercase tracking-wider text-zinc-400 min-w-0";
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
    strip.className = "flex-1 min-w-0 h-7 px-1 flex items-center gap-1 overflow-x-auto";
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

  const indicatorLabel = (id: string) => {
    const labels: Record<string, string> = {
      sma: "SMA",
      ema: "EMA",
      bb: "BB",
      rsi: "RSI",
      macd: "MACD",
      atr: "ATR",
      stoch: "STOCH",
      obv: "OBV",
      vwap: "VWAP",
      adx: "ADX",
      mom: "MOM",
    };
    return labels[id] ?? id.toUpperCase();
  };
  const indicatorReadoutColor = (seriesId: string) => {
    const id = seriesId.toLowerCase();
    if (id.startsWith("ema") || id.startsWith("sma") || id.startsWith("vwap")) return "#f59e0b";
    if (id.startsWith("bb") || id.startsWith("bbands")) return "#a3e635";
    if (id.startsWith("rsi")) return "#22d3ee";
    if (id.startsWith("macd")) return "#38bdf8";
    if (id.startsWith("atr")) return "#f97316";
    if (id.startsWith("stoch")) return "#c084fc";
    if (id.startsWith("obv")) return "#eab308";
    if (id.startsWith("adx")) return "#fb7185";
    if (id.startsWith("mom")) return "#f43f5e";
    return "#d4d4d8";
  };

  const renderIndicatorOverlays = () => {
    const state = controller.getState();
    const paneToTileId = new Map<string, string>();
    for (const [chartTileId, chartTile] of Object.entries(state.chartTiles)) {
      for (const tab of chartTile.tabs) {
        paneToTileId.set(tab.chartPaneId, chartTileId);
      }
    }

    for (const [paneId, hostPane] of paneHostByPaneId) {
      const runtime = getRuntime(paneId);
      if (!runtime) continue;
      const chartTileId = paneToTileId.get(paneId);
      const indicatorTokens = chartTileId ? (chartTileIndicatorState.get(chartTileId) ?? []) : [];
      let overlay = indicatorOverlayByPaneId.get(paneId);
      if (!overlay) {
        overlay = document.createElement("div");
        overlay.style.position = "absolute";
        overlay.style.left = "8px";
        overlay.style.top = "6px";
        overlay.style.zIndex = "30";
        overlay.style.pointerEvents = "none";
        overlay.style.whiteSpace = "nowrap";
        indicatorOverlayByPaneId.set(paneId, overlay);
      }
      if (overlay.parentElement !== hostPane.stage) {
        overlay.parentElement?.removeChild(overlay);
        hostPane.stage.appendChild(overlay);
      }
      overlay.innerHTML = "";

      const snapshot = runtime.chart.readoutSnapshot();
      const chartRootPaneIds = new Set(
        Object.keys(controller.getState().chartPanes).map((id) => canonicalRuntimePaneId(id))
      );
      const source = state.chartPaneSources[paneId] ?? state.chartPaneSources.price ?? {};
      const symbol = source.symbol ?? options.marketControls?.selectedSymbol ?? "";
      const timeframe = source.timeframe ?? options.marketControls?.selectedTimeframe ?? "";
      const paneLayouts = runtime.chart.paneLayouts();
      const paneTopById = new Map<string, number>();
      const paneWidthById = new Map<string, number>();
      const orderedPaneIds = paneLayouts.map((pane) => canonicalRuntimePaneId(pane.id));
      for (const pane of paneLayouts) {
        const canonicalPaneId = canonicalRuntimePaneId(pane.id);
        paneTopById.set(canonicalPaneId, pane.y);
        paneWidthById.set(canonicalPaneId, pane.w);
      }
      const paneOffsets = new Map<string, number>();
      const rowHeight = 24;
      const mkOverlayIconBtn = (
        icon: "eye" | "eye-off" | "settings" | "trash" | "chevron-up" | "chevron-down",
        title: string,
        onClick: () => void,
        disabled = false
      ) => {
        const btn = document.createElement("button");
        btn.style.height = "20px";
        btn.style.width = "20px";
        btn.style.display = "inline-flex";
        btn.style.alignItems = "center";
        btn.style.justifyContent = "center";
        btn.style.color = disabled ? "#71717a" : "#e4e4e7";
        btn.style.border = "1px solid rgba(113,113,122,0.75)";
        btn.style.borderRadius = "4px";
        btn.style.background = "rgba(9,9,11,0.9)";
        btn.style.cursor = disabled ? "not-allowed" : "pointer";
        btn.style.padding = "0";
        btn.style.pointerEvents = disabled ? "none" : "auto";
        btn.style.opacity = disabled ? "0.45" : "1";
        btn.title = title;
        const iconEl = makeSvgIcon(icon);
        iconEl.style.width = "14px";
        iconEl.style.height = "14px";
        btn.appendChild(iconEl);
        if (!disabled) {
          btn.onmouseenter = () => {
            btn.style.color = "#ffffff";
            btn.style.borderColor = "rgba(161,161,170,0.95)";
            btn.style.background = "rgba(24,24,27,0.98)";
          };
          btn.onmouseleave = () => {
            btn.style.color = "#e4e4e7";
            btn.style.borderColor = "rgba(113,113,122,0.75)";
            btn.style.background = "rgba(9,9,11,0.9)";
          };
          btn.onclick = (event) => {
            event.preventDefault();
            event.stopPropagation();
            onClick();
            draw();
          };
        }
        return btn;
      };
      const hasPricePane = paneTopById.has("price");
      if (hasPricePane) {
        const priceTop = paneTopById.get("price") ?? 0;
        const pricePaneIndex = orderedPaneIds.indexOf("price");
        const canMovePriceUp = pricePaneIndex > 0;
        const canMovePriceDown =
          pricePaneIndex >= 0 && pricePaneIndex < orderedPaneIds.length - 1;
        const sourceRow = document.createElement("div");
        sourceRow.style.position = "absolute";
        sourceRow.style.left = "0";
        sourceRow.style.top = `${Math.max(0, Math.floor(priceTop))}px`;
        sourceRow.style.height = "22px";
        sourceRow.style.display = "flex";
        sourceRow.style.alignItems = "center";
        sourceRow.style.justifyContent = "space-between";
        sourceRow.style.gap = "12px";
        sourceRow.style.width = `${Math.max(220, (paneWidthById.get("price") ?? 240) - 16)}px`;
        sourceRow.style.paddingRight = "10px";
        sourceRow.style.pointerEvents = "auto";
        sourceRow.style.cursor = "default";
        sourceRow.style.whiteSpace = "nowrap";
        const sourceLeft = document.createElement("span");
        sourceLeft.style.display = "inline-flex";
        sourceLeft.style.alignItems = "center";
        sourceLeft.style.gap = "8px";
        sourceLeft.style.minWidth = "0";
        const sourceTextWrap = document.createElement("span");
        sourceTextWrap.style.display = "inline-flex";
        sourceTextWrap.style.alignItems = "center";
        sourceTextWrap.style.gap = "4px";
        const symbolText = document.createElement("span");
        symbolText.style.fontSize = "13px";
        symbolText.style.color = "#d4d4d8";
        symbolText.style.flexShrink = "0";
        symbolText.style.cursor = "pointer";
        symbolText.style.pointerEvents = "auto";
        symbolText.textContent = symbol || snapshot?.source_label || "";
        sourceTextWrap.appendChild(symbolText);
        if (timeframe) {
          const timeframeText = document.createElement("span");
          timeframeText.style.fontSize = "13px";
          timeframeText.style.color = "#a1a1aa";
          timeframeText.style.flexShrink = "0";
          timeframeText.textContent = `· ${timeframe}`;
          sourceTextWrap.appendChild(timeframeText);
        }
        sourceLeft.appendChild(sourceTextWrap);

        const ohlc = snapshot?.ohlcv ?? null;
        if (ohlc) {
          const fmt = (n: number) => Number.isFinite(n) ? n.toFixed(2) : "--";
          const delta = ohlc.close - ohlc.open;
          const appearance = runtime.chart.getAppearanceConfig() ?? DEFAULT_APPEARANCE_CONFIG;
          const values = document.createElement("span");
          values.style.fontSize = "13px";
          values.style.fontWeight = "600";
          values.style.whiteSpace = "nowrap";
          const dim = "#a1a1aa";
          const valueColor = delta >= 0 ? appearance.candle_up : appearance.candle_down;
          const seg = (label: string, value: string) => {
            const wrap = document.createElement("span");
            wrap.style.marginRight = "8px";
            const l = document.createElement("span");
            l.style.color = dim;
            l.textContent = `${label} `;
            const v = document.createElement("span");
            v.style.color = valueColor;
            v.textContent = value;
            wrap.append(l, v);
            return wrap;
          };
          values.append(
            seg("O", fmt(ohlc.open)),
            seg("H", fmt(ohlc.high)),
            seg("L", fmt(ohlc.low)),
            seg("C", fmt(ohlc.close)),
            seg("V", fmt(ohlc.volume))
          );
          const deltaEl = document.createElement("span");
          deltaEl.style.color = valueColor;
          deltaEl.textContent = `${delta >= 0 ? "+" : ""}${fmt(delta)}`;
          values.appendChild(deltaEl);
          sourceLeft.appendChild(values);
        }
        sourceRow.appendChild(sourceLeft);

        const pricePaneControls = document.createElement("div");
        pricePaneControls.style.display = "inline-flex";
        pricePaneControls.style.alignItems = "center";
        pricePaneControls.style.gap = "6px";
        pricePaneControls.style.flexShrink = "0";
        if (chartTileId && canMovePriceUp) {
          pricePaneControls.append(
            mkOverlayIconBtn("chevron-up", "Move pane up", () => {
              workspaceIntents.movePaneInTile(chartTileId, "price", "up");
            })
          );
        }
        if (chartTileId && canMovePriceDown) {
          pricePaneControls.append(
            mkOverlayIconBtn("chevron-down", "Move pane down", () => {
              workspaceIntents.movePaneInTile(chartTileId, "price", "down");
            })
          );
        }
        if (pricePaneControls.childElementCount > 0) {
          sourceRow.appendChild(pricePaneControls);
        }

        symbolText.onclick = (event) => {
          event.preventDefault();
          event.stopPropagation();
          const symbols = options.marketControls?.symbols ?? [];
          if (!symbols.length) return;
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
        };
        overlay.appendChild(sourceRow);
        paneOffsets.set("price", rowHeight + 6);
      }

      const paneOwnership = runtime.chart.paneChartPaneMap();
      const indicatorsInRuntime = (snapshot?.indicators ?? []).filter((item) => {
        const owner = paneOwnership[item.pane_id];
        if (owner) return owner === paneId;
        return true;
      });
      const indicatorsByPane = new Map<string, typeof indicatorsInRuntime>();
      for (const item of indicatorsInRuntime) {
        const paneId = canonicalRuntimePaneId(item.pane_id);
        const arr = indicatorsByPane.get(paneId) ?? [];
        arr.push(item);
        indicatorsByPane.set(paneId, arr);
      }
      const indicatorOrder = new Map<string, number>();
      indicatorTokens.forEach((token, i) => {
        const id = decodeIndicatorToken(token).indicatorId;
        if (!indicatorOrder.has(id)) indicatorOrder.set(id, i);
      });

      for (const [indicatorPaneId, paneItems] of indicatorsByPane) {
        let rowIndex = 0;
        const baseTop = paneTopById.get(indicatorPaneId);
        if (baseTop === undefined) continue;
        const startOffset = paneOffsets.get(indicatorPaneId) ?? 2;
        const canonicalPaneId = canonicalRuntimePaneId(indicatorPaneId);
        const isDedicatedIndicatorPane = !chartRootPaneIds.has(canonicalPaneId);

        const sortedPaneItems = [...paneItems].sort((a, b) => {
          const abase = a.id.split(":")[0];
          const bbase = b.id.split(":")[0];
          return (indicatorOrder.get(abase) ?? 999) - (indicatorOrder.get(bbase) ?? 999);
        });
        for (const snapshotItem of sortedPaneItems) {
          const indicatorId = snapshotItem.id.split(":")[0];
          const isFirstIndicatorRow = rowIndex === 0;
          const row = document.createElement("div");
          row.style.position = "absolute";
          row.style.left = "0";
          row.style.top = `${Math.max(0, Math.floor(baseTop + startOffset + rowIndex * rowHeight))}px`;
          rowIndex += 1;
          row.style.height = `${rowHeight}px`;
          row.style.width = `${Math.max(220, (paneWidthById.get(indicatorPaneId) ?? 240) - 16)}px`;
          row.style.pointerEvents = "auto";
          row.style.cursor = "pointer";
          row.style.display = "flex";
          row.style.justifyContent = "space-between";
          row.style.alignItems = "center";
          row.style.gap = "6px";
          row.style.whiteSpace = "nowrap";
          row.style.paddingRight = "10px";

          const left = document.createElement("div");
          left.style.display = "inline-flex";
          left.style.alignItems = "center";
          left.style.minWidth = "0";
          left.style.flex = "1";
          left.style.gap = "6px";

          const label = document.createElement("span");
          label.style.fontSize = "13px";
          label.style.whiteSpace = "nowrap";
          label.style.overflow = "hidden";
          label.style.textOverflow = "ellipsis";
          const nameEl = document.createElement("span");
          nameEl.style.color = !snapshotItem.visible ? "#71717a" : "#d4d4d8";
          nameEl.textContent = `${snapshotItem.name || indicatorLabel(indicatorId)} `;
          const valueEl = document.createElement("span");
          valueEl.style.color = !snapshotItem.visible ? "#71717a" : indicatorReadoutColor(snapshotItem.id);
          valueEl.textContent = Number.isFinite(snapshotItem.value) ? snapshotItem.value.toFixed(2) : "--";
          label.append(nameEl, valueEl);
          left.appendChild(label);

          const indicatorControls = document.createElement("div");
          indicatorControls.style.display = "inline-flex";
          indicatorControls.style.position = "static";
          indicatorControls.style.gap = "6px";
          indicatorControls.style.alignItems = "center";
          indicatorControls.style.marginLeft = "2px";
          indicatorControls.style.opacity = "0";
          indicatorControls.style.pointerEvents = "none";
          indicatorControls.style.transition = "opacity 120ms ease";

          const getMainSeriesId = () => runtime.chart.objectTreeState().series.find((s) => s.id.startsWith(`${indicatorId}:`) || s.id === indicatorId)?.id ?? null;
          const isVisible = () => {
            const id = getMainSeriesId();
            if (!id) return true;
            return runtime.chart.objectTreeState().series.find((s) => s.id === id)?.visible ?? true;
          };

          const paneControls = document.createElement("div");
          paneControls.style.display = "inline-flex";
          paneControls.style.gap = "6px";
          paneControls.style.alignItems = "center";
          paneControls.style.flexShrink = "0";
          const paneOrderIndex = orderedPaneIds.indexOf(canonicalRuntimePaneId(indicatorPaneId));
          const canMoveUp = paneOrderIndex > 0;
          const canMoveDown = paneOrderIndex >= 0 && paneOrderIndex < orderedPaneIds.length - 1;

          if (isFirstIndicatorRow && isDedicatedIndicatorPane) {
            if (canMoveUp) {
              paneControls.append(
                mkOverlayIconBtn("chevron-up", "Move pane up", () => {
                  if (!chartTileId) return;
                  workspaceIntents.movePaneInTile(chartTileId, indicatorPaneId, "up");
                })
              );
            }
            if (canMoveDown) {
              paneControls.append(
                mkOverlayIconBtn("chevron-down", "Move pane down", () => {
                  if (!chartTileId) return;
                  workspaceIntents.movePaneInTile(chartTileId, indicatorPaneId, "down");
                })
              );
            }
            paneControls.append(
              mkOverlayIconBtn("trash", "Delete pane", () => {
                if (!chartTileId) return;
                workspaceIntents.deletePaneInTile(
                  chartTileId,
                  indicatorPaneId,
                  "indicator",
                  runtime.chart
                );
              })
            );
          }

          indicatorControls.append(
            mkOverlayIconBtn(isVisible() ? "eye" : "eye-off", "Hide/show", () => {
              workspaceIntents.toggleVisibility(
                runtime.chart,
                "series",
                snapshotItem.id,
                !snapshotItem.visible
              );
            }),
            mkOverlayIconBtn("settings", "Configure", () => {
              openIndicatorConfig(
                {
                  paneId: indicatorPaneId,
                  seriesId: snapshotItem.id,
                  indicatorId
                },
                runtime.chart
              );
            }),
            mkOverlayIconBtn("trash", "Delete", () => {
              if (!chartTileId) return;
              workspaceIntents.deleteSeriesInTile(chartTileId, snapshotItem.id, runtime.chart);
            })
          );
          left.appendChild(indicatorControls);
          row.appendChild(left);
          if (isFirstIndicatorRow && isDedicatedIndicatorPane) row.appendChild(paneControls);
          row.onmouseenter = () => {
            indicatorControls.style.opacity = "1";
            indicatorControls.style.pointerEvents = "auto";
          };
          row.onmouseleave = () => {
            indicatorControls.style.opacity = "0";
            indicatorControls.style.pointerEvents = "none";
          };
          overlay.appendChild(row);
        }
      }
    }

    for (const [paneId, overlay] of indicatorOverlayByPaneId) {
      if (paneHostByPaneId.has(paneId)) continue;
      overlay.remove();
      indicatorOverlayByPaneId.delete(paneId);
    }
  };

  // Final assembly of UI pieces
  root.insertBefore(topHandle.root, mainRow);
  mainRow.insertBefore(stripHandle.root, tilesRow);
  tilesRow.ondragover = (event) => {
    const isAddTileDrag = event.dataTransfer?.types?.includes("application/x-drishya-add-chart-tile");
    if (!isAddTileDrag) return;
    event.preventDefault();
  };
  tilesRow.ondrop = (event) => {
    const isAddTileDrop = event.dataTransfer?.types?.includes("application/x-drishya-add-chart-tile");
    if (!isAddTileDrop) return;
    event.preventDefault();
    void addChartTileAtPointer(event.clientX);
  };

  const setupCanvasBackingStore = () => {
    updateChartRuntimeLayout();
  };

  const createRuntimeForPane = (paneId: string): ChartPaneRuntime => {
    const state = controller.getState();
    let chartTileId: string | undefined;
    let chartTabId: string | undefined;
    for (const [candidateTileId, chartTile] of Object.entries(state.chartTiles)) {
      const tab = chartTile.tabs.find((candidate) => candidate.chartPaneId === paneId);
      if (tab) {
        chartTileId = candidateTileId;
        chartTabId = tab.id;
        break;
      }
    }
    const runtimeKey = chartTileId && chartTabId ? `${chartTileId}:${chartTabId}` : paneId;
    const container = document.createElement("div");
    container.className = "absolute overflow-hidden";
    const paneCanvas = document.createElement("canvas");
    paneCanvas.className = "block h-full w-full bg-transparent absolute inset-0";
    const paneCanvasId = `drishya-canvas-${paneId}-${Math.random().toString(36).slice(2, 10)}`;
    paneCanvas.id = paneCanvasId;
    container.appendChild(paneCanvas);
    const host = paneHostByPaneId.get(paneId);
    const mountLayer = host?.chartLayer && host.chartLayer.isConnected ? host.chartLayer : chartLayer;
    mountLayer.appendChild(container);

    const paneRaw = createWasmChart(paneCanvasId, 300, 300);
    const paneChart = new DrishyaChartClient(paneRaw);
    const restoredStyleMap = restoredIndicatorStyleOverridesByPane[paneId] ?? {};
    for (const [seriesId, style] of Object.entries(restoredStyleMap)) {
      paneChart.setSeriesStyleOverride(seriesId, style);
    }
    const snapshotIndicatorIds = () =>
      chartTileId ? normalizeIndicatorIds(chartTileIndicatorState.get(chartTileId) ?? []) : [];
    paneChart.setCandles = ((orig) => (candles: Candle[]) => {
      const beforeIndicatorIds = snapshotIndicatorIds();
      orig(candles);
      if (!candles.length) {
        latestCandlesByPane.delete(paneId);
      } else {
        latestCandlesByPane.set(paneId, {
          latest: candles[candles.length - 1],
          prevClose: candles.length > 1 ? candles[candles.length - 2].close : null
        });
      }
      const afterIndicatorIds = snapshotIndicatorIds();
      if (beforeIndicatorIds.length && afterIndicatorIds.length === 0) {
        applyIndicatorSetToChart(paneChart, beforeIndicatorIds);
        if (chartTileId) {
          chartTileIndicatorState.set(chartTileId, beforeIndicatorIds);
        }
      }
    })(paneChart.setCandles.bind(paneChart));
    paneChart.appendCandle = ((orig) => (candle: Candle) => {
      const prevClose = latestCandlesByPane.get(paneId)?.latest.close ?? null;
      orig(candle);
      latestCandlesByPane.set(paneId, { latest: candle, prevClose });
    })(paneChart.appendCandle.bind(paneChart));
    paneChart.setTheme(controller.getState().theme);
    try {
      paneChart.setAppearanceConfig(DEFAULT_APPEARANCE_CONFIG);
    } catch {
      // ignore unsupported appearance config in older wasm
    }
    const restoredPaneState = restoredPaneStatesByPane[paneId] ?? null;
    if (restoredPaneState) {
      paneChart.restorePaneStateJson(restoredPaneState);
    }
    const restoredIndicators = chartTileId
      ? normalizeIndicatorIds(chartTileIndicatorState.get(chartTileId) ?? [])
      : [];
    applyIndicatorSetToChart(paneChart, restoredIndicators);
    reconcilePaneSpecsForRuntime({ ownerChartPaneId: paneId, chart: paneChart, controller });

    const runtime: ChartPaneRuntime = {
      runtimeKey,
      chartTileId,
      chartTabId,
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
    renderIndicatorOverlays();
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
      // Keep inactive tab runtimes alive so switching tabs is instant and stateful.
      // We only detach their DOM host; runtime/chart state remains in memory.
      if (runtime.container.parentElement) {
        runtime.container.parentElement.removeChild(runtime.container);
      }
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
  const ensureFloatingOverlaysMounted = () => {
    const activePaneId = controller.getState().activeChartPaneId;
    const hostStage = paneHostByPaneId.get(activePaneId)?.stage ?? stage;
    if (configPanelOverlay.parentElement !== hostStage) {
      configPanelOverlay.parentElement?.removeChild(configPanelOverlay);
      hostStage.appendChild(configPanelOverlay);
    }
    if (caretOverlay.parentElement !== hostStage) {
      caretOverlay.parentElement?.removeChild(caretOverlay);
      hostStage.appendChild(caretOverlay);
    }
  };

  const refreshConfigPanel = () => {
    ensureFloatingOverlaysMounted();
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
    ensureFloatingOverlaysMounted();
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
    for (const [chartTileId, handle] of treeHandleByChartTileId) {
      if (chartTileTreeOpen.get(chartTileId) === true) {
        handle.refresh();
      }
    }
    refreshConfigPanel();
    updateTextCaret();
    renderIndicatorOverlays();
    savePersistedState();
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
      workspaceTileOrder: state.workspaceTileOrder,
      workspaceTileRatios: Object.fromEntries(
        state.workspaceTileOrder.map((tileId) => [tileId, state.workspaceTiles[tileId]?.widthRatio ?? 0])
      ),
      chartTileTreeOpen: Object.fromEntries(chartTileTreeOpen.entries()),
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
      renderWorkspaceTiles();
      syncChartPaneContracts({
        state,
        chartRuntimes,
        paneHostByPaneId,
      });
      syncReadoutSourceLabel(state);
      updateChartRuntimeLayout();

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
  const onBeforeUnload = () => {
    persistNow();
  };
  window.addEventListener("beforeunload", onBeforeUnload);

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
  for (const chartTileId of Object.keys(controller.getState().chartTiles)) {
    applyIndicatorSetToTile(chartTileId);
  }
  setupCanvasBackingStore();
  syncReadoutSourceLabel(controller.getState());
  getActiveRuntime()?.chart.setDrawingTool(controller.getState().activeTool);
  draw();
  persistNow();

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
    tree: (() => {
      const activeTileId = controller.getState().activeChartTileId;
      return treeHandleByChartTileId.get(activeTileId)?.root ?? document.createElement("div");
    })(),
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
    refreshObjectTree: () => {
      const activeTileId = controller.getState().activeChartTileId;
      treeHandleByChartTileId.get(activeTileId)?.refresh();
    },
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
      for (const handle of treeHandleByChartTileId.values()) {
        handle.destroy();
      }
      treeHandleByChartTileId.clear();
      unbindInteractions();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("beforeunload", onBeforeUnload);
      if (resizeObserver) {
        resizeObserver.disconnect();
      } else {
        window.removeEventListener("resize", setupCanvasBackingStore);
      }
      persistNow();
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

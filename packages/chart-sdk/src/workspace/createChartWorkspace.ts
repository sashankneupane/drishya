import type { DrawingToolId } from "../toolbar/model.js";
import type { SeriesStyleOverride } from "../wasm/contracts.js";
import type { Candle } from "../wasm/contracts.js";
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
import {
  applyIndicatorSetToChart,
  defaultIndicatorToken,
} from "./indicatorRuntime.js";
import { canonicalRuntimePaneId } from "./paneSpec.js";
import { createTopStrip } from "./topStrip.js";
import {
  canonicalIndicatorId,
  decodeIndicatorToken,
  normalizeIndicatorIds,
} from "./indicatorIdentity.js";
import { ReplayController } from "./replay/ReplayController.js";
import type { ChartPaneRuntime } from "./runtimeTypes.js";
import { createWorkspaceIntentController } from "./workspaceIntentController.js";
import { WorkspaceController } from "./WorkspaceController.js";
import { syncChartPaneContracts } from "./paneContracts.js";
import { reconcilePaneSpecsForRuntime } from "./paneSpecReconcile.js";
import { createTileObjectTreeHandle } from "./objectTreeHandleFactory.js";
import { getActiveChartForTileFromState, getChartsForTileFromState } from "./runtimeSelection.js";
import { projectTileIndicators } from "./projector/projectIndicators.js";
import { initializeChartTileSourceState } from "./chartTileSourceInit.js";
import { syncChartTileShellWidths } from "./tileWidthSync.js";
import { buildPersistedChartTiles } from "./workspacePersistenceSnapshot.js";
import { closeChartTabOrTile } from "./chartTabActions.js";
import { resolveChartTileHeaderContext } from "./chartTileHeaderContext.js";
import { restorePersistedWorkspace } from "./restorePersistedWorkspace.js";
import { buildPersistedWorkspaceEnvelope } from "./workspacePersistEnvelope.js";
import { createChartFacade } from "./chartFacade.js";
import { createPersistenceScheduler } from "./persistenceScheduler.js";
import { addChartTabForSymbol, addChartTabWithInheritedSource } from "./chartTabCreation.js";
import { removeWorkspaceTileByChartTileId } from "./chartTileRemoval.js";
import { toggleChartTileObjectTree } from "./objectTreeToggle.js";
import { attachTileHeaderDragReorder } from "./tileHeaderDragReorder.js";
import { attachTileResizerDrag } from "./tileResizerDrag.js";
import { placeNewChartTileAtPointer } from "./tilePlacement.js";
import { parseChartTabDragPayload } from "./chartTabDnd.js";
import { resolvePaneRuntimeIdentity } from "./runtimeIdentity.js";
import { renderIndicatorOverlays as renderIndicatorOverlayRows } from "./indicatorOverlays.js";
import { createOpenIndicatorConfig } from "./indicatorConfigFlow.js";
import { snapshotIndicatorTokensFromReadout } from "./indicatorTokenSnapshot.js";
import { projectChartTabs } from "./projector/projectTabs.js";
import { projectPanes } from "./projector/projectPanes.js";
import { projectWorkspace } from "./projector/projectWorkspace.js";
import { projectAssetScopedDrawings, restoreAssetScopedDrawings } from "./projector/projectDrawings.js";
import { createWorkspaceEngine } from "./api.js";
import type { WorkspaceDocument, WorkspaceLayoutNode } from "../state/schema.js";
import type { ChartStateSnapshot } from "../wasm/contracts.js";
import {
  createChartTabStripElement,
  createTileHeaderElement,
  ensureChartTileStageHost,
} from "./chartTileDom.js";
import type {
  ChartWorkspaceHandle,
  CreateChartWorkspaceOptions,
  WorkspaceChartSplitNode,
  WorkspaceChartPaneSpec,
} from "./types.js";

const WORKSPACE_STYLE_LINK_ID = "drishya-workspace-styles";

export function createChartWorkspace(options: CreateChartWorkspaceOptions): ChartWorkspaceHandle {
  const { host, createWasmChart } = options;
  if (options.injectStyles !== false) {
    ensureWorkspaceStyles();
  }
  ensureHostHasViewport(host);
  host.innerHTML = "";

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
  const drawingsByAsset = new Map<string, ChartStateSnapshot>();
  const drawingSignatureByAsset = new Map<string, string>();
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
  const primarySnapshotIndicatorIds = () => snapshotIndicatorTokensFromReadout(primaryChart);
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
    const ids = controller.getChartTileIndicatorTokens(chartTileId);
    const chartTile = controller.getState().chartTiles[chartTileId];
    projectTileIndicators({
      chartTileId,
      chartTile,
      indicatorIds: ids,
      controller,
      getRuntime,
      reconcilePaneSpecsForRuntime,
    });
  };

  const getActiveChartForTile = (chartTileId: string): DrishyaChartClient | null => {
    return getActiveChartForTileFromState(controller.getState(), chartTileId, getRuntime);
  };

  const getChartsForTile = (chartTileId: string): DrishyaChartClient[] => {
    return getChartsForTileFromState(controller.getState(), chartTileId, getRuntime);
  };

  const buildWorkspaceLayoutTreeFromControllerState = (): WorkspaceLayoutNode => {
    const state = controller.getState();
    const orderedTileIds = state.workspaceTileOrder.filter((tileId) => state.workspaceTiles[tileId]);
    if (orderedTileIds.length <= 1) {
      return { type: "leaf", tileId: orderedTileIds[0] ?? "tile-chart-1" };
    }
    let tree: WorkspaceLayoutNode = { type: "leaf", tileId: orderedTileIds[0]! };
    for (let i = 1; i < orderedTileIds.length; i += 1) {
      tree = {
        type: "split",
        id: `legacy-workspace-split-${i}`,
        direction: "row",
        ratio: 0.5,
        first: tree,
        second: { type: "leaf", tileId: orderedTileIds[i]! },
      };
    }
    return tree;
  };

  const buildWorkspaceDocumentFromControllerState = (): WorkspaceDocument => {
    const state = controller.getState();
    const tiles: WorkspaceDocument["workspace"]["tiles"] = {};
    for (const [tileId, tileSpec] of Object.entries(state.workspaceTiles)) {
      if (tileSpec.kind === "chart" && tileSpec.chartTileId) {
        const chartTile = state.chartTiles[tileSpec.chartTileId];
        const tabOrder = (chartTile?.tabs ?? []).map((tab) => tab.id);
        const tabs = Object.fromEntries(
          (chartTile?.tabs ?? []).map((tab) => [
            tab.id,
            {
              id: tab.id,
              title: tab.title,
              source: {
                assetId: state.chartPaneSources[tab.chartPaneId]?.symbol ?? tab.title ?? "UNKNOWN",
                timeframe: state.chartPaneSources[tab.chartPaneId]?.timeframe ?? "1h",
              },
            },
          ])
        );
        const paneOrder = state.paneLayout.order;
        const panes = Object.fromEntries(
          paneOrder
            .map((paneId) => state.paneLayout.panes[paneId])
            .filter((pane): pane is NonNullable<typeof pane> => !!pane)
            .map((pane) => [
              pane.id,
              {
                id: pane.id,
                kind: (pane.kind === "indicator" ? "indicator" : "price") as "price" | "indicator",
                title: pane.title ?? pane.id,
                visible: state.paneLayout.visibility[pane.id] ?? true,
                ratio: Math.max(0.0001, state.paneLayout.ratios[pane.id] ?? 1),
              },
            ])
        );
        tiles[tileId] = {
          id: tileId,
          kind: "chart",
          title: tileSpec.title,
          chart: {
            activeTabId: chartTile?.activeTabId ?? tabOrder[0] ?? "tab-price",
            tabOrder,
            tabs,
            indicatorOrder: [],
            indicators: {},
            viewport: {
              priceAxisMode: state.priceAxisMode,
            },
            paneOrder,
            panes,
          },
        };
      } else {
        tiles[tileId] = {
          id: tileId,
          kind: "objects",
          title: tileSpec.title,
        };
      }
    }
    return {
      workspace: {
        activeTileId:
          state.workspaceTileOrder.find((tileId) => state.workspaceTiles[tileId]?.chartTileId === state.activeChartTileId) ??
          state.workspaceTileOrder[0] ??
          null,
        layoutTree: buildWorkspaceLayoutTreeFromControllerState(),
        tiles,
        drawingsByAsset: {},
        ui: {
          theme: state.theme,
          activeTool: state.activeTool,
          isObjectTreeOpen: state.isObjectTreeOpen,
          isLeftStripOpen: state.isLeftStripOpen,
        },
      },
    };
  };

  const workspaceEngine = createWorkspaceEngine({
    initialState: buildWorkspaceDocumentFromControllerState(),
    validate: "strict_with_warnings",
  });

  const workspaceIntents = createWorkspaceIntentController({
    controller,
    getChartForTile: getActiveChartForTile,
    getChartsForTile,
    applyIndicatorSetToTile,
    savePersistedState: () => savePersistedStateImmediate(),
  });

  // Restore persisted state before building UI
  const restoreResult = restorePersistedWorkspace({
    persistedState: options.persistence?.initialState,
    controller,
    selectedTimeframe: options.marketControls?.selectedTimeframe,
    availableTimeframes: options.marketControls?.timeframes,
    chartTileTreeOpen,
    restoredPaneStatesByPane,
    restoredIndicatorStyleOverridesByPane,
    getRuntimeChartByPaneId: (paneId) => chartRuntimes.get(paneId) ?? null,
    getPrimaryChart: () => getPrimaryRuntime()?.chart ?? null,
    applyAppearance,
    setDrawingsByAsset: (next) => {
      drawingsByAsset.clear();
      for (const [assetId, snapshot] of Object.entries(next)) {
        drawingsByAsset.set(assetId, snapshot);
      }
    },
  });
  if (restoreResult.restoredObjectTreeWidth !== null) {
    restoredObjectTreeWidth = restoreResult.restoredObjectTreeWidth;
  }

  const DEBOUNCE_PERSIST_MS = options.persistence?.debounceMs ?? 400;
  const persistNow = () => {
    if (!options.persistence?.onStateChange) return;
    try {
      const stateNow = controller.getState();
      const persistedChartTiles = buildPersistedChartTiles({
        state: stateNow,
        controller,
        chartRuntimes,
        chartTileTreeOpen,
        selectedTimeframe: options.marketControls?.selectedTimeframe,
        availableTimeframes: options.marketControls?.timeframes,
      });
      const state = buildPersistedWorkspaceEnvelope({
        state: stateNow,
        objectTreeWidth,
        candleStyle:
          getActiveRuntime()?.chart.candleStyle() ??
          getPrimaryRuntime()?.chart.candleStyle(),
        appearance:
          getActiveRuntime()?.chart.getAppearanceConfig() ??
          getPrimaryRuntime()?.chart.getAppearanceConfig() ??
          undefined,
        chartTiles: persistedChartTiles,
        drawingsByAsset: Object.fromEntries(drawingsByAsset.entries()),
      });
      options.persistence.onStateChange(state);
    } catch {
      // ignore consumer callback errors
    }
  };
  const persistenceScheduler = createPersistenceScheduler(persistNow, DEBOUNCE_PERSIST_MS);
  const savePersistedState = () => {
    if (!options.persistence?.onStateChange) return;
    persistenceScheduler.schedule();
  };
  const savePersistedStateImmediate = () => {
    persistenceScheduler.flush();
  };

  // top control strip
  const chartFacade = createChartFacade(
    () => getActiveRuntime()?.chart ?? getPrimaryRuntime()?.chart ?? null
  );

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
  const openIndicatorConfig = createOpenIndicatorConfig({
    chartRuntimes,
    controller,
    getRuntime,
    draw: () => draw(),
    savePersistedStateImmediate,
    getActiveChart: () => getActiveRuntime()?.chart ?? null,
    getPrimaryChart: () => getPrimaryRuntime()?.chart ?? null,
  });

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
    syncChartTileShellWidths(controller.getState(), tileShellById);
  };

  const renderChartTabs = (chartTileId: string) => {
    const tabStrip = chartTileTabById.get(chartTileId);
    if (!tabStrip) return;
    const chartTile = controller.getState().chartTiles[chartTileId];
    const closeTabOrTile = (tabId: string) => {
      if (!closeChartTabOrTile(controller, chartTileId, tabId)) return;
      draw();
    };
    const renderHeaderActions = (actionsContainer: HTMLDivElement) => {
      const { activePaneId, activeSource, activeRuntime } = resolveChartTileHeaderContext(
        controller.getState(),
        chartTileId,
        getRuntime
      );

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
        actionsContainer.appendChild(tfBtn);

        const compareBtn = mkHeaderBtn("+ Compare");
        compareBtn.onclick = (event) => {
          event.stopPropagation();
          createSymbolSearchModal({
            symbols: options.marketControls?.symbols ?? [],
            onSelect: async (sym) => options.marketControls?.onCompareSymbol?.(sym),
            onClose: () => { }
          });
        };
        actionsContainer.appendChild(compareBtn);

        const indBtn = mkHeaderBtn("Indicators");
        indBtn.onclick = (event) => {
          event.stopPropagation();
          if (!activeRuntime) return;
          createIndicatorModal({
            chart: activeRuntime.chart,
            controller,
            getTargetCharts: () => {
              const charts = getChartsForTile(chartTileId);
              return charts.length ? charts : [activeRuntime.chart];
            },
            onIndicatorSelected: (indicatorId) => {
              const current = controller.getChartTileIndicatorTokens(chartTileId);
              const base = canonicalIndicatorId(indicatorId);
              const existingCount = current.filter((t) => decodeIndicatorToken(t).indicatorId === base).length;
              const token = defaultIndicatorToken(activeRuntime.chart, base, existingCount);
              controller.setChartTileIndicatorTokens(chartTileId, normalizeIndicatorIds([...current, token]));
              applyIndicatorSetToTile(chartTileId);
              savePersistedStateImmediate();
              draw();
            },
            onApply: () => draw(),
            onClose: () => { }
          });
        };
        actionsContainer.appendChild(indBtn);

        const replayState = controller.getState().replay;
        const replayBtn = mkHeaderBtn("Replay");
        replayBtn.prepend(makeSvgIcon("play", "h-3.5 w-3.5"));
        replayBtn.onclick = () => controller.replay().play();
        actionsContainer.appendChild(replayBtn);
        if (replayState.playing) {
          const mkReplayIconBtn = (icon: string, onClick: () => void) => {
            const btn = document.createElement("button");
            btn.dataset.noTileDrag = "1";
            btn.className = "h-7 w-7 rounded-none text-zinc-500 hover:text-zinc-100 hover:bg-zinc-900/50 border-none bg-transparent cursor-pointer transition-colors inline-flex items-center justify-center";
            btn.appendChild(makeSvgIcon(icon, "h-3.5 w-3.5"));
            btn.onclick = onClick;
            return btn;
          };
          actionsContainer.append(
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
          const tabId = addChartTabWithInheritedSource({
            chartTileId,
            controller,
            selectedSymbol: options.marketControls?.selectedSymbol,
            selectedTimeframe: options.marketControls?.selectedTimeframe,
            availableTimeframes: options.marketControls?.timeframes,
            applyIndicatorSetToTile,
          });
          if (!tabId) return;
          draw();
          return;
        }
        createSymbolSearchModal({
          symbols,
          onSelect: async (symbol) => {
            const created = addChartTabForSymbol({
              chartTileId,
              controller,
              symbol,
              selectedSymbol: options.marketControls?.selectedSymbol,
              selectedTimeframe: options.marketControls?.selectedTimeframe,
              availableTimeframes: options.marketControls?.timeframes,
              applyIndicatorSetToTile,
            });
            if (!created) return;
            await options.marketControls?.onChartPaneSourceChange?.(created.paneId, {
              symbol,
              timeframe: created.timeframe
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
        toggleChartTileObjectTree(chartTileTreeOpen, chartTileId);
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
        if (!removeWorkspaceTileByChartTileId(controller, chartTileId)) return;
        draw();
      };
      actionsContainer.append(addBtn, treeBtn, removeTileBtn);
    };

    projectChartTabs({
      chartTileId,
      chartTile,
      tabStrip,
      chartPaneSources: controller.getState().chartPaneSources,
      parseChartTabDragPayload,
      onTabMove: (sourceChartTileId, tabId, targetChartTileId, targetIndex) => {
        controller.moveChartTab(sourceChartTileId, tabId, targetChartTileId, targetIndex);
      },
      onTabActivate: (tabId) => {
        controller.setActiveChartTab(chartTileId, tabId);
        applyIndicatorSetToTile(chartTileId);
      },
      onCloseTabOrTile: closeTabOrTile,
      appendActions: (strip) => {
        const actions = document.createElement("div");
        actions.className = "ml-auto h-7 flex items-center gap-0.5";
        actions.dataset.noTileDrag = "1";
        renderHeaderActions(actions);
        strip.appendChild(actions);
      },
    });
  };

  const renderWorkspaceTiles = () => {
    const state = controller.getState();
    projectWorkspace({
      state: {
        ...state,
        workspaceLayoutTree: workspaceEngine.getState().workspace.layoutTree,
      },
      tilesRow,
      maps: {
        tileShellById,
        tileHeaderById,
        chartTileBodyByChartTileId,
      },
      paneHostByPaneId,
      chartRuntimes,
      createTileHeader: createTileHeaderElement,
      attachTileHeaderDragReorder: ({ header, shell, tileId }) => {
        attachTileHeaderDragReorder({
          header,
          shell,
          tileId,
          controller,
          tileShellById,
          onReordered: () => savePersistedState(),
        });
      },
      ensureChartTabStrip: (chartTileId) => {
        let tabs = chartTileTabById.get(chartTileId);
        if (!tabs) {
          tabs = createChartTabStrip(chartTileId);
        }
        return tabs;
      },
      renderChartTabs,
      ensureChartTileStage,
      ensureTreeHandleForTile,
      isChartTileTreeOpen: (chartTileId) => chartTileTreeOpen.get(chartTileId) === true,
      getRuntime,
      onChartTileHeaderClick: (chartTileId) => controller.setActiveChartTile(chartTileId),
      parseChartTabDragPayload,
      moveChartTab: (sourceChartTileId, tabId, targetChartTileId, targetIndex) => {
        controller.moveChartTab(sourceChartTileId, tabId, targetChartTileId, targetIndex);
      },
      attachTileResizer: ({ shell, tileId, visibleChartOrder }) => {
        let resizer = shell.querySelector("[data-tile-resizer='1']") as HTMLDivElement | null;
        if (!resizer) {
          resizer = document.createElement("div");
          resizer.dataset.tileResizer = "1";
          resizer.className = "absolute top-0 right-0 h-full w-1.5 cursor-col-resize bg-transparent hover:bg-zinc-700/60 transition-colors";
          shell.style.position = "relative";
          shell.appendChild(resizer);
        }
        const tile = state.workspaceTiles[tileId];
        const visibleIndex = visibleChartOrder.indexOf(tileId);
        resizer.style.display =
          tile?.kind === "chart" && visibleIndex >= 0 && visibleIndex < visibleChartOrder.length - 1
            ? "block"
            : "none";
        if (resizer.style.display === "block") {
          const nextTileId = visibleChartOrder[visibleIndex + 1];
          attachTileResizerDrag({
            resizer,
            tilesRow,
            tileId,
            nextTileId,
            controller,
            onResizeEnd: () => savePersistedState(),
          });
        } else {
          resizer.onpointerdown = null;
        }
      },
      createRuntimeForPane,
      ensureRuntimeInteractions,
      afterProject: () => {
        syncTileWidths();
        renderIndicatorOverlays();
      },
    });
  };

  const addChartTileAtPointer = async (clientX: number) => {
    const before = controller.getState().workspaceTileOrder.filter((tileId) => controller.getState().workspaceTiles[tileId]?.kind === "chart");
    const chartTileId = controller.addChartTile();
    await initializeChartTileSource(chartTileId);
    const afterState = controller.getState();
    const after = afterState.workspaceTileOrder.filter((tileId) => afterState.workspaceTiles[tileId]?.kind === "chart");
    const newTileId = after.find((id) => !before.includes(id));
    if (!newTileId) return;
    placeNewChartTileAtPointer({
      controller,
      tileShellById,
      clientX,
      newTileId,
    });
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

  const createChartTabStrip = (chartTileId: string) => {
    const strip = createChartTabStripElement();
    chartTileTabById.set(chartTileId, strip);
    return strip;
  };

  const ensureChartTileStage = (chartTileId: string) =>
    ensureChartTileStageHost(chartTileId, chartTileStageByChartTileId);

  const renderIndicatorOverlays = () => {
    renderIndicatorOverlayRows({
      controller,
      paneHostByPaneId,
      indicatorOverlayByPaneId,
      getRuntime,
      openIndicatorConfig,
      workspaceIntents,
      draw,
      options,
    });
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
    const { chartTileId, chartTabId, runtimeKey } = resolvePaneRuntimeIdentity(
      paneId,
      state.chartTiles
    );
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
      chartTileId ? controller.getChartTileIndicatorTokens(chartTileId) : [];
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
          controller.setChartTileIndicatorTokens(chartTileId, beforeIndicatorIds);
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
      ? controller.getChartTileIndicatorTokens(chartTileId)
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
    projectPanes({
      state: controller.getState(),
      paneHostByPaneId,
      chartRuntimes,
      createRuntimeForPane,
      ensureRuntimeInteractions,
    });
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
    projectAssetScopedDrawings({
      controller,
      chartRuntimes,
      snapshotsByAsset: drawingsByAsset,
      signatureByAsset: drawingSignatureByAsset,
    });
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
    workspaceEngine.setState(buildWorkspaceDocumentFromControllerState());
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
  restoreAssetScopedDrawings({
    controller,
    chartRuntimes,
    snapshotsByAsset: drawingsByAsset,
    signatureByAsset: drawingSignatureByAsset,
  });
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
      savePersistedStateImmediate();
      persistenceScheduler.cancel();
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

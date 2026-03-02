import type { DrawingToolId } from "../models/drawingTool.js";
import type { SeriesStyleOverride } from "../../wasm/contracts.js";
import type { Candle } from "../../wasm/contracts.js";
import { DrishyaChartClient } from "../../wasm/client.js";
import { DEFAULT_APPEARANCE_CONFIG, WORKSPACE_DRAW_TOOLS } from "../models/constants.js";
import { createDrawingConfigPanel } from "../views/components/DrawingConfigPanel.js";
import { createConfigModal } from "../views/ConfigModal.js";
import { createLeftStrip } from "../views/leftStrip.js";
import { makeSvgIcon } from "../views/icons.js";
import { createSymbolSearchModal } from "../views/SymbolSearchModal.js";
import {
  applyIndicatorSetToChart,
} from "../services/indicatorRuntime.js";
import { ReplayController } from "../replay/ReplayController.js";
import { createWorkspaceIntentController } from "./workspaceIntentController.js";
import { WorkspaceController } from "./WorkspaceController.js";
import { syncChartPaneContracts } from "../services/paneContracts.js";
import { reconcilePaneSpecsForRuntime } from "../services/paneSpecReconcile.js";
import { getActiveChartForTileFromState, getChartsForTileFromState } from "../../tile/services/runtimeSelection.js";
import { syncChartTileShellWidths } from "../services/tileWidthSync.js";
import { buildPersistedChartTiles } from "../services/workspacePersistenceSnapshot.js";
import {
  addChartTabForSymbol,
  addChartTabWithInheritedSource,
  closeChartTab,
  initializeChartTileSourceState,
  removeWorkspaceTileByChartTileId,
  resolveChartTileHeaderContext,
} from "../../tile/services/chartTileService.js";
import { createTileRuntimeOrchestrator } from "../../tile/controllers/createTileRuntimeOrchestrator.js";
import { createTileChartOrchestrator } from "../../tile/controllers/createTileChartOrchestrator.js";
import { restorePersistedWorkspace } from "../services/restorePersistedWorkspace.js";
import { serializeWorkspacePersistenceEnvelope } from "../services/workspacePersistEnvelope.js";
import { createPersistenceScheduler } from "../services/persistenceScheduler.js";
import { attachTileHeaderDragReorder } from "../services/tileHeaderDragReorder.js";
import {
  applyWorkspaceTileDrop,
  resolveWorkspaceTileDropTarget,
  type WorkspaceTileDropTarget,
} from "../services/tilePlacement.js";
import { collectWorkspaceChartTileOrder, collectWorkspaceTileOrder } from "../services/workspaceTileOrder.js";
import { parseChartTabDragPayload } from "../services/chartTabDnd.js";
import { renderIndicatorOverlays as renderIndicatorOverlayRows } from "../views/indicatorOverlays.js";
import { snapshotIndicatorTokensFromReadout } from "../services/indicatorTokenSnapshot.js";
import { projectChartTabs } from "../projectors/projectTabs.js";
import { projectWorkspace } from "../projectors/projectWorkspace.js";
import { projectAssetScopedDrawings, restoreAssetScopedDrawings } from "../projectors/projectDrawings.js";
import { createWorkspaceEngine } from "./api.js";
import type { WorkspaceDocument, WorkspaceLayoutNode } from "../../state/schema.js";
import type { ChartStateSnapshot } from "../../wasm/contracts.js";
import {
  createChartTabStripElement,
  createTileHeaderElement,
  ensureChartTileStageHost,
} from "../views/chartTileDom.js";
import type {
  ChartWorkspaceHandle,
  CreateChartWorkspaceOptions,
  WorkspaceChartSplitNode,
  WorkspaceChartPaneSpec,
} from "../models/types.js";

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
  let restoredPaneStatesByPane: Record<string, string | null> = {};
  let restoredIndicatorStyleOverridesByPane: Record<string, Record<string, SeriesStyleOverride>> = {};
  const drawingsByAsset = new Map<string, ChartStateSnapshot>();
  const drawingSignatureByAsset = new Map<string, string>();
  const drawingAppliedSignatureByPane = new Map<string, string>();
  const latestCandlesByPane = new Map<string, { latest: Candle; prevClose: number | null }>();
  const paneHostByPaneId = new Map<string, { stage: HTMLDivElement; chartLayer: HTMLDivElement }>();

  // root element fills host completely and hides any overflow
  const root = document.createElement("div");
  // vertical layout: top strip, then main workspace row
  root.className = "h-full w-full min-h-0 min-w-0 flex flex-col bg-workspace-bg text-workspace-text overflow-hidden font-sans select-none";

  const mainRow = document.createElement("div");
  mainRow.className = "flex flex-1 min-h-0 min-w-0 relative";
  const tilesRow = document.createElement("div");
  tilesRow.className = "flex flex-1 min-h-0 min-w-0 relative overflow-hidden";
  const tileSplitHandleLayer = document.createElement("div");
  tileSplitHandleLayer.className = "absolute inset-0 pointer-events-none z-50";

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
  tilesRow.appendChild(tileSplitHandleLayer);
  // Keep a mounted stage so wasm chart creation always has a DOM canvas target.
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
      syncPaneContractsFromState();
    }
  };
  const primaryAppendCandle = primaryChart.appendCandle.bind(primaryChart);
  primaryChart.appendCandle = (candle: Candle) => {
    const prevClose = latestCandlesByPane.get("price")?.latest.close ?? null;
    primaryAppendCandle(candle);
    latestCandlesByPane.set("price", { latest: candle, prevClose });
  };
  let scheduleFastDrawPane: (paneId: string) => void = () => {};
  let draw: () => void = () => {};
  let savePersistedState: () => void = () => {};
  let savePersistedStateImmediate: () => void = () => {};
  let renderWorkspaceTiles: () => void = () => {};
  let setupCanvasBackingStore: () => void = () => {};
  let applyIndicatorSetToTile: (chartTileId: string) => void = () => {};
  let syncPaneContractsFromState: (state?: ReturnType<typeof controller.getState>) => void = () => {};
  let tileChartOrchestrator: ReturnType<typeof createTileChartOrchestrator>;
  const tileRuntimeOrchestrator = createTileRuntimeOrchestrator({
    controller,
    createWasmChart,
    fallbackStage: stage,
    fallbackChartLayer: chartLayer,
    paneHostByPaneId,
    primaryRuntime: {
      paneId: "price",
      container: priceContainer,
      canvas,
      rawChart: primaryRawChart,
      chart: primaryChart,
      draw: () => primaryChart.draw(),
      resize: (width: number, height: number) => primaryChart.resize(width, height),
    },
    restoredIndicatorStyleOverridesByPane,
    restoredPaneStatesByPane,
    latestCandlesByPane,
    reconcilePaneSpecsForRuntime,
    openSymbolSearch: async (onSelect) => {
      const symbols = options.marketControls?.symbols ?? [];
      if (!symbols.length) return;
      createSymbolSearchModal({
        symbols,
        onSelect,
        onClose: () => {},
      });
    },
    onPaneSymbolSelect: async (paneId, nextSymbol) => {
      await tileChartOrchestrator.setPaneSymbol(paneId, nextSymbol);
    },
    redraw: () => draw(),
    redrawFast: (paneId) => scheduleFastDrawPane(paneId),
    bindRuntimeSource: (paneId) => tileChartOrchestrator.bindRuntimeSource(paneId),
    onIndicatorsReapplied: () => {
      syncPaneContractsFromState();
    },
  });
  const chartRuntimes = tileRuntimeOrchestrator.chartRuntimes;
  primaryChart.setTheme(controller.getState().theme);

  const getActiveRuntime = () =>
    tileRuntimeOrchestrator.getActiveRuntime();
  const getRuntime = (paneId: string) => tileRuntimeOrchestrator.getRuntime(paneId);
  const getPrimaryRuntime = () => tileRuntimeOrchestrator.getPrimaryRuntime();
  syncPaneContractsFromState = (state = controller.getState()) => {
    syncChartPaneContracts({
      state,
      chartRuntimes,
      paneHostByPaneId,
    });
    tileRuntimeOrchestrator.updateLayout();
  };
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

  const getActiveChartForTile = (chartTileId: string): DrishyaChartClient | null => {
    return getActiveChartForTileFromState(controller.getState(), chartTileId, getRuntime);
  };

  const getChartsForTile = (chartTileId: string): DrishyaChartClient[] => {
    return getChartsForTileFromState(controller.getState(), chartTileId, getRuntime);
  };
  const replayByChartTileId = new Map<string, ReplayController>();
  const ensureReplayForTile = (chartTileId: string) => {
    const chart = getActiveChartForTile(chartTileId) ?? getChartsForTile(chartTileId)[0] ?? null;
    if (!chart) return null;
    const existing = replayByChartTileId.get(chartTileId);
    if (existing) return existing;
    const replay = new ReplayController(chart);
    replayByChartTileId.set(chartTileId, replay);
    controller.setTileReplayController(chartTileId, replay);
    return replay;
  };
  const replaceReplayForTile = (chartTileId: string) => {
    replayByChartTileId.get(chartTileId)?.destroy();
    replayByChartTileId.delete(chartTileId);
    controller.setTileReplayController(chartTileId, null);
    return ensureReplayForTile(chartTileId);
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
        id: `workspace-split-${i}`,
        direction: "row",
        ratio: 0.5,
        first: tree,
        second: { type: "leaf", tileId: orderedTileIds[i]! },
      };
    }
    return tree;
  };

  const collectLayoutLeafTileIds = (node: WorkspaceLayoutNode): string[] => {
    if (node.type === "leaf") return [node.tileId];
    return [...collectLayoutLeafTileIds(node.first), ...collectLayoutLeafTileIds(node.second)];
  };

  const pruneLayoutTree = (
    node: WorkspaceLayoutNode,
    allowedTileIds: Set<string>
  ): WorkspaceLayoutNode | null => {
    if (node.type === "leaf") {
      return allowedTileIds.has(node.tileId) ? node : null;
    }
    const first = pruneLayoutTree(node.first, allowedTileIds);
    const second = pruneLayoutTree(node.second, allowedTileIds);
    if (!first && !second) return null;
    if (!first) return second;
    if (!second) return first;
    return { ...node, first, second };
  };

  const dedupeLayoutTreeLeaves = (
    node: WorkspaceLayoutNode,
    seen: Set<string> = new Set()
  ): WorkspaceLayoutNode | null => {
    if (node.type === "leaf") {
      if (seen.has(node.tileId)) return null;
      seen.add(node.tileId);
      return node;
    }
    const first = dedupeLayoutTreeLeaves(node.first, seen);
    const second = dedupeLayoutTreeLeaves(node.second, seen);
    if (!first && !second) return null;
    if (!first) return second;
    if (!second) return first;
    return { ...node, first, second };
  };

  const appendLeafToLayoutTree = (
    tree: WorkspaceLayoutNode,
    tileId: string
  ): WorkspaceLayoutNode => ({
    type: "split",
    id: `workspace-split-${tileId}`,
    direction: "row",
    ratio: 0.5,
    first: tree,
    second: { type: "leaf", tileId },
  });

  const buildWorkspaceDocumentFromControllerState = (
    layoutTreeOverride?: WorkspaceLayoutNode
  ): WorkspaceDocument => {
    const state = controller.getState();
    const orderedTileIds = collectWorkspaceTileOrder({
      layoutTree: layoutTreeOverride,
      workspaceTileOrder: state.workspaceTileOrder,
      workspaceTiles: state.workspaceTiles,
    });
    const normalizedLayoutTree = (() => {
      if (!orderedTileIds.length) return { type: "leaf", tileId: "tile-chart-1" } as WorkspaceLayoutNode;
      if (!layoutTreeOverride) return buildWorkspaceLayoutTreeFromControllerState();
      const allowed = new Set(orderedTileIds);
      let next = pruneLayoutTree(layoutTreeOverride, allowed) ?? {
        type: "leaf",
        tileId: orderedTileIds[0]!,
      };
      next = dedupeLayoutTreeLeaves(next) ?? {
        type: "leaf",
        tileId: orderedTileIds[0]!,
      };
      const existingLeafIds = new Set(collectLayoutLeafTileIds(next));
      for (const tileId of orderedTileIds) {
        if (existingLeafIds.has(tileId)) continue;
        next = appendLeafToLayoutTree(next, tileId);
        existingLeafIds.add(tileId);
      }
      return next;
    })();
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
          orderedTileIds.find((tileId) => state.workspaceTiles[tileId]?.chartTileId === state.activeChartTileId) ??
          orderedTileIds[0] ??
          null,
        layoutTree: normalizedLayoutTree,
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

  tileChartOrchestrator = createTileChartOrchestrator({
    controller,
    chartRuntimes,
    getRuntime,
    getActiveRuntime,
    getPrimaryRuntime,
    getChartForTile: getActiveChartForTile,
    getChartsForTile,
    reconcilePaneSpecsForRuntime,
    symbols: options.marketControls?.symbols ?? [],
    timeframes: options.marketControls?.timeframes,
    selectedSymbol: options.marketControls?.selectedSymbol,
    selectedTimeframe: options.marketControls?.selectedTimeframe,
    dataFeed: options.marketControls?.dataFeed,
    onSymbolChange: options.marketControls?.onSymbolChange,
    onTimeframeChange: options.marketControls?.onTimeframeChange,
    workspaceIntents,
    draw: () => draw(),
    renderWorkspaceTiles: () => renderWorkspaceTiles(),
    setupCanvasBackingStore: () => setupCanvasBackingStore(),
    savePersistedState: () => savePersistedState(),
    savePersistedStateImmediate: () => savePersistedStateImmediate(),
    onIndicatorSetApplied: () => {
      syncPaneContractsFromState();
      draw();
    },
  });
  applyIndicatorSetToTile = tileChartOrchestrator.applyIndicatorSetToTile;

  // Restore persisted state before building UI
  const restoreResult = restorePersistedWorkspace({
    persistedState: options.persistence?.initialState,
    controller,
    selectedTimeframe: options.marketControls?.selectedTimeframe,
    availableTimeframes: options.marketControls?.timeframes,
    chartTileTreeOpen: tileChartOrchestrator.getOpenStateMap(),
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
    tileChartOrchestrator.setObjectTreeWidth(restoreResult.restoredObjectTreeWidth);
  }
  if (restoreResult.restoredWorkspaceLayoutTree) {
    workspaceEngine.setState(
      buildWorkspaceDocumentFromControllerState(restoreResult.restoredWorkspaceLayoutTree)
    );
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
        chartTileTreeOpen: tileChartOrchestrator.getOpenStateMap(),
        selectedTimeframe: options.marketControls?.selectedTimeframe,
        availableTimeframes: options.marketControls?.timeframes,
      });
      const state = serializeWorkspacePersistenceEnvelope({
        state: stateNow,
        workspaceLayoutTree: workspaceEngine.getState().workspace.layoutTree,
        chartTileIndicatorTokens: Object.fromEntries(
          Object.keys(stateNow.chartTiles).map((chartTileId) => [
            chartTileId,
            controller.getChartTileIndicatorTokens(chartTileId),
          ])
        ),
        objectTreeWidth: tileChartOrchestrator.getObjectTreeWidth(),
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
  savePersistedState = () => {
    if (!options.persistence?.onStateChange) return;
    persistenceScheduler.schedule();
  };
  savePersistedStateImmediate = () => {
    persistenceScheduler.flush();
  };

  const initializeChartTileSource = async (chartTileId: string) => {
    const { symbol } = initializeChartTileSourceState({
      chartTileId,
      controller,
      marketControls: options.marketControls,
    });
    tileChartOrchestrator.syncSources();
    if (symbol) {
      await options.marketControls?.onSymbolChange?.(symbol);
    }
  };

  const stripHandle = createLeftStrip({
    tools: WORKSPACE_DRAW_TOOLS,
    controller,
    drawingToolsEnabled: typeof getPrimaryRuntime()?.rawChart.set_drawing_tool_mode === "function",
    onAddChartTile: async () => {
      const chartTileId = controller.addChartTile();
      await initializeChartTileSource(chartTileId);
      ensureReplayForTile(chartTileId);
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

  const syncTileWidths = () => {
    syncChartTileShellWidths(
      {
        ...controller.getState(),
        workspaceLayoutTree: workspaceEngine.getState().workspace.layoutTree,
      },
      tileShellById,
      tilesRow
    );
  };

  const renderChartTabs = (chartTileId: string) => {
    const tabStrip = chartTileTabById.get(chartTileId);
    if (!tabStrip) return;
    const chartTile = controller.getState().chartTiles[chartTileId];
    const closeTab = (tabId: string) => {
      const result = closeChartTab(controller, chartTileId, tabId);
      if (result === "tab_closed") {
        replaceReplayForTile(chartTileId);
      } else if (result === "last_tab_remaining") {
        if (!removeWorkspaceTileByChartTileId(controller, chartTileId)) return;
        replayByChartTileId.get(chartTileId)?.destroy();
        replayByChartTileId.delete(chartTileId);
        controller.setTileReplayController(chartTileId, null);
      } else {
        return;
      }
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
            await tileChartOrchestrator.setPaneTimeframe(activePaneId, tf);
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
          tileChartOrchestrator.openIndicatorPicker(chartTileId, activeRuntime?.chart ?? null);
        };
        actionsContainer.appendChild(indBtn);

        const replayState = controller.getChartTileReplayState(chartTileId);
        const replayBtn = mkHeaderBtn("Replay");
        replayBtn.prepend(makeSvgIcon("play", "h-3.5 w-3.5"));
        replayBtn.onclick = () => {
          ensureReplayForTile(chartTileId);
          controller.replay(chartTileId).play();
        };
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
            mkReplayIconBtn("pause", () => controller.replay(chartTileId).pause()),
            mkReplayIconBtn("stop", () => controller.replay(chartTileId).stop()),
            mkReplayIconBtn("step-forward", () => { controller.replay(chartTileId).stepBar(); }),
            mkReplayIconBtn("skip-forward", () => { controller.replay(chartTileId).stepEvent(); })
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
          replaceReplayForTile(chartTileId);
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
            replaceReplayForTile(chartTileId);
            await tileChartOrchestrator.setPaneSymbol(created.paneId, symbol);
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
        tileChartOrchestrator.toggleChartTileTree(chartTileId);
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
        replayByChartTileId.get(chartTileId)?.destroy();
        replayByChartTileId.delete(chartTileId);
        controller.setTileReplayController(chartTileId, null);
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
        replaceReplayForTile(chartTileId);
        tileChartOrchestrator.applyIndicatorSetToTile(chartTileId);
      },
      onCloseTabOrTile: closeTab,
      appendActions: (strip) => {
        const actions = document.createElement("div");
        actions.className = "ml-auto h-7 flex items-center gap-0.5";
        actions.dataset.noTileDrag = "1";
        renderHeaderActions(actions);
        strip.appendChild(actions);
      },
    });
  };

  renderWorkspaceTiles = () => {
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
          resolveDropTarget: (clientX, clientY, draggedTileId) =>
            resolveWorkspaceTileDropTarget({
              orderedChartTileIds: collectWorkspaceChartTileOrder({
                layoutTree: workspaceEngine.getState().workspace.layoutTree,
                workspaceTileOrder: controller.getState().workspaceTileOrder,
                workspaceTiles: controller.getState().workspaceTiles,
              }),
              tileShellById,
              clientX,
              clientY,
              excludeTileId: draggedTileId,
            }),
          onPreview: (target) => setWorkspaceDropPreview(target),
          onDrop: (draggedTileId, target) => {
            moveExistingTileToDropTarget(draggedTileId, target);
          },
          onDragEnd: () => setWorkspaceDropPreview(null),
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
      ensureTreeHandleForTile: tileChartOrchestrator.ensureTreeHandleForTile,
      isChartTileTreeOpen: tileChartOrchestrator.isChartTileTreeOpen,
      getRuntime,
      onChartTileHeaderClick: (chartTileId) => controller.setActiveChartTile(chartTileId),
      parseChartTabDragPayload,
      moveChartTab: (sourceChartTileId, tabId, targetChartTileId, targetIndex) => {
        controller.moveChartTab(sourceChartTileId, tabId, targetChartTileId, targetIndex);
      },
      attachTileResizer: ({ shell }) => {
        const resizer = shell.querySelector("[data-tile-resizer='1']") as HTMLDivElement | null;
        if (resizer) {
          resizer.remove();
        }
      },
      projectRuntimeLayout: () => tileRuntimeOrchestrator.updateLayout(),
      afterProject: () => {
        syncTileWidths();
        renderWorkspaceSplitHandles();
        renderIndicatorOverlays();
      },
    });
  };

  let suppressLayoutSync = false;

  const treeContainsTile = (node: WorkspaceLayoutNode, tileId: string): boolean => {
    if (node.type === "leaf") return node.tileId === tileId;
    return treeContainsTile(node.first, tileId) || treeContainsTile(node.second, tileId);
  };

  const resolveWorkspaceLayoutRectAtPath = (
    node: WorkspaceLayoutNode,
    path: readonly number[],
    rect: { x: number; y: number; w: number; h: number },
    depth = 0
  ): { x: number; y: number; w: number; h: number } | null => {
    if (depth === path.length) return rect;
    if (node.type === "leaf") return null;
    const ratio = Math.max(0.05, Math.min(0.95, node.ratio));
    if (node.direction === "row") {
      const firstW = Math.max(1, Math.floor(rect.w * ratio));
      const secondW = Math.max(1, rect.w - firstW);
      const branch = path[depth] === 0 ? node.first : node.second;
      const nextRect =
        path[depth] === 0
          ? { x: rect.x, y: rect.y, w: firstW, h: rect.h }
          : { x: rect.x + firstW, y: rect.y, w: secondW, h: rect.h };
      return resolveWorkspaceLayoutRectAtPath(branch, path, nextRect, depth + 1);
    }
    const firstH = Math.max(1, Math.floor(rect.h * ratio));
    const secondH = Math.max(1, rect.h - firstH);
    const branch = path[depth] === 0 ? node.first : node.second;
    const nextRect =
      path[depth] === 0
        ? { x: rect.x, y: rect.y, w: rect.w, h: firstH }
        : { x: rect.x, y: rect.y + firstH, w: rect.w, h: secondH };
    return resolveWorkspaceLayoutRectAtPath(branch, path, nextRect, depth + 1);
  };

  const setWorkspaceSplitRatioAtPath = (
    node: WorkspaceLayoutNode,
    path: readonly number[],
    ratio: number,
    depth = 0
  ): WorkspaceLayoutNode => {
    const clampedRatio = Math.max(0.05, Math.min(0.95, ratio));
    if (depth === path.length) {
      if (node.type === "leaf") return node;
      return { ...node, ratio: clampedRatio };
    }
    if (node.type === "leaf") return node;
    if (path[depth] === 0) {
      return {
        ...node,
        first: setWorkspaceSplitRatioAtPath(node.first, path, clampedRatio, depth + 1),
      };
    }
    return {
      ...node,
      second: setWorkspaceSplitRatioAtPath(node.second, path, clampedRatio, depth + 1),
    };
  };

  const getWorkspaceLayoutNodeAtPath = (
    node: WorkspaceLayoutNode,
    path: readonly number[],
    depth = 0
  ): WorkspaceLayoutNode | null => {
    if (depth === path.length) return node;
    if (node.type === "leaf") return null;
    const branch = path[depth] === 0 ? node.first : node.second;
    return getWorkspaceLayoutNodeAtPath(branch, path, depth + 1);
  };

  const getRenderableWorkspaceLayoutTree = (): WorkspaceLayoutNode => {
    const state = controller.getState();
    const fullTree = workspaceEngine.getState().workspace.layoutTree;
    const orderedChartTileIds = collectWorkspaceTileOrder({
      layoutTree: fullTree,
      workspaceTileOrder: state.workspaceTileOrder,
      workspaceTiles: state.workspaceTiles,
    }).filter((tileId) => state.workspaceTiles[tileId]?.kind === "chart");
    if (!orderedChartTileIds.length) {
      return { type: "leaf", tileId: "tile-chart-1" };
    }
    const allowed = new Set(orderedChartTileIds);
    let next = pruneLayoutTree(fullTree, allowed) ?? {
      type: "leaf",
      tileId: orderedChartTileIds[0]!,
    };
    next = dedupeLayoutTreeLeaves(next) ?? {
      type: "leaf",
      tileId: orderedChartTileIds[0]!,
    };
    const existingLeafIds = new Set(collectLayoutLeafTileIds(next));
    for (const tileId of orderedChartTileIds) {
      if (existingLeafIds.has(tileId)) continue;
      next = appendLeafToLayoutTree(next, tileId);
      existingLeafIds.add(tileId);
    }
    return next;
  };

  const renderWorkspaceSplitHandles = () => {
    tileSplitHandleLayer.innerHTML = "";
    const layoutTree = getRenderableWorkspaceLayoutTree();
    if (layoutTree.type === "leaf") return;
    const rowRect = tilesRow.getBoundingClientRect();
    const rootRect = {
      x: 0,
      y: 0,
      w: Math.max(1, Math.floor(rowRect.width)),
      h: Math.max(1, Math.floor(rowRect.height)),
    };
    if (rootRect.w <= 1 || rootRect.h <= 1) return;
    const minRatio = 0.08;
    const appendHandles = (
      node: WorkspaceLayoutNode,
      path: number[],
      rect: { x: number; y: number; w: number; h: number }
    ) => {
      if (node.type === "leaf") return;
      const ratio = Math.max(0.05, Math.min(0.95, node.ratio));
      if (node.direction === "row") {
        const firstW = Math.max(1, Math.floor(rect.w * ratio));
        const secondW = Math.max(1, rect.w - firstW);
        const splitX = rect.x + firstW;
        const handle = document.createElement("div");
        handle.className =
          "absolute pointer-events-auto cursor-col-resize bg-zinc-700/25 hover:bg-zinc-700/60 transition-colors";
        handle.style.left = `${Math.round(splitX) - 4}px`;
        handle.style.top = `${rect.y}px`;
        handle.style.width = "8px";
        handle.style.height = `${rect.h}px`;
        handle.onpointerdown = (event) => {
          event.preventDefault();
          event.stopPropagation();
          let rafId: number | null = null;
          let pendingClientX: number | null = null;
          let pendingClientY: number | null = null;
          const activePath = [...path];
          const applyPending = () => {
            rafId = null;
            if (pendingClientX === null || pendingClientY === null) return;
            const clientX = pendingClientX;
            const clientY = pendingClientY;
            pendingClientX = null;
            pendingClientY = null;
            const activeTree = getRenderableWorkspaceLayoutTree();
            const activeNode = getWorkspaceLayoutNodeAtPath(activeTree, activePath);
            if (!activeNode || activeNode.type === "leaf") return;
            const activeRowRect = tilesRow.getBoundingClientRect();
            const activeRootRect = {
              x: 0,
              y: 0,
              w: Math.max(1, Math.floor(activeRowRect.width)),
              h: Math.max(1, Math.floor(activeRowRect.height)),
            };
            const splitRect = resolveWorkspaceLayoutRectAtPath(activeTree, activePath, activeRootRect);
            if (!splitRect || splitRect.w <= 1 || splitRect.h <= 1) return;
            const localX = clientX - activeRowRect.left;
            const localY = clientY - activeRowRect.top;
            const ratioByX = (localX - splitRect.x) / Math.max(1, splitRect.w);
            const ratioByY = (localY - splitRect.y) / Math.max(1, splitRect.h);
            const ratio =
              activeNode.direction === "row"
                ? Math.max(minRatio, Math.min(1 - minRatio, ratioByX))
                : Math.max(minRatio, Math.min(1 - minRatio, ratioByY));
            const nextTree = setWorkspaceSplitRatioAtPath(activeTree, activePath, ratio);
            workspaceEngine.setState(buildWorkspaceDocumentFromControllerState(nextTree));
            renderWorkspaceTiles();
            draw();
          };
          const queueApply = (clientX: number, clientY: number) => {
            pendingClientX = clientX;
            pendingClientY = clientY;
            if (rafId !== null) return;
            rafId = requestAnimationFrame(applyPending);
          };
          const onMove = (moveEvent: PointerEvent) => {
            queueApply(moveEvent.clientX, moveEvent.clientY);
          };
          const onUp = () => {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
            window.removeEventListener("pointercancel", onUp);
            if (rafId !== null) {
              cancelAnimationFrame(rafId);
              rafId = null;
            }
            if (pendingClientX !== null && pendingClientY !== null) {
              applyPending();
            }
            savePersistedState();
          };
          window.addEventListener("pointermove", onMove);
          window.addEventListener("pointerup", onUp);
          window.addEventListener("pointercancel", onUp);
        };
        tileSplitHandleLayer.appendChild(handle);
        appendHandles(node.first, [...path, 0], { x: rect.x, y: rect.y, w: firstW, h: rect.h });
        appendHandles(node.second, [...path, 1], {
          x: rect.x + firstW,
          y: rect.y,
          w: secondW,
          h: rect.h,
        });
        return;
      }
      const firstH = Math.max(1, Math.floor(rect.h * ratio));
      const secondH = Math.max(1, rect.h - firstH);
      const splitY = rect.y + firstH;
      const handle = document.createElement("div");
      handle.className =
        "absolute pointer-events-auto cursor-row-resize bg-zinc-700/25 hover:bg-zinc-700/60 transition-colors";
      handle.style.left = `${rect.x}px`;
      handle.style.top = `${Math.round(splitY) - 4}px`;
      handle.style.width = `${rect.w}px`;
      handle.style.height = "8px";
      handle.onpointerdown = (event) => {
        event.preventDefault();
        event.stopPropagation();
        let rafId: number | null = null;
        let pendingClientX: number | null = null;
        let pendingClientY: number | null = null;
        const activePath = [...path];
        const applyPending = () => {
          rafId = null;
          if (pendingClientX === null || pendingClientY === null) return;
          const clientX = pendingClientX;
          const clientY = pendingClientY;
          pendingClientX = null;
          pendingClientY = null;
          const activeTree = getRenderableWorkspaceLayoutTree();
          const activeNode = getWorkspaceLayoutNodeAtPath(activeTree, activePath);
          if (!activeNode || activeNode.type === "leaf") return;
          const activeRowRect = tilesRow.getBoundingClientRect();
          const activeRootRect = {
            x: 0,
            y: 0,
            w: Math.max(1, Math.floor(activeRowRect.width)),
            h: Math.max(1, Math.floor(activeRowRect.height)),
          };
          const splitRect = resolveWorkspaceLayoutRectAtPath(activeTree, activePath, activeRootRect);
          if (!splitRect || splitRect.w <= 1 || splitRect.h <= 1) return;
          const localX = clientX - activeRowRect.left;
          const localY = clientY - activeRowRect.top;
          const ratioByX = (localX - splitRect.x) / Math.max(1, splitRect.w);
          const ratioByY = (localY - splitRect.y) / Math.max(1, splitRect.h);
          const ratio =
            activeNode.direction === "row"
              ? Math.max(minRatio, Math.min(1 - minRatio, ratioByX))
              : Math.max(minRatio, Math.min(1 - minRatio, ratioByY));
          const nextTree = setWorkspaceSplitRatioAtPath(activeTree, activePath, ratio);
          workspaceEngine.setState(buildWorkspaceDocumentFromControllerState(nextTree));
          renderWorkspaceTiles();
          draw();
        };
        const queueApply = (clientX: number, clientY: number) => {
          pendingClientX = clientX;
          pendingClientY = clientY;
          if (rafId !== null) return;
          rafId = requestAnimationFrame(applyPending);
        };
        const onMove = (moveEvent: PointerEvent) => {
          queueApply(moveEvent.clientX, moveEvent.clientY);
        };
        const onUp = () => {
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", onUp);
          window.removeEventListener("pointercancel", onUp);
          if (rafId !== null) {
            cancelAnimationFrame(rafId);
            rafId = null;
          }
          if (pendingClientX !== null && pendingClientY !== null) {
            applyPending();
          }
          savePersistedState();
        };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
        window.addEventListener("pointercancel", onUp);
      };
      tileSplitHandleLayer.appendChild(handle);
      appendHandles(node.first, [...path, 0], { x: rect.x, y: rect.y, w: rect.w, h: firstH });
      appendHandles(node.second, [...path, 1], {
        x: rect.x,
        y: rect.y + firstH,
        w: rect.w,
        h: secondH,
      });
    };
    appendHandles(layoutTree, [], rootRect);
  };

  const getCanonicalLayoutTree = (): WorkspaceLayoutNode =>
    buildWorkspaceDocumentFromControllerState(workspaceEngine.getState().workspace.layoutTree).workspace.layoutTree;

  const commitLayoutTree = (tree: WorkspaceLayoutNode) => {
    workspaceEngine.setState(buildWorkspaceDocumentFromControllerState(tree));
    renderWorkspaceTiles();
    draw();
    savePersistedState();
  };

  const addChartTileAtDropTarget = async (target: WorkspaceTileDropTarget | null) => {
    const treeBefore = getCanonicalLayoutTree();

    suppressLayoutSync = true;
    try {
      const chartTileId = controller.addChartTile();
      await initializeChartTileSource(chartTileId);
      ensureReplayForTile(chartTileId);
    } finally {
      suppressLayoutSync = false;
    }

    const postAddState = controller.getState();
    const treeAfterAdd = buildWorkspaceDocumentFromControllerState(treeBefore).workspace.layoutTree;
    const allTileIds = collectWorkspaceTileOrder({
      layoutTree: treeAfterAdd,
      workspaceTileOrder: postAddState.workspaceTileOrder,
      workspaceTiles: postAddState.workspaceTiles,
    });
    const leafIdsBefore = new Set(collectLayoutLeafTileIds(treeBefore));
    const newTileId = allTileIds.find((id) => !leafIdsBefore.has(id) && postAddState.workspaceTiles[id]?.kind === "chart");
    if (!newTileId) {
      commitLayoutTree(treeAfterAdd);
      return;
    }

    if (!target) {
      commitLayoutTree(treeAfterAdd);
      return;
    }

    const baseTree = buildWorkspaceDocumentFromControllerState(treeBefore).workspace.layoutTree;
    let treeWithNewLeaf = baseTree;
    if (!treeContainsTile(treeWithNewLeaf, newTileId)) {
      treeWithNewLeaf = appendLeafToLayoutTree(treeWithNewLeaf, newTileId);
    }

    const finalTree = applyWorkspaceTileDrop({
      layoutTree: treeWithNewLeaf,
      tileId: newTileId,
      targetTileId: target.tileId,
      side: target.side,
    });

    commitLayoutTree(finalTree);
  };

  const moveExistingTileToDropTarget = (draggedTileId: string, target: WorkspaceTileDropTarget) => {
    const currentTree = getCanonicalLayoutTree();
    const nextTree = applyWorkspaceTileDrop({
      layoutTree: currentTree,
      tileId: draggedTileId,
      targetTileId: target.tileId,
      side: target.side,
    });
    if (nextTree === currentTree) return;
    commitLayoutTree(nextTree);
  };

  const tileShellById = new Map<string, HTMLDivElement>();
  const tileHeaderById = new Map<string, HTMLDivElement>();
  const chartTileBodyByChartTileId = new Map<string, HTMLDivElement>();
  const chartTileTabById = new Map<string, HTMLDivElement>();
  const chartTileStageByChartTileId = new Map<string, { stage: HTMLDivElement; chartLayer: HTMLDivElement }>();
  const indicatorOverlayByPaneId = new Map<string, HTMLDivElement>();
  let pendingAddTileDropTarget: WorkspaceTileDropTarget | null = null;
  const workspaceDropPreview = document.createElement("div");
  workspaceDropPreview.className =
    "absolute pointer-events-none z-40 border border-sky-400/90 bg-sky-500/20 rounded-sm transition-all";
  workspaceDropPreview.style.display = "none";

  const setWorkspaceDropPreview = (target: WorkspaceTileDropTarget | null) => {
    pendingAddTileDropTarget = target;
    if (!target) {
      workspaceDropPreview.style.display = "none";
      return;
    }
    const rowRect = tilesRow.getBoundingClientRect();
    const localX = target.previewRect.x - rowRect.left;
    const localY = target.previewRect.y - rowRect.top;
    workspaceDropPreview.style.display = "";
    workspaceDropPreview.style.left = `${Math.round(localX)}px`;
    workspaceDropPreview.style.top = `${Math.round(localY)}px`;
    workspaceDropPreview.style.width = `${Math.max(1, Math.round(target.previewRect.w))}px`;
    workspaceDropPreview.style.height = `${Math.max(1, Math.round(target.previewRect.h))}px`;
  };

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
      openIndicatorConfig: (target, chart) => tileChartOrchestrator.openIndicatorConfig(target, chart ?? null),
      workspaceIntents,
      draw,
      options,
    });
  };

  // Final assembly of UI pieces
  mainRow.insertBefore(stripHandle.root, tilesRow);
  tilesRow.appendChild(workspaceDropPreview);
  tilesRow.ondragover = (event) => {
    const isAddTileDrag = event.dataTransfer?.types?.includes("application/x-drishya-add-chart-tile");
    if (!isAddTileDrag) return;
    event.preventDefault();
    const target = resolveWorkspaceTileDropTarget({
      orderedChartTileIds: collectWorkspaceChartTileOrder({
        layoutTree: workspaceEngine.getState().workspace.layoutTree,
        workspaceTileOrder: controller.getState().workspaceTileOrder,
        workspaceTiles: controller.getState().workspaceTiles,
      }),
      tileShellById,
      clientX: event.clientX,
      clientY: event.clientY,
    });
    setWorkspaceDropPreview(target);
  };
  tilesRow.ondragleave = (event) => {
    const rect = tilesRow.getBoundingClientRect();
    const pointerOutside =
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom;
    const next = event.relatedTarget as Node | null;
    if (pointerOutside || (!next && event.clientX === 0 && event.clientY === 0)) {
      setWorkspaceDropPreview(null);
    }
  };
  tilesRow.ondrop = (event) => {
    const isAddTileDrop = event.dataTransfer?.types?.includes("application/x-drishya-add-chart-tile");
    if (!isAddTileDrop) return;
    event.preventDefault();
    const target = pendingAddTileDropTarget;
    pendingAddTileDropTarget = null;
    workspaceDropPreview.style.display = "none";
    void addChartTileAtDropTarget(target);
  };

  setupCanvasBackingStore = () => {
    tileRuntimeOrchestrator.updateLayout();
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
  scheduleFastDrawPane = (paneId: string) => {
    if (!chartRuntimes.has(paneId)) return;
    fastDrawTargets.add(paneId);
    if (fastDrawRafId !== null) return;
    fastDrawRafId = requestAnimationFrame(flushFastDraw);
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

  draw = () => {
    for (const runtime of chartRuntimes.values()) {
      runtime.draw();
    }
    projectAssetScopedDrawings({
      controller,
      chartRuntimes,
      snapshotsByAsset: drawingsByAsset,
      signatureByAsset: drawingSignatureByAsset,
      appliedSignatureByPane: drawingAppliedSignatureByPane,
      getCandlesForPane: (paneId) => tileChartOrchestrator.getCandlesForPane(paneId),
    });
    tileChartOrchestrator.refreshOpenTrees();
    refreshConfigPanel();
    updateTextCaret();
    renderIndicatorOverlays();
    savePersistedState();
  };

  const syncReadoutSourceLabel = (_state: ReturnType<typeof controller.getState>) => {
    for (const paneId of chartRuntimes.keys()) {
      const runtime = getRuntime(paneId);
      if (!runtime) continue;
      runtime.chart.setReadoutSourceLabel(tileChartOrchestrator.getSourceLabel(paneId));
    }
  };

  const unbindInteractions = () => {
    tileRuntimeOrchestrator.unbindInteractions();
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
  let lastSourceSyncJson = "";
  const unsubscribe = controller.subscribe((state) => {
    if (!suppressLayoutSync) {
      workspaceEngine.setState(
        buildWorkspaceDocumentFromControllerState(workspaceEngine.getState().workspace.layoutTree)
      );
    }
    const orderedTileIds = collectWorkspaceTileOrder({
      layoutTree: workspaceEngine.getState().workspace.layoutTree,
      workspaceTileOrder: state.workspaceTileOrder,
      workspaceTiles: state.workspaceTiles,
    });
    const layout = state.paneLayout;
    const currentSourceSyncJson = JSON.stringify({
      chartPaneSources: state.chartPaneSources,
      chartPanes: Object.keys(state.chartPanes).sort(),
      chartTiles: Object.fromEntries(
        Object.entries(state.chartTiles).map(([chartTileId, chartTile]) => [
          chartTileId,
          {
            activeTabId: chartTile.activeTabId,
            tabPaneIds: chartTile.tabs.map((tab) => tab.chartPaneId),
          },
        ])
      ),
    });
    const currentLayoutJson = JSON.stringify({
      theme: state.theme,
      tool: state.activeTool,
      cursor: state.cursorMode,
      axis: state.priceAxisMode,
      activeChartPaneId: state.activeChartPaneId,
      objectTreeOpen: state.isObjectTreeOpen,
      workspaceTileOrder: orderedTileIds,
      workspaceTileRatios: Object.fromEntries(
        orderedTileIds.map((tileId) => [tileId, state.workspaceTiles[tileId]?.widthRatio ?? 0])
      ),
      chartTileTreeOpen: Object.fromEntries(tileChartOrchestrator.getOpenStateMap().entries()),
      objectTreeWidth: tileChartOrchestrator.getObjectTreeWidth(),
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
      syncPaneContractsFromState(state);
      syncReadoutSourceLabel(state);
      if (currentSourceSyncJson !== lastSourceSyncJson) {
        lastSourceSyncJson = currentSourceSyncJson;
        tileChartOrchestrator.syncSources();
      }

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
    ensureReplayForTile(chartTileId);
  }
  for (const chartTileId of Object.keys(controller.getState().chartTiles)) {
    applyIndicatorSetToTile(chartTileId);
  }
  restoreAssetScopedDrawings({
    controller,
    chartRuntimes,
    snapshotsByAsset: drawingsByAsset,
    signatureByAsset: drawingSignatureByAsset,
    appliedSignatureByPane: drawingAppliedSignatureByPane,
    getCandlesForPane: (paneId) => tileChartOrchestrator.getCandlesForPane(paneId),
  });
  setupCanvasBackingStore();
  tileChartOrchestrator.syncSources();
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
  const replayHandle = {
    play: (chartTileId?: string) => {
      const target = chartTileId ?? controller.getState().activeChartTileId;
      ensureReplayForTile(target);
      controller.replay(target).play();
    },
    pause: (chartTileId?: string) => {
      const target = chartTileId ?? controller.getState().activeChartTileId;
      controller.replay(target).pause();
    },
    stop: (chartTileId?: string) => {
      const target = chartTileId ?? controller.getState().activeChartTileId;
      controller.replay(target).stop();
    },
    stepBar: (chartTileId?: string) => {
      const target = chartTileId ?? controller.getState().activeChartTileId;
      return controller.replay(target).stepBar();
    },
    stepEvent: (chartTileId?: string) => {
      const target = chartTileId ?? controller.getState().activeChartTileId;
      return controller.replay(target).stepEvent();
    },
    seekTs: (ts: number, chartTileId?: string) => {
      const target = chartTileId ?? controller.getState().activeChartTileId;
      controller.replay(target).seekTs(ts);
    },
    state: (chartTileId?: string) => {
      const target = chartTileId ?? controller.getState().activeChartTileId;
      return controller.replay(target).state();
    },
  };

  return {
    root: root as HTMLDivElement,
    strip: stripHandle.root,
    tree: (() => {
      const activeTileId = controller.getState().activeChartTileId;
      return tileChartOrchestrator.getActiveTreeRoot(activeTileId);
    })(),
    controller,
    replay: replayHandle,
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
      tileChartOrchestrator.refreshActiveTree(activeTileId);
    },
    listCharts: () => Object.keys(controller.getState().chartPanes),
    getChart: (chartPaneId) => getRuntime(chartPaneId),
    getActiveChart: () => chartRuntimes.get(controller.getState().activeChartPaneId) ?? null,
    destroy: () => {
      if (configPanelEl) configPanelEl.remove();
      unsubscribe();
      for (const [chartTileId, replay] of replayByChartTileId.entries()) {
        replay.destroy();
        controller.setTileReplayController(chartTileId, null);
      }
      replayByChartTileId.clear();
      stripHandle.destroy();
      tileChartOrchestrator.dispose();
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

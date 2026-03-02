import type { WorkspaceController } from "../../workspace/controllers/WorkspaceController.js";
import type { ChartPaneRuntime } from "../../workspace/models/runtimeTypes.js";
import type { WorkspaceIntentController } from "../../workspace/controllers/workspaceIntentController.js";
import type { DrishyaChartClient } from "../../wasm/client.js";
import { createTileSourceOrchestrator } from "./createTileSourceOrchestrator.js";
import { createTileObjectTreeOrchestrator } from "./createTileObjectTreeOrchestrator.js";
import { projectTileIndicators } from "../../workspace/projectors/projectIndicators.js";
import { createOpenIndicatorConfig } from "../../workspace/services/indicatorConfigFlow.js";
import {
  applyIndicatorSetToChart,
  defaultIndicatorToken,
} from "../../workspace/services/indicatorRuntime.js";
import {
  canonicalIndicatorId,
  decodeIndicatorToken,
  normalizeIndicatorIds,
} from "../../workspace/services/indicatorIdentity.js";
import { createIndicatorModal } from "../../workspace/views/IndicatorModal.js";

interface CreateTileChartOrchestratorOptions {
  controller: WorkspaceController;
  chartRuntimes: Map<string, ChartPaneRuntime>;
  getRuntime: (paneId: string) => ChartPaneRuntime | null;
  getActiveRuntime: () => ChartPaneRuntime | null;
  getPrimaryRuntime: () => ChartPaneRuntime | null;
  getChartForTile: (chartTileId: string) => DrishyaChartClient | null;
  getChartsForTile: (chartTileId: string) => DrishyaChartClient[];
  reconcilePaneSpecsForRuntime: (options: {
    ownerChartPaneId: string;
    chart: DrishyaChartClient;
    controller: WorkspaceController;
  }) => void;
  workspaceIntents: WorkspaceIntentController;
  symbols?: readonly string[];
  timeframes?: readonly string[];
  selectedSymbol?: string;
  selectedTimeframe?: string;
  dataFeed?: {
    loadSnapshot: (source: { symbol: string; timeframe: string }) => Promise<any[]>;
    subscribe: (
      source: { symbol: string; timeframe: string },
      onCandle: (candle: any) => void
    ) => void | (() => void) | Promise<void | (() => void)>;
    sourceKey?: (source: { symbol: string; timeframe: string }) => string;
  };
  onSymbolChange?: (symbol: string) => Promise<void> | void;
  onTimeframeChange?: (timeframe: string) => Promise<void> | void;
  draw: () => void;
  renderWorkspaceTiles: () => void;
  setupCanvasBackingStore: () => void;
  savePersistedState: () => void;
  savePersistedStateImmediate: () => void;
}

export interface TileChartOrchestrator {
  applyIndicatorSetToTile: (chartTileId: string) => void;
  openIndicatorConfig: (
    target: { paneId?: string; seriesId?: string; indicatorId?: string },
    chart: DrishyaChartClient | null
  ) => void;
  openIndicatorPicker: (chartTileId: string, activeChart: DrishyaChartClient | null) => void;
  setPaneSymbol: (paneId: string, symbol: string) => Promise<void>;
  setPaneTimeframe: (paneId: string, timeframe: string) => Promise<void>;
  syncSources: () => void;
  bindRuntimeSource: (paneId: string) => void;
  getSourceLabel: (paneId: string) => string;
  ensureTreeHandleForTile: (chartTileId: string) => ReturnType<
    ReturnType<typeof createTileObjectTreeOrchestrator>["ensureHandleForTile"]
  >;
  isChartTileTreeOpen: (chartTileId: string) => boolean;
  toggleChartTileTree: (chartTileId: string) => void;
  getOpenStateMap: () => Map<string, boolean>;
  setObjectTreeWidth: (width: number) => void;
  getObjectTreeWidth: () => number;
  refreshOpenTrees: () => void;
  refreshActiveTree: (chartTileId: string) => void;
  getActiveTreeRoot: (chartTileId: string) => HTMLElement;
  dispose: () => void;
}

export function createTileChartOrchestrator(options: CreateTileChartOrchestratorOptions): TileChartOrchestrator {
  const applyIndicatorSetToTile = (chartTileId: string) => {
    const ids = options.controller.getChartTileIndicatorTokens(chartTileId);
    const chartTile = options.controller.getState().chartTiles[chartTileId];
    projectTileIndicators({
      chartTileId,
      chartTile,
      indicatorIds: ids,
      controller: options.controller,
      getRuntime: options.getRuntime,
      reconcilePaneSpecsForRuntime: options.reconcilePaneSpecsForRuntime,
    });
  };

  const openIndicatorConfig = createOpenIndicatorConfig({
    chartRuntimes: options.chartRuntimes,
    controller: options.controller,
    getRuntime: options.getRuntime,
    draw: () => options.draw(),
    savePersistedStateImmediate: options.savePersistedStateImmediate,
    getActiveChart: () => options.getActiveRuntime()?.chart ?? null,
    getPrimaryChart: () => options.getPrimaryRuntime()?.chart ?? null,
  });

  const openDrawingConfig = (drawingId: number, chartHint?: DrishyaChartClient | null) => {
    const chart = chartHint ?? options.getActiveRuntime()?.chart ?? options.getPrimaryRuntime()?.chart ?? null;
    if (!chart) return;
    if (!chart.selectDrawingById(drawingId)) return;
    const runtime = [...options.chartRuntimes.values()].find((entry) => entry.chart === chart) ?? null;
    if (runtime && options.controller.getState().activeChartPaneId !== runtime.paneId) {
      options.controller.setActiveChartPane(runtime.paneId);
    }
    options.draw();
  };

  const tileSourceOrchestrator = createTileSourceOrchestrator({
    controller: options.controller,
    getRuntime: options.getRuntime,
    symbols: options.symbols,
    timeframes: options.timeframes,
    selectedSymbol: options.selectedSymbol,
    selectedTimeframe: options.selectedTimeframe,
    dataFeed: options.dataFeed,
    onDataMutated: options.savePersistedState,
  });

  const tileObjectTreeOrchestrator = createTileObjectTreeOrchestrator({
    controller: options.controller,
    symbols: options.symbols ?? [],
    workspaceIntents: options.workspaceIntents,
    getChartForTile: options.getChartForTile,
    onPaneSourceChange: async (paneId, symbol) => {
      options.controller.setChartPaneSource(paneId, { symbol });
      tileSourceOrchestrator.sync();
      await options.onSymbolChange?.(symbol);
      options.draw();
    },
    onIndicatorConfig: (target, chart) => openIndicatorConfig(target, chart),
    onDrawingConfig: (drawingId, chart) => openDrawingConfig(drawingId, chart),
    onLayoutInvalidated: () => {
      options.renderWorkspaceTiles();
      options.setupCanvasBackingStore();
      options.draw();
    },
    onMutate: () => options.draw(),
  });

  const openIndicatorPicker = (chartTileId: string, activeChart: DrishyaChartClient | null) => {
    if (!activeChart) return;
    createIndicatorModal({
      chart: activeChart,
      controller: options.controller,
      getTargetCharts: () => {
        const charts = options.getChartsForTile(chartTileId);
        return charts.length ? charts : [activeChart];
      },
      onIndicatorSelected: (indicatorId) => {
        const current = options.controller.getChartTileIndicatorTokens(chartTileId);
        const base = canonicalIndicatorId(indicatorId);
        const existingCount = current.filter((t) => decodeIndicatorToken(t).indicatorId === base).length;
        const token = defaultIndicatorToken(activeChart, base, existingCount);
        options.controller.setChartTileIndicatorTokens(chartTileId, normalizeIndicatorIds([...current, token]));
        applyIndicatorSetToTile(chartTileId);
        options.savePersistedStateImmediate();
        options.draw();
      },
      onApply: () => {
        // Preserve indicator set after mutable chart-side updates.
        for (const chart of options.getChartsForTile(chartTileId)) {
          applyIndicatorSetToChart(chart, options.controller.getChartTileIndicatorTokens(chartTileId));
        }
        options.draw();
      },
      onClose: () => {},
    });
  };

  const setPaneSymbol = async (paneId: string, symbol: string) => {
    options.controller.setChartPaneSource(paneId, { symbol });
    tileSourceOrchestrator.sync();
    await options.onSymbolChange?.(symbol);
  };

  const setPaneTimeframe = async (paneId: string, timeframe: string) => {
    options.controller.setChartPaneSource(paneId, { timeframe });
    tileSourceOrchestrator.sync();
    await options.onTimeframeChange?.(timeframe);
  };

  return {
    applyIndicatorSetToTile,
    openIndicatorConfig: (target, chart) => openIndicatorConfig(target, chart),
    openIndicatorPicker,
    setPaneSymbol,
    setPaneTimeframe,
    syncSources: () => tileSourceOrchestrator.sync(),
    bindRuntimeSource: (paneId) => tileSourceOrchestrator.bindPaneRuntime(paneId),
    getSourceLabel: (paneId) => tileSourceOrchestrator.getSourceLabel(paneId),
    ensureTreeHandleForTile: (chartTileId) => tileObjectTreeOrchestrator.ensureHandleForTile(chartTileId),
    isChartTileTreeOpen: (chartTileId) => tileObjectTreeOrchestrator.isOpen(chartTileId),
    toggleChartTileTree: (chartTileId) => tileObjectTreeOrchestrator.toggle(chartTileId),
    getOpenStateMap: () => tileObjectTreeOrchestrator.getOpenStateMap(),
    setObjectTreeWidth: (width) => tileObjectTreeOrchestrator.setWidth(width),
    getObjectTreeWidth: () => tileObjectTreeOrchestrator.getWidth(),
    refreshOpenTrees: () => tileObjectTreeOrchestrator.refreshOpenTrees(),
    refreshActiveTree: (chartTileId) => tileObjectTreeOrchestrator.refreshActive(chartTileId),
    getActiveTreeRoot: (chartTileId) => tileObjectTreeOrchestrator.getActiveRoot(chartTileId),
    dispose: () => {
      tileObjectTreeOrchestrator.destroy();
      tileSourceOrchestrator.dispose();
    },
  };
}

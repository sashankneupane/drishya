import type { Candle, SeriesStyleOverride } from "../../wasm/contracts.js";
import type { WorkspaceController } from "../../workspace/controllers/WorkspaceController.js";
import type { ChartPaneRuntime } from "../../workspace/models/runtimeTypes.js";
import type { DrishyaChartClient } from "../../wasm/client.js";
import { createTileRuntimeRegistry } from "../runtime/runtimeRegistry.js";
import { attachTilePaneRuntimeInteractions, createTilePaneRuntime } from "../runtime/paneRuntimeLifecycle.js";
import { projectPanes } from "../../workspace/projectors/projectPanes.js";

interface PaneHost {
  stage: HTMLDivElement;
  chartLayer: HTMLDivElement;
}

interface CreateTileRuntimeOrchestratorOptions {
  controller: WorkspaceController;
  createWasmChart: (canvasId: string, width: number, height: number) => any;
  fallbackStage: HTMLDivElement;
  fallbackChartLayer: HTMLDivElement;
  paneHostByPaneId: Map<string, PaneHost>;
  primaryRuntime: ChartPaneRuntime;
  restoredIndicatorStyleOverridesByPane: Record<string, Record<string, SeriesStyleOverride>>;
  restoredPaneStatesByPane: Record<string, string | null>;
  latestCandlesByPane: Map<string, { latest: Candle; prevClose: number | null }>;
  reconcilePaneSpecsForRuntime: (options: {
    ownerChartPaneId: string;
    chart: DrishyaChartClient;
    controller: WorkspaceController;
  }) => void;
  openSymbolSearch: (onSelect: (symbol: string) => Promise<void>) => void;
  onPaneSymbolSelect: (paneId: string, symbol: string) => Promise<void>;
  redraw: () => void;
  redrawFast: (paneId: string) => void;
  bindRuntimeSource: (paneId: string) => void;
  onIndicatorsReapplied?: (paneId: string) => void;
}

export interface TileRuntimeOrchestrator {
  chartRuntimes: Map<string, ChartPaneRuntime>;
  getRuntime: (paneId: string) => ChartPaneRuntime | null;
  getActiveRuntime: () => ChartPaneRuntime | null;
  getPrimaryRuntime: () => ChartPaneRuntime | null;
  updateLayout: () => void;
  unbindInteractions: () => void;
}

export function createTileRuntimeOrchestrator(
  options: CreateTileRuntimeOrchestratorOptions
): TileRuntimeOrchestrator {
  const runtimeRegistry = createTileRuntimeRegistry({
    paneExists: (paneId) => !!options.controller.getState().chartPanes[paneId],
    createRuntimeForPane: (paneId) => createRuntimeForPane(paneId),
  });
  const chartRuntimes = runtimeRegistry.map;
  chartRuntimes.set("price", options.primaryRuntime);

  const getRuntime = (paneId: string) => runtimeRegistry.getRuntime(paneId);
  const getActiveRuntime = () =>
    runtimeRegistry.getActiveRuntime(options.controller.getState().activeChartPaneId);
  const getPrimaryRuntime = () => runtimeRegistry.getPrimaryRuntime();

  const ensureRuntimeInteractions = (runtime: ChartPaneRuntime) => {
    attachTilePaneRuntimeInteractions({
      runtime,
      controller: options.controller,
      paneHostByPaneId: options.paneHostByPaneId,
      fallbackStage: options.fallbackStage,
      redraw: options.redraw,
      redrawFast: () => options.redrawFast(runtime.paneId),
      openSymbolSearch: options.openSymbolSearch,
      onPaneSymbolSelect: options.onPaneSymbolSelect,
    });
  };

  const createRuntimeForPane = (paneId: string): ChartPaneRuntime => {
    const runtime = createTilePaneRuntime({
      paneId,
      controller: options.controller,
      paneHostByPaneId: options.paneHostByPaneId,
      fallbackChartLayer: options.fallbackChartLayer,
      createWasmChart: options.createWasmChart,
      chartTiles: options.controller.getState().chartTiles,
      restoredIndicatorStyleOverridesByPane: options.restoredIndicatorStyleOverridesByPane,
      restoredPaneStatesByPane: options.restoredPaneStatesByPane,
      latestCandlesByPane: options.latestCandlesByPane,
      reconcilePaneSpecsForRuntime: options.reconcilePaneSpecsForRuntime,
      onIndicatorsReapplied: options.onIndicatorsReapplied,
    });
    ensureRuntimeInteractions(runtime);
    options.bindRuntimeSource(paneId);
    return runtime;
  };

  const updateLayout = () => {
    projectPanes({
      state: options.controller.getState(),
      paneHostByPaneId: options.paneHostByPaneId,
      chartRuntimes,
      createRuntimeForPane,
      ensureRuntimeInteractions,
    });
  };

  const unbindInteractions = () => {
    for (const runtime of chartRuntimes.values()) {
      runtime.unbindInteractions?.();
    }
  };

  return {
    chartRuntimes,
    getRuntime,
    getActiveRuntime,
    getPrimaryRuntime,
    updateLayout,
    unbindInteractions,
  };
}

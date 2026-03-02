import type { Candle, SeriesStyleOverride } from "../../wasm/contracts.js";
import { DrishyaChartClient } from "../../wasm/client.js";
import type { ChartPaneRuntime } from "../../workspace/models/runtimeTypes.js";
import type { WorkspaceController } from "../../workspace/controllers/WorkspaceController.js";
import { DEFAULT_APPEARANCE_CONFIG } from "../../workspace/models/constants.js";
import { applyIndicatorSetToChart } from "../../workspace/services/indicatorRuntime.js";
import { resolvePaneRuntimeIdentity } from "../../workspace/services/runtimeIdentity.js";
import { bindWorkspaceInteractions } from "../../workspace/views/interactions.js";

interface PaneHost {
  stage: HTMLDivElement;
  chartLayer: HTMLDivElement;
}

interface CreatePaneRuntimeOptions {
  paneId: string;
  controller: WorkspaceController;
  paneHostByPaneId: Map<string, PaneHost>;
  fallbackChartLayer: HTMLDivElement;
  createWasmChart: (canvasId: string, width: number, height: number) => any;
  chartTiles: ReturnType<WorkspaceController["getState"]>["chartTiles"];
  restoredIndicatorStyleOverridesByPane: Record<string, Record<string, SeriesStyleOverride>>;
  restoredPaneStatesByPane: Record<string, string | null>;
  latestCandlesByPane: Map<string, { latest: Candle; prevClose: number | null }>;
  reconcilePaneSpecsForRuntime: (options: {
    ownerChartPaneId: string;
    chart: DrishyaChartClient;
    controller: WorkspaceController;
  }) => void;
}

export function createTilePaneRuntime(options: CreatePaneRuntimeOptions): ChartPaneRuntime {
  const { paneId } = options;
  const { chartTileId, chartTabId, runtimeKey } = resolvePaneRuntimeIdentity(
    paneId,
    options.chartTiles
  );

  const container = document.createElement("div");
  container.className = "absolute overflow-hidden";
  const paneCanvas = document.createElement("canvas");
  paneCanvas.className = "block h-full w-full bg-transparent absolute inset-0";
  const paneCanvasId = `drishya-canvas-${paneId}-${Math.random().toString(36).slice(2, 10)}`;
  paneCanvas.id = paneCanvasId;
  container.appendChild(paneCanvas);

  const host = options.paneHostByPaneId.get(paneId);
  const mountLayer =
    host?.chartLayer && host.chartLayer.isConnected ? host.chartLayer : options.fallbackChartLayer;
  mountLayer.appendChild(container);

  const paneRaw = options.createWasmChart(paneCanvasId, 300, 300);
  const paneChart = new DrishyaChartClient(paneRaw);
  const restoredStyleMap = options.restoredIndicatorStyleOverridesByPane[paneId] ?? {};
  for (const [seriesId, style] of Object.entries(restoredStyleMap)) {
    paneChart.setSeriesStyleOverride(seriesId, style);
  }

  const snapshotIndicatorIds = () =>
    chartTileId ? options.controller.getChartTileIndicatorTokens(chartTileId) : [];
  paneChart.setCandles = ((orig) => (candles: Candle[]) => {
    const beforeIndicatorIds = snapshotIndicatorIds();
    orig(candles);
    if (!candles.length) {
      options.latestCandlesByPane.delete(paneId);
    } else {
      options.latestCandlesByPane.set(paneId, {
        latest: candles[candles.length - 1],
        prevClose: candles.length > 1 ? candles[candles.length - 2].close : null,
      });
    }
    const afterIndicatorIds = snapshotIndicatorIds();
    if (beforeIndicatorIds.length && afterIndicatorIds.length === 0) {
      applyIndicatorSetToChart(paneChart, beforeIndicatorIds);
      if (chartTileId) {
        options.controller.setChartTileIndicatorTokens(chartTileId, beforeIndicatorIds);
      }
    }
  })(paneChart.setCandles.bind(paneChart));

  paneChart.appendCandle = ((orig) => (candle: Candle) => {
    const prevClose = options.latestCandlesByPane.get(paneId)?.latest.close ?? null;
    orig(candle);
    options.latestCandlesByPane.set(paneId, { latest: candle, prevClose });
  })(paneChart.appendCandle.bind(paneChart));

  paneChart.setTheme(options.controller.getState().theme);
  try {
    paneChart.setAppearanceConfig(DEFAULT_APPEARANCE_CONFIG);
  } catch {
    // ignore unsupported appearance config in older wasm
  }

  const restoredPaneState = options.restoredPaneStatesByPane[paneId] ?? null;
  if (restoredPaneState) {
    paneChart.restorePaneStateJson(restoredPaneState);
  }

  const restoredIndicators = chartTileId
    ? options.controller.getChartTileIndicatorTokens(chartTileId)
    : [];
  applyIndicatorSetToChart(paneChart, restoredIndicators);
  options.reconcilePaneSpecsForRuntime({
    ownerChartPaneId: paneId,
    chart: paneChart,
    controller: options.controller,
  });

  return {
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
    resize: (width: number, height: number) => paneChart.resize(width, height),
  };
}

interface AttachPaneRuntimeInteractionsOptions {
  runtime: ChartPaneRuntime;
  controller: WorkspaceController;
  paneHostByPaneId: Map<string, PaneHost>;
  fallbackStage: HTMLDivElement;
  redraw: () => void;
  redrawFast: () => void;
  openSymbolSearch: (onSelect: (symbol: string) => Promise<void>) => void;
  onPaneSymbolSelect?: (paneId: string, symbol: string) => Promise<void>;
}

export function attachTilePaneRuntimeInteractions(
  options: AttachPaneRuntimeInteractionsOptions
): void {
  if (options.runtime.unbindInteractions) return;
  const paneId = options.runtime.paneId;
  options.runtime.unbindInteractions = bindWorkspaceInteractions({
    canvas: options.runtime.canvas,
    chart: options.runtime.chart,
    rawChart: options.runtime.rawChart,
    redraw: options.redraw,
    redrawFast: options.redrawFast,
    getPaneLayouts: () => options.runtime.chart.paneLayouts(),
    controller: options.controller,
    paneId,
    getPaneViewport: () => options.runtime.viewport ?? null,
    getWorkspaceViewport: () => {
      const hostStage = options.paneHostByPaneId.get(paneId)?.stage ?? options.fallbackStage;
      const stageRect = hostStage.getBoundingClientRect();
      return {
        x: 0,
        y: 0,
        w: Math.max(1, Math.floor(stageRect.width)),
        h: Math.max(1, Math.floor(stageRect.height)),
      };
    },
    onSourceReadoutClick: () => {
      options.openSymbolSearch(async (nextSymbol) => {
        if (options.onPaneSymbolSelect) {
          await options.onPaneSymbolSelect(paneId, nextSymbol);
          return;
        }
        options.controller.setChartPaneSource(paneId, { symbol: nextSymbol });
      });
    },
  });
}

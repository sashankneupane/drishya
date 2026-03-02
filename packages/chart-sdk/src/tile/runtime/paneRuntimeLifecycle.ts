import type { Candle, SeriesStyleOverride } from "../../wasm/contracts.js";
import { DrishyaChartClient } from "../../wasm/client.js";
import type { ChartPaneRuntime } from "../../workspace/models/runtimeTypes.js";
import type { WorkspaceController } from "../../workspace/controllers/WorkspaceController.js";
import { DEFAULT_APPEARANCE_CONFIG } from "../../workspace/models/constants.js";
import { applyIndicatorSetToChart } from "../../workspace/services/indicatorRuntime.js";
import { resolvePaneRuntimeIdentity } from "../../workspace/services/runtimeIdentity.js";
import { bindWorkspaceInteractions } from "../../workspace/views/interactions.js";
import { canonicalRuntimePaneId } from "../../workspace/models/paneSpec.js";
import { buildTileScopedPaneMapping } from "../../workspace/services/tileScopedPaneMapping.js";

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
  onIndicatorsReapplied?: (paneId: string) => void;
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
      options.onIndicatorsReapplied?.(paneId);
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

  // Pane layout/weights must stay tile-scoped from WorkspaceController contracts.
  // Restoring raw pane-state snapshots can override ratios/order with stale runtime-local data.

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
    onPaneWeightsCommit: (updates, context) => {
      const state = options.controller.getState();
      const runtimePanes = options.runtime.chart.paneLayouts();
      const { statePaneIdByRuntimePaneId } = buildTileScopedPaneMapping(
        state.paneLayout,
        runtimePanes,
        options.runtime.paneId
      );

      const canonicalUpdates: Record<string, number> = {};
      for (const [runtimePaneId, ratio] of Object.entries(updates)) {
        const targetPaneId =
          statePaneIdByRuntimePaneId.get(runtimePaneId) ??
          canonicalRuntimePaneId(runtimePaneId);
        if (!state.paneLayout.panes[targetPaneId]) continue;
        canonicalUpdates[targetPaneId] = ratio;
      }
      if (Object.keys(canonicalUpdates).length === 0) {
        return;
      }
      const pricePaneId = "price";
      const paneOrder = state.paneLayout.order.filter((id) => state.paneLayout.panes[id]);
      const currentRatios: Record<string, number> = {};
      for (const paneId of paneOrder) {
        currentRatios[paneId] = Math.max(0.0001, Number(state.paneLayout.ratios[paneId] ?? 0.0001));
      }
      const hintedStatePaneId = context?.targetRuntimePaneId
        ? statePaneIdByRuntimePaneId.get(context.targetRuntimePaneId) ??
          canonicalRuntimePaneId(context.targetRuntimePaneId)
        : null;
      const target =
        hintedStatePaneId &&
        hintedStatePaneId !== pricePaneId &&
        state.paneLayout.panes[hintedStatePaneId]?.kind === "indicator"
          ? {
              paneId: hintedStatePaneId,
              desired: Math.max(
                0.0001,
                canonicalUpdates[hintedStatePaneId] ?? currentRatios[hintedStatePaneId] ?? 0.0001
              ),
              delta: Math.abs(
                Math.max(
                  0.0001,
                  canonicalUpdates[hintedStatePaneId] ?? currentRatios[hintedStatePaneId] ?? 0.0001
                ) - (currentRatios[hintedStatePaneId] ?? 0.0001)
              ),
            }
          : null;
      if (!target || !(target.delta > 0.000001) || !(currentRatios[pricePaneId] > 0)) {
        options.controller.updatePaneRatios(canonicalUpdates);
        return;
      }

      let total = 0;
      for (const paneId of paneOrder) total += currentRatios[paneId] ?? 0;
      if (!(total > 0)) total = 1;
      const minRatio = 0.0001;

      let othersSum = 0;
      for (const paneId of paneOrder) {
        if (paneId === target.paneId || paneId === pricePaneId) continue;
        othersSum += currentRatios[paneId] ?? 0;
      }
      const maxTarget = Math.max(minRatio, total - othersSum - minRatio);
      const nextTarget = Math.max(minRatio, Math.min(maxTarget, target.desired));
      const nextPrice = Math.max(minRatio, total - othersSum - nextTarget);

      const fixedScopeUpdates: Record<string, number> = {
        ...currentRatios,
        [target.paneId]: nextTarget,
        [pricePaneId]: nextPrice,
      };
      options.controller.updatePaneRatios(fixedScopeUpdates);
    },
  });
}

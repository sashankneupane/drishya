import type { DrishyaChartClient } from "../wasm/client.js";
import { WorkspaceController } from "./WorkspaceController.js";
import {
  canonicalIndicatorId,
  decodeIndicatorToken,
  isSeriesInIndicatorFamily,
  normalizeIndicatorIds,
  parseIndicatorParamsFromSeriesId,
} from "./indicatorIdentity.js";
import { canonicalRuntimePaneId } from "./paneSpec.js";

type PaneDirection = "up" | "down";
type NodeKind = "pane" | "series" | "drawing" | "layer" | "group";

interface WorkspaceIntentControllerOptions {
  controller: WorkspaceController;
  getChartForTile: (chartTileId: string) => DrishyaChartClient | null;
  getChartsForTile: (chartTileId: string) => DrishyaChartClient[];
  applyIndicatorSetToTile: (chartTileId: string) => void;
  savePersistedState: () => void;
}

const tokenMatchesVisibleRuntimeSeries = (
  token: string,
  runtimeSeriesIds: readonly string[]
): boolean => {
  const decoded = decodeIndicatorToken(token);
  const indicatorId = canonicalIndicatorId(decoded.indicatorId);
  if (!indicatorId) return false;
  const familySeries = runtimeSeriesIds.filter((seriesId) =>
    isSeriesInIndicatorFamily(indicatorId, seriesId)
  );
  if (!familySeries.length) return false;
  const instance =
    typeof decoded.params?.__instance === "string" && decoded.params.__instance.trim()
      ? decoded.params.__instance
      : null;
  if (!instance) return true;
  return familySeries.some((seriesId) => {
    const parsed = parseIndicatorParamsFromSeriesId(indicatorId, seriesId);
    return typeof parsed.__instance === "string" && parsed.__instance === instance;
  });
};

export interface WorkspaceIntentController {
  movePaneInTile: (chartTileId: string, paneId: string, direction: PaneDirection) => boolean;
  deletePaneInTile: (
    chartTileId: string,
    paneId: string,
    paneKind: string | undefined,
    chart: DrishyaChartClient
  ) => boolean;
  deleteSeriesInTile: (chartTileId: string, seriesId: string, chart: DrishyaChartClient) => boolean;
  toggleVisibility: (
    chart: DrishyaChartClient,
    kind: "pane" | "series" | "drawing" | "layer" | "group",
    id: string,
    visible: boolean
  ) => void;
  toggleLock: (
    chart: DrishyaChartClient,
    kind: "drawing" | "layer" | "group",
    id: string,
    locked: boolean
  ) => void;
  deleteNodeInTile: (
    chartTileId: string,
    chart: DrishyaChartClient,
    kind: NodeKind,
    id: string,
    paneKind?: string
  ) => boolean;
}

export const createWorkspaceIntentController = (
  options: WorkspaceIntentControllerOptions
): WorkspaceIntentController => {
  const removeTokensForDeletedSeries = (
    chartTileId: string,
    seriesIds: readonly string[]
  ): boolean => {
    const current = options.controller.getChartTileIndicatorTokens(chartTileId);
    if (!current.length || !seriesIds.length) return false;
    const targets = new Map<string, { indicatorId: string; instance: string | null }>();
    for (const seriesId of seriesIds) {
      const indicatorId = canonicalIndicatorId(seriesId.split(":")[0] ?? "");
      if (!indicatorId) continue;
      const parsed = parseIndicatorParamsFromSeriesId(indicatorId, seriesId);
      const instance =
        typeof parsed.__instance === "string" && parsed.__instance.trim()
          ? parsed.__instance
          : null;
      const key = `${indicatorId}::${instance ?? "*"}`;
      if (!targets.has(key)) {
        targets.set(key, { indicatorId, instance });
      }
    }
    if (!targets.size) return false;
    const next = [...current];
    let changed = false;
    for (const target of targets.values()) {
      const idx = next.findIndex((token) => {
        const decoded = decodeIndicatorToken(token);
        if (decoded.indicatorId !== target.indicatorId) return false;
        if (!target.instance) return true;
        return (
          typeof decoded.params?.__instance === "string" &&
          decoded.params.__instance === target.instance
        );
      });
      if (idx >= 0) {
        next.splice(idx, 1);
        changed = true;
      }
    }
    if (changed) {
      options.controller.setChartTileIndicatorTokens(chartTileId, normalizeIndicatorIds(next));
    }
    return changed;
  };

  const retainTileIndicatorTokensFromChart = (
    chartTileId: string,
    chart: DrishyaChartClient
  ): boolean => {
    const current = options.controller.getChartTileIndicatorTokens(chartTileId);
    if (!current.length) return false;
    const runtimeSeriesIds = chart
      .objectTreeState()
      .series
      .filter((series) => !series.deleted)
      .map((series) => series.id);
    const next = current.filter((token) =>
      tokenMatchesVisibleRuntimeSeries(token, runtimeSeriesIds)
    );
    if (next.length === current.length) return false;
    options.controller.setChartTileIndicatorTokens(chartTileId, normalizeIndicatorIds(next));
    return true;
  };

  const applyTilePaneOrderFromController = (chartTileId: string): void => {
    const currentOrder = options.controller
      .getState()
      .paneLayout.order.map((id) => canonicalRuntimePaneId(id));
    const tileCharts = options.getChartsForTile(chartTileId);
    for (const chart of tileCharts) {
      const paneLayouts = chart.paneLayouts();
      const rawByCanonical = new Map<string, string>();
      for (const pane of paneLayouts) {
        const canonical = canonicalRuntimePaneId(pane.id);
        if (!rawByCanonical.has(canonical)) rawByCanonical.set(canonical, pane.id);
      }
      const scopedRaw = currentOrder
        .map((id) => rawByCanonical.get(id))
        .filter((id): id is string => typeof id === "string");
      if (scopedRaw.length) chart.setPaneOrder(scopedRaw);
    }
  };

  const movePaneInTile = (chartTileId: string, paneId: string, direction: PaneDirection): boolean => {
    const chart = options.getChartForTile(chartTileId);
    if (!chart) return false;
    const runtimeOrder = chart.paneLayouts().map((pane) => canonicalRuntimePaneId(pane.id));
    if (!runtimeOrder.length) return false;
    const runtimeSet = new Set(runtimeOrder);
    const currentGlobalOrder = options.controller
      .getState()
      .paneLayout.order
      .map((id) => canonicalRuntimePaneId(id));
    const currentScopedOrder = currentGlobalOrder.filter((id) => runtimeSet.has(id));
    if (!currentScopedOrder.length) return false;

    const targetPaneId = canonicalRuntimePaneId(paneId);
    if (!runtimeSet.has(targetPaneId)) return false;
    const idx = currentScopedOrder.indexOf(targetPaneId);
    if (idx < 0) return false;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= currentScopedOrder.length) return false;
    const nextScopedOrder = [...currentScopedOrder];
    [nextScopedOrder[idx], nextScopedOrder[swapIdx]] = [
      nextScopedOrder[swapIdx]!,
      nextScopedOrder[idx]!,
    ];

    const nextGlobalOrder = [...currentGlobalOrder];
    const scopedPositions: number[] = [];
    for (let i = 0; i < nextGlobalOrder.length; i += 1) {
      if (runtimeSet.has(nextGlobalOrder[i]!)) scopedPositions.push(i);
    }
    for (let i = 0; i < scopedPositions.length; i += 1) {
      const position = scopedPositions[i]!;
      const scopedPaneId = nextScopedOrder[i];
      if (scopedPaneId) nextGlobalOrder[position] = scopedPaneId;
    }
    options.controller.setPaneOrder(nextGlobalOrder);
    applyTilePaneOrderFromController(chartTileId);
    options.savePersistedState();
    return true;
  };

  const deleteSeriesInTile = (
    chartTileId: string,
    seriesId: string,
    chart: DrishyaChartClient
  ): boolean => {
    chart.applyObjectTreeAction({ type: "delete", kind: "series", id: seriesId });
    const changed =
      removeTokensForDeletedSeries(chartTileId, [seriesId]) ||
      retainTileIndicatorTokensFromChart(chartTileId, chart);
    if (changed) options.applyIndicatorSetToTile(chartTileId);
    options.controller.cleanupEmptyIndicatorPanes(chart.objectTreeState());
    options.savePersistedState();
    return true;
  };

  const deletePaneInTile = (
    chartTileId: string,
    paneId: string,
    paneKind: string | undefined,
    chart: DrishyaChartClient
  ): boolean => {
    const targetPaneId = canonicalRuntimePaneId(paneId);
    if (paneKind === "chart") {
      options.controller.removeChartPane(targetPaneId);
      options.savePersistedState();
      return true;
    }
    const stateBefore = chart.objectTreeState();
    const paneSeriesIds = stateBefore.series
      .filter((series) => !series.deleted && canonicalRuntimePaneId(series.pane_id) === targetPaneId)
      .map((series) => series.id);
    for (const seriesId of paneSeriesIds) {
      chart.applyObjectTreeAction({ type: "delete", kind: "series", id: seriesId });
    }
    options.controller.unregisterPane(targetPaneId);
    const changed =
      removeTokensForDeletedSeries(chartTileId, paneSeriesIds) ||
      retainTileIndicatorTokensFromChart(chartTileId, chart);
    if (changed) options.applyIndicatorSetToTile(chartTileId);
    options.controller.cleanupEmptyIndicatorPanes(chart.objectTreeState());
    applyTilePaneOrderFromController(chartTileId);
    options.savePersistedState();
    return true;
  };

  return {
    movePaneInTile,
    deletePaneInTile,
    deleteSeriesInTile,
    toggleVisibility: (chart, kind, id, visible) => {
      chart.applyObjectTreeAction({
        type: "toggle_visibility",
        kind,
        id,
        visible,
      });
    },
    toggleLock: (chart, kind, id, locked) => {
      if (kind === "drawing") {
        chart.setDrawingConfig(Number(id), { locked });
        return;
      }
      if (kind === "layer") {
        chart.updateLayer(id, { locked });
        return;
      }
      chart.updateGroup(id, { locked });
    },
    deleteNodeInTile: (chartTileId, chart, kind, id, paneKind) => {
      if (kind === "pane") return deletePaneInTile(chartTileId, id, paneKind, chart);
      if (kind === "series") return deleteSeriesInTile(chartTileId, id, chart);
      chart.applyObjectTreeAction({
        type: "delete",
        kind: kind as "drawing" | "layer" | "group",
        id,
      });
      options.savePersistedState();
      return true;
    },
  };
};

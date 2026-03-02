import type { DrishyaChartClient } from "../../wasm/client.js";
import { WorkspaceController } from "./WorkspaceController.js";
import {
  canonicalIndicatorId,
  decodeIndicatorToken,
  isSeriesInIndicatorFamily,
  normalizeIndicatorIds,
  parseIndicatorParamsFromSeriesId,
} from "../services/indicatorIdentity.js";
import { canonicalRuntimePaneId } from "../models/paneSpec.js";
import { buildTileScopedPaneMapping } from "../services/tileScopedPaneMapping.js";

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
  setActivePane: (paneId: string) => void;
  setPaneSource: (paneId: string, patch: { symbol?: string; timeframe?: string }) => void;
  movePaneInTile: (chartTileId: string, paneId: string, direction: PaneDirection) => boolean;
  deletePaneInTile: (
    chartTileId: string,
    paneId: string,
    paneKind: string | undefined,
    chart: DrishyaChartClient,
    paneRuntimeIdHint?: string
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

  const movePaneInTile = (chartTileId: string, paneId: string, direction: PaneDirection): boolean => {
    const state = options.controller.getState();
    const chartTile = state.chartTiles[chartTileId];
    if (!chartTile) return false;
    const scopedPaneSet = new Set<string>(["price"]);
    for (const [paneKey, spec] of Object.entries(state.paneLayout.panes)) {
      const canonicalPaneKey = canonicalRuntimePaneId(paneKey);
      if (spec.kind === "indicator") {
        scopedPaneSet.add(canonicalPaneKey);
      }
    }
    const currentGlobalOrder = state.paneLayout.order.map((id) => canonicalRuntimePaneId(id));
    const currentScopedOrder = currentGlobalOrder.filter((id) => scopedPaneSet.has(id));
    if (!currentScopedOrder.length) return false;

    const targetPaneId = canonicalRuntimePaneId(paneId);
    if (!scopedPaneSet.has(targetPaneId)) return false;
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
      if (scopedPaneSet.has(nextGlobalOrder[i]!)) scopedPositions.push(i);
    }
    for (let i = 0; i < scopedPositions.length; i += 1) {
      const position = scopedPositions[i]!;
      const scopedPaneId = nextScopedOrder[i];
      if (scopedPaneId) nextGlobalOrder[position] = scopedPaneId;
    }
    options.controller.setPaneOrder(nextGlobalOrder);
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
    chart: DrishyaChartClient,
    paneRuntimeIdHint?: string
  ): boolean => {
    const targetPaneId = canonicalRuntimePaneId(paneId);
    if (paneKind === "chart") {
      options.controller.removeChartPane(targetPaneId);
      options.savePersistedState();
      return true;
    }
    const stateBefore = chart.objectTreeState();
    const runtimePanes = chart.paneLayouts();
    const tileState = options.controller.getState().chartTiles[chartTileId];
    const ownerPaneId = tileState?.tabs.find((t) => t.id === tileState.activeTabId)?.chartPaneId
      ?? tileState?.tabs[0]?.chartPaneId;
    const statePaneIdByRuntimePaneId = buildTileScopedPaneMapping(
      options.controller.getState().paneLayout,
      runtimePanes,
      ownerPaneId
    ).statePaneIdByRuntimePaneId;
    const targetRuntimePaneIds = new Set<string>();
    if (typeof paneRuntimeIdHint === "string" && paneRuntimeIdHint.trim()) {
      targetRuntimePaneIds.add(paneRuntimeIdHint.trim());
    }
    for (const runtimePaneId of runtimePanes.map((pane) => pane.id)) {
      const statePaneId =
        statePaneIdByRuntimePaneId.get(runtimePaneId) ??
        canonicalRuntimePaneId(runtimePaneId);
      if (statePaneId === targetPaneId || canonicalRuntimePaneId(runtimePaneId) === targetPaneId) {
        targetRuntimePaneIds.add(runtimePaneId);
      }
    }
    const paneSeriesIds = stateBefore.series
      .filter((series) => {
        if (series.deleted) return false;
        if (targetRuntimePaneIds.has(series.pane_id)) return true;
        const mappedStatePaneId =
          statePaneIdByRuntimePaneId.get(series.pane_id) ??
          canonicalRuntimePaneId(series.pane_id);
        return mappedStatePaneId === targetPaneId;
      })
      .map((series) => series.id);

    const removeTokensByIndicatorId = (indicatorIds: readonly string[]): boolean => {
      if (!indicatorIds.length) return false;
      const current = options.controller.getChartTileIndicatorTokens(chartTileId);
      if (!current.length) return false;
      const indicatorIdSet = new Set(
        indicatorIds.map((id) => canonicalIndicatorId(id)).filter((id) => !!id)
      );
      const next = current.filter((token) => {
        const decoded = decodeIndicatorToken(token);
        return !indicatorIdSet.has(canonicalIndicatorId(decoded.indicatorId));
      });
      if (next.length === current.length) return false;
      options.controller.setChartTileIndicatorTokens(chartTileId, normalizeIndicatorIds(next));
      return true;
    };

    const paneIndicatorIds = (chart.readoutSnapshot()?.indicators ?? [])
      .filter((indicator) => {
        if (targetRuntimePaneIds.has(indicator.pane_id)) return true;
        const mappedStatePaneId =
          statePaneIdByRuntimePaneId.get(indicator.pane_id) ??
          canonicalRuntimePaneId(indicator.pane_id);
        return mappedStatePaneId === targetPaneId;
      })
      .map((indicator) => indicator.id.split(":")[0] ?? "")
      .filter((id) => id.length > 0);

    for (const seriesId of paneSeriesIds) {
      chart.applyObjectTreeAction({ type: "delete", kind: "series", id: seriesId });
    }
    options.controller.unregisterPane(targetPaneId);
    removeTokensForDeletedSeries(chartTileId, paneSeriesIds);
    removeTokensByIndicatorId(paneIndicatorIds);
    retainTileIndicatorTokensFromChart(chartTileId, chart);
    options.applyIndicatorSetToTile(chartTileId);
    options.controller.cleanupEmptyIndicatorPanes(chart.objectTreeState());
    options.savePersistedState();
    return true;
  };

  return {
    setActivePane: (paneId) => {
      options.controller.setActiveChartPane(canonicalRuntimePaneId(paneId));
    },
    setPaneSource: (paneId, patch) => {
      options.controller.setChartPaneSource(canonicalRuntimePaneId(paneId), patch);
      options.savePersistedState();
    },
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
      if (kind === "pane") return deletePaneInTile(chartTileId, id, paneKind, chart, id);
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

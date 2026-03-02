import type { DrishyaChartClient } from "../wasm/client.js";
import type { ChartPaneRuntime } from "./runtimeTypes.js";
import type { WorkspaceController } from "./WorkspaceController.js";
import { createIndicatorConfigModal } from "./IndicatorConfigModal.js";
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
  applyIndicatorParams,
  defaultIndicatorParams,
  findTokenParamsForSeriesId,
} from "./indicatorRuntime.js";
import { reconcilePaneSpecsForRuntime } from "./paneSpecReconcile.js";

interface OpenIndicatorConfigTarget {
  paneId?: string;
  seriesId?: string;
  indicatorId?: string;
}

interface IndicatorConfigFlowOptions {
  chartRuntimes: Map<string, ChartPaneRuntime>;
  controller: WorkspaceController;
  getRuntime: (paneId: string) => ChartPaneRuntime | null;
  draw: () => void;
  savePersistedStateImmediate: () => void;
  getActiveChart: () => DrishyaChartClient | null;
  getPrimaryChart: () => DrishyaChartClient | null;
}

export const createOpenIndicatorConfig = ({
  chartRuntimes,
  controller,
  getRuntime,
  draw,
  savePersistedStateImmediate,
  getActiveChart,
  getPrimaryChart,
}: IndicatorConfigFlowOptions) => {
  return (target: OpenIndicatorConfigTarget, chartHint?: DrishyaChartClient | null) => {
    const chart = chartHint ?? getActiveChart() ?? getPrimaryChart() ?? null;
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
      snapshot?.indicators.find((item) => canonicalIndicatorId(item.id.split(":")[0]) === indicatorId)
        ?.name ??
      catalogEntry?.display_name ??
      indicatorId.toUpperCase();

    const initialTokenParams = findTokenParamsForSeriesId(
      runtime?.chartTileId ? controller.getChartTileIndicatorTokens(runtime.chartTileId) : [],
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
          ...(typeof targetInstanceParams.__instance === "string"
            ? { __instance: targetInstanceParams.__instance }
            : {}),
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
                reconcilePaneSpecsForRuntime({
                  ownerChartPaneId: tab.chartPaneId,
                  chart: targetChart,
                  controller,
                });
              }
            }
          }
        }

        if (anyApplied && runtime?.chartTileId) {
          const current = controller.getChartTileIndicatorTokens(runtime.chartTileId);
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
          controller.setChartTileIndicatorTokens(runtime.chartTileId, normalizeIndicatorIds(next));
        }

        if (anyApplied) {
          savePersistedStateImmediate();
          draw();
        }
      },
      styleSeries: chart.seriesStyleSnapshot().filter((item) => {
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
      onClose: () => draw(),
    });
  };
};

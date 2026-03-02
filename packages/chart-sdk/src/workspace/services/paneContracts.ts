import { canonicalRuntimePaneId } from "../models/paneSpec.js";
import type { ChartPaneRuntime } from "../models/runtimeTypes.js";
import type { WorkspacePaneLayoutState } from "../models/types.js";
import { DEFAULT_INDICATOR_PANE_RATIO } from "../models/constants.js";
import { buildTileScopedPaneMapping } from "./tileScopedPaneMapping.js";

interface ChartPaneVisibility {
  visible?: boolean;
}

interface SyncPaneContractsState {
  chartPanes: Record<string, ChartPaneVisibility>;
  paneLayout: WorkspacePaneLayoutState;
}

interface SyncChartPaneContractsOptions {
  state: SyncPaneContractsState;
  chartRuntimes: Map<string, ChartPaneRuntime>;
  paneHostByPaneId: Map<string, { stage: HTMLElement }>;
}

export function syncChartPaneContracts({
  state,
  chartRuntimes,
  paneHostByPaneId,
}: SyncChartPaneContractsOptions): void {
  for (const [paneId, runtime] of chartRuntimes) {
    const chartPane = state.chartPanes[paneId];
    if (chartPane && chartPane.visible === false) continue;
    const host = paneHostByPaneId.get(paneId);
    if (!host) continue;

    const hostRect = host.stage.getBoundingClientRect();
    const chartPaneViewports: Record<string, { x: number; y: number; w: number; h: number }> = {
      [paneId]: {
        x: 0,
        y: 0,
        w: Math.max(1, Math.floor(hostRect.width)),
        h: Math.max(1, Math.floor(hostRect.height)),
      },
    };
    const paneChartPaneMap: Record<string, string> = {};
    const runtimePanes = runtime.chart.paneLayouts();
    for (const pane of runtimePanes) {
      paneChartPaneMap[pane.id] = paneId;
    }

    const { statePaneIdByRuntimePaneId } = buildTileScopedPaneMapping(
      state.paneLayout,
      runtimePanes,
      paneId
    );

    const stateOrderIndex = new Map<string, number>();
    state.paneLayout.order.forEach((id, index) => stateOrderIndex.set(id, index));
    const scopedRawOrder = runtimePanes
      .map((pane, runtimeIndex) => {
        const statePaneId =
          statePaneIdByRuntimePaneId.get(pane.id) ?? canonicalRuntimePaneId(pane.id);
        const priority = stateOrderIndex.get(statePaneId) ?? 10_000 + runtimeIndex;
        return { rawId: pane.id, priority };
      })
      .sort((a, b) => a.priority - b.priority)
      .map((entry) => entry.rawId);
    if (scopedRawOrder.length) {
      runtime.chart.setPaneOrder(scopedRawOrder);
    }

    const runtimeHeightByRawId = new Map<string, number>();
    for (const pane of runtimePanes) {
      runtimeHeightByRawId.set(pane.id, Math.max(0.0001, Number(pane.h) || 0.0001));
    }

    const scopedWeights: Record<string, number> = {};
    for (const pane of runtimePanes) {
      const rawId = pane.id;
      const statePaneId =
        statePaneIdByRuntimePaneId.get(rawId) ?? canonicalRuntimePaneId(rawId);
      const ratio = state.paneLayout.ratios[statePaneId];
      if (Number.isFinite(ratio)) {
        scopedWeights[rawId] = Math.max(0.0001, ratio);
      } else {
        scopedWeights[rawId] =
          statePaneId === "price"
            ? runtimeHeightByRawId.get(rawId) ?? 0.0001
            : Math.max(0.0001, DEFAULT_INDICATOR_PANE_RATIO);
      }
    }
    if (Object.keys(scopedWeights).length > 0) {
      let scopedWeightSum = 0;
      for (const value of Object.values(scopedWeights)) scopedWeightSum += value;
      if (!(scopedWeightSum > 0)) {
        const equal = 1 / Object.keys(scopedWeights).length;
        for (const key of Object.keys(scopedWeights)) scopedWeights[key] = equal;
      } else {
        for (const key of Object.keys(scopedWeights)) {
          scopedWeights[key] = scopedWeights[key]! / scopedWeightSum;
        }
      }
      runtime.chart.setPaneWeights(scopedWeights);
    }
    runtime.chart.setChartPaneViewports(chartPaneViewports);
    runtime.chart.setPaneChartPaneMap(paneChartPaneMap);
  }
}

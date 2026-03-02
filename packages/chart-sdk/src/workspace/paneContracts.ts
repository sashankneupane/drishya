import { canonicalRuntimePaneId } from "./paneSpec.js";
import type { ChartPaneRuntime } from "./runtimeTypes.js";
import type { WorkspacePaneLayoutState } from "./types.js";

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

    const scopedIndicatorPaneIds = state.paneLayout.order.filter((id) => {
      const spec = state.paneLayout.panes[id];
      if (!spec) return false;
      return spec.kind === "indicator" && spec.parentChartPaneId === paneId;
    });
    const scopedPaneIds = [paneId, ...scopedIndicatorPaneIds];
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
    const rawByCanonical = new Map<string, string>();
    for (const pane of runtimePanes) {
      const canonical = canonicalRuntimePaneId(pane.id);
      if (!rawByCanonical.has(canonical)) rawByCanonical.set(canonical, pane.id);
      paneChartPaneMap[pane.id] = paneId;
    }
    const rootRawPaneId =
      rawByCanonical.get("price") ??
      rawByCanonical.get(canonicalRuntimePaneId(paneId)) ??
      runtimePanes[0]?.id ??
      null;
    const rawIdForScopedPane = (scopedId: string): string | null => {
      if (scopedId === paneId) return rootRawPaneId;
      return rawByCanonical.get(canonicalRuntimePaneId(scopedId)) ?? null;
    };
    const scopedRawOrder: string[] = [];
    for (const scopedId of scopedPaneIds) {
      const rawId = rawIdForScopedPane(scopedId);
      if (!rawId) {
        console.warn(
          `[workspace] missing runtime pane id for scoped pane '${scopedId}' in chart pane '${paneId}'`
        );
        continue;
      }
      if (!scopedRawOrder.includes(rawId)) scopedRawOrder.push(rawId);
    }
    if (!scopedRawOrder.length) {
      console.warn(`[workspace] no scoped pane order resolved for chart pane '${paneId}'`);
    } else {
      runtime.chart.setPaneOrder(scopedRawOrder);
    }
    const scopedWeights: Record<string, number> = {};
    for (const scopedId of scopedPaneIds) {
      const rawId = rawIdForScopedPane(scopedId);
      if (!rawId) continue;
      const ratio = state.paneLayout.ratios[scopedId];
      if (!Number.isFinite(ratio)) continue;
      scopedWeights[rawId] = Math.max(0.0001, ratio);
    }
    if (Object.keys(scopedWeights).length > 0) {
      runtime.chart.setPaneWeights(scopedWeights);
    }
    runtime.chart.setChartPaneViewports(chartPaneViewports);
    runtime.chart.setPaneChartPaneMap(paneChartPaneMap);
  }
}


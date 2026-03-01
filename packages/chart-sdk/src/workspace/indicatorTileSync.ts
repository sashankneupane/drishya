import type { DrishyaChartClient } from "../wasm/client.js";
import type { WorkspaceController } from "./WorkspaceController.js";

interface ChartTileTabLike {
  chartPaneId: string;
}

interface ChartTileLike {
  tabs: ChartTileTabLike[];
}

interface ApplyIndicatorsToTileChartsOptions {
  chartTile: ChartTileLike | undefined;
  indicatorIds: string[];
  controller: WorkspaceController;
  getRuntime: (paneId: string) => { chart: DrishyaChartClient } | null;
  applyIndicatorSetToChart: (chart: DrishyaChartClient, indicatorIds: string[]) => void;
  reconcilePaneSpecsForRuntime: (args: {
    ownerChartPaneId: string;
    chart: DrishyaChartClient;
    controller: WorkspaceController;
  }) => void;
}

export function applyIndicatorsToTileCharts(options: ApplyIndicatorsToTileChartsOptions): void {
  for (const tab of options.chartTile?.tabs ?? []) {
    const runtime = options.getRuntime(tab.chartPaneId);
    if (!runtime) continue;
    options.applyIndicatorSetToChart(runtime.chart, options.indicatorIds);
    options.reconcilePaneSpecsForRuntime({
      ownerChartPaneId: tab.chartPaneId,
      chart: runtime.chart,
      controller: options.controller,
    });
  }
}


import type { DrishyaChartClient } from "../wasm/client.js";
import { getActiveTab } from "./chartTileSelection.js";
import type { WorkspaceState } from "./WorkspaceController.js";

export function getActiveChartForTileFromState(
  state: WorkspaceState,
  chartTileId: string,
  getRuntime: (paneId: string) => { chart: DrishyaChartClient } | null
): DrishyaChartClient | null {
  const tile = state.chartTiles[chartTileId];
  const activeTab = getActiveTab(tile);
  if (!activeTab) return null;
  return getRuntime(activeTab.chartPaneId)?.chart ?? null;
}

export function getChartsForTileFromState(
  state: WorkspaceState,
  chartTileId: string,
  getRuntime: (paneId: string) => { chart: DrishyaChartClient } | null
): DrishyaChartClient[] {
  const tile = state.chartTiles[chartTileId];
  if (!tile) return [];
  const out: DrishyaChartClient[] = [];
  for (const tab of tile.tabs) {
    const runtime = getRuntime(tab.chartPaneId);
    if (runtime) out.push(runtime.chart);
  }
  return out;
}


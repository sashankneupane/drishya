import type { DrishyaChartClient } from "../../wasm/client.js";
import type { WorkspaceState } from "../controllers/WorkspaceController.js";
import { getActiveTab } from "./chartTileSelection.js";

export interface ChartTileHeaderContext {
  activePaneId: string | null;
  activeSource: { symbol?: string; timeframe?: string };
  activeRuntime: { chart: DrishyaChartClient } | null;
}

export function resolveChartTileHeaderContext(
  state: WorkspaceState,
  chartTileId: string,
  getRuntime: (paneId: string) => { chart: DrishyaChartClient } | null
): ChartTileHeaderContext {
  const chartTile = state.chartTiles[chartTileId];
  const activeTab = getActiveTab(chartTile);
  const activePaneId = activeTab?.chartPaneId ?? null;
  const activeSource = activePaneId ? state.chartPaneSources[activePaneId] ?? {} : {};
  const activeRuntime = activePaneId ? getRuntime(activePaneId) : null;
  return { activePaneId, activeSource, activeRuntime };
}


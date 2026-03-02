import type { SeriesStyleOverride } from "../../wasm/contracts.js";
import { normalizeIndicatorIds } from "./indicatorIdentity.js";
import type { ChartPaneRuntime } from "../models/runtimeTypes.js";
import type { WorkspaceState } from "../controllers/WorkspaceController.js";
import type { PersistedChartTileStoredShape } from "./persistenceHelpers.js";
import { getActiveTab } from "../../tile/services/chartTileService.js";

interface BuildPersistedChartTilesOptions {
  state: WorkspaceState;
  controller: { getChartTileIndicatorTokens: (chartTileId: string) => string[] };
  chartRuntimes: Map<string, ChartPaneRuntime>;
  chartTileTreeOpen: Map<string, boolean>;
  selectedTimeframe?: string;
  availableTimeframes?: readonly string[];
}

export function buildPersistedChartTiles(
  options: BuildPersistedChartTilesOptions
): Record<string, PersistedChartTileStoredShape> {
  const persistedChartTiles: Record<string, PersistedChartTileStoredShape> = {};
  for (const [chartTileId, chartTile] of Object.entries(options.state.chartTiles)) {
    const activeTab = getActiveTab(chartTile) ?? null;
    const orderedTabs = activeTab
      ? [activeTab, ...chartTile.tabs.filter((tab) => tab.id !== activeTab.id)]
      : chartTile.tabs;
    const runtime =
      orderedTabs
        .map((tab) => options.chartRuntimes.get(tab.chartPaneId))
        .find((value): value is ChartPaneRuntime => !!value) ?? null;
    const tileIndicators = normalizeIndicatorIds(
      options.controller.getChartTileIndicatorTokens(chartTileId)
    );
    const paneSourcesByPane: Record<string, { symbol?: string; timeframe?: string }> = {};
    const paneStateByPane: Record<string, string | null> = {};
    const indicatorStyleOverridesByPane: Record<string, Record<string, SeriesStyleOverride>> = {};
    for (const tab of chartTile.tabs) {
      const src = options.state.chartPaneSources[tab.chartPaneId] ?? {};
      paneSourcesByPane[tab.chartPaneId] = {
        symbol: src.symbol,
        timeframe: src.timeframe,
      };
      // Do not persist raw pane-state snapshots; pane layout is controller-owned/tile-scoped.
      paneStateByPane[tab.chartPaneId] = null;
      indicatorStyleOverridesByPane[tab.chartPaneId] =
        options.chartRuntimes.get(tab.chartPaneId)?.chart.allSeriesStyleOverrides() ?? {};
    }
    persistedChartTiles[chartTileId] = {
      id: chartTile.id,
      tabs: chartTile.tabs.map((tab) => ({
        id: tab.id,
        title: tab.title,
        chartPaneId: tab.chartPaneId,
      })),
      activeTabId: chartTile.activeTabId,
      config: {
        paneSourcesByPane,
        paneStateByPane,
        indicators: tileIndicators,
        indicatorStyleOverridesByPane,
        treeOpen: options.chartTileTreeOpen.get(chartTileId) === true,
      },
    };
  }
  return persistedChartTiles;
}

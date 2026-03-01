import type { SeriesStyleOverride } from "../wasm/contracts.js";
import { normalizeIndicatorIds } from "./indicatorIdentity.js";
import type { ChartPaneRuntime } from "./runtimeTypes.js";
import type { WorkspaceState } from "./WorkspaceController.js";
import type { PersistedChartTileStoredShape } from "./persistenceHelpers.js";
import { getActiveTab } from "./chartTileSelection.js";

interface BuildPersistedChartTilesOptions {
  state: WorkspaceState;
  chartRuntimes: Map<string, ChartPaneRuntime>;
  chartTileIndicatorState: Map<string, string[]>;
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
    const tilePaneState = runtime?.chart.getPaneStateJson() ?? null;
    const tileIndicators = normalizeIndicatorIds(
      options.chartTileIndicatorState.get(chartTileId) ?? []
    );
    const paneSourcesByPane: Record<string, { symbol?: string; timeframe?: string }> = {};
    const paneStateByPane: Record<string, string | null> = {};
    const indicatorStyleOverridesByPane: Record<string, Record<string, SeriesStyleOverride>> = {};
    for (const tab of chartTile.tabs) {
      const src = options.state.chartPaneSources[tab.chartPaneId] ?? {};
      paneSourcesByPane[tab.chartPaneId] = {
        symbol: src.symbol ?? tab.title,
        timeframe:
          src.timeframe ??
          options.selectedTimeframe ??
          options.availableTimeframes?.[0],
      };
      paneStateByPane[tab.chartPaneId] =
        options.chartRuntimes.get(tab.chartPaneId)?.chart.getPaneStateJson() ?? tilePaneState;
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


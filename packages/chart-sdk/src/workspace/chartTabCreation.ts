import type { WorkspaceController } from "./WorkspaceController.js";

interface AddChartTabOptions {
  chartTileId: string;
  controller: WorkspaceController;
  selectedSymbol?: string;
  selectedTimeframe?: string;
  availableTimeframes?: readonly string[];
  applyIndicatorSetToTile: (chartTileId: string) => void;
}

export function addChartTabWithInheritedSource(options: AddChartTabOptions): string | null {
  const tabId = options.controller.addChartTab(options.chartTileId);
  if (!tabId) return null;
  const nextTile = options.controller.getState().chartTiles[options.chartTileId];
  const nextTab = nextTile?.tabs.find((candidate) => candidate.id === tabId);
  const paneId = nextTab?.chartPaneId;
  if (paneId) {
    const activePaneId = options.controller.getState().activeChartPaneId;
    const inherited = options.controller.getState().chartPaneSources[activePaneId] ?? {};
    options.controller.setChartPaneSource(paneId, {
      symbol: inherited.symbol ?? options.selectedSymbol,
      timeframe:
        inherited.timeframe ??
        options.selectedTimeframe ??
        options.availableTimeframes?.[0],
    });
  }
  options.applyIndicatorSetToTile(options.chartTileId);
  return tabId;
}

interface AddChartTabForSymbolOptions extends AddChartTabOptions {
  symbol: string;
}

export function addChartTabForSymbol(options: AddChartTabForSymbolOptions): {
  paneId: string;
  timeframe: string | undefined;
} | null {
  const tabId = options.controller.addChartTab(options.chartTileId);
  if (!tabId) return null;
  const nextTile = options.controller.getState().chartTiles[options.chartTileId];
  const nextTab = nextTile?.tabs.find((candidate) => candidate.id === tabId);
  const paneId = nextTab?.chartPaneId;
  if (!paneId) return null;
  options.controller.setChartTabTitle(options.chartTileId, tabId, options.symbol);
  const activePaneId = options.controller.getState().activeChartPaneId;
  const inherited = options.controller.getState().chartPaneSources[activePaneId] ?? {};
  const timeframe =
    inherited.timeframe ??
    options.selectedTimeframe ??
    options.availableTimeframes?.[0];
  options.controller.setChartPaneSource(paneId, { symbol: options.symbol, timeframe });
  options.applyIndicatorSetToTile(options.chartTileId);
  return { paneId, timeframe };
}


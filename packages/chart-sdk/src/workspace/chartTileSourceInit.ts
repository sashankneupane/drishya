import { getActiveTab } from "./chartTileSelection.js";
import type { WorkspaceController } from "./WorkspaceController.js";

interface MarketControlsLike {
  symbols?: readonly string[];
  timeframes?: readonly string[];
  selectedSymbol?: string;
  selectedTimeframe?: string;
}

interface InitializeChartTileSourceStateOptions {
  chartTileId: string;
  controller: WorkspaceController;
  marketControls?: MarketControlsLike;
}

export interface InitializedChartTileSourceState {
  paneId?: string;
  symbol?: string;
  timeframe?: string;
}

export function initializeChartTileSourceState(
  options: InitializeChartTileSourceStateOptions
): InitializedChartTileSourceState {
  const tile = options.controller.getState().chartTiles[options.chartTileId];
  const activeTab = getActiveTab(tile);
  const paneId = activeTab?.chartPaneId;
  const symbol =
    options.marketControls?.selectedSymbol ??
    options.marketControls?.symbols?.[0];
  const timeframe =
    options.marketControls?.selectedTimeframe ??
    options.marketControls?.timeframes?.[0];
  if (activeTab && symbol) {
    options.controller.setChartTabTitle(options.chartTileId, activeTab.id, symbol);
  }
  if (paneId && (symbol || timeframe)) {
    options.controller.setChartPaneSource(paneId, { symbol, timeframe });
  }
  return { paneId, symbol, timeframe };
}


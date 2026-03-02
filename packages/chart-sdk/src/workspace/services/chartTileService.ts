import type { DrishyaChartClient } from "../../wasm/client.js";
import type { WorkspaceController, WorkspaceState } from "../controllers/WorkspaceController.js";

interface AddChartTabOptions {
  chartTileId: string;
  controller: WorkspaceController;
  selectedSymbol?: string;
  selectedTimeframe?: string;
  availableTimeframes?: readonly string[];
  applyIndicatorSetToTile: (chartTileId: string) => void;
}

interface AddChartTabForSymbolOptions extends AddChartTabOptions {
  symbol: string;
}

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

export interface ChartTileHeaderContext {
  activePaneId: string | null;
  activeSource: { symbol?: string; timeframe?: string };
  activeRuntime: { chart: DrishyaChartClient } | null;
}

type ChartTileLike = {
  tabs: readonly { id: string }[];
  activeTabId: string;
};

export type CloseChartTabResult =
  | "tab_closed"
  | "last_tab_remaining"
  | "tile_missing"
  | "tab_missing";

function addChartTabAndResolvePane(
  controller: WorkspaceController,
  chartTileId: string
): { tabId: string; paneId: string } | null {
  const tabId = controller.addChartTab(chartTileId);
  if (!tabId) return null;
  const nextTile = controller.getState().chartTiles[chartTileId];
  const nextTab = nextTile?.tabs.find((candidate) => candidate.id === tabId);
  const paneId = nextTab?.chartPaneId;
  if (!paneId) return null;
  return { tabId, paneId };
}

function resolveInheritedSource(
  options: Pick<
    AddChartTabOptions,
    "controller" | "selectedSymbol" | "selectedTimeframe" | "availableTimeframes"
  >
): { symbol?: string; timeframe?: string } {
  const activePaneId = options.controller.getState().activeChartPaneId;
  const inherited = options.controller.getState().chartPaneSources[activePaneId] ?? {};
  return {
    symbol: inherited.symbol ?? options.selectedSymbol,
    timeframe: inherited.timeframe ?? options.selectedTimeframe ?? options.availableTimeframes?.[0],
  };
}

export function getActiveTab<TTile extends ChartTileLike>(
  tile: TTile | null | undefined
): TTile["tabs"][number] | undefined {
  if (!tile) return undefined;
  return tile.tabs.find((tab) => tab.id === tile.activeTabId) ?? tile.tabs[0];
}

export function closeChartTab(
  controller: WorkspaceController,
  chartTileId: string,
  tabId: string
): CloseChartTabResult {
  const currentTile = controller.getState().chartTiles[chartTileId];
  if (!currentTile) return "tile_missing";
  if (!currentTile.tabs.some((tab) => tab.id === tabId)) return "tab_missing";
  if (currentTile.tabs.length <= 1) return "last_tab_remaining";
  controller.removeChartTab(chartTileId, tabId);
  return "tab_closed";
}

export function removeWorkspaceTileByChartTileId(
  controller: WorkspaceController,
  chartTileId: string
): boolean {
  const state = controller.getState();
  const tileId = Object.entries(state.workspaceTiles).find(
    ([, tile]) => tile?.kind === "chart" && tile.chartTileId === chartTileId
  )?.[0];
  if (!tileId) return false;
  controller.removeWorkspaceTile(tileId);
  return true;
}

export function initializeChartTileSourceState(
  options: InitializeChartTileSourceStateOptions
): InitializedChartTileSourceState {
  const tile = options.controller.getState().chartTiles[options.chartTileId];
  const activeTab = getActiveTab(tile);
  const paneId = activeTab?.chartPaneId;
  const symbol = options.marketControls?.selectedSymbol ?? options.marketControls?.symbols?.[0];
  const timeframe =
    options.marketControls?.selectedTimeframe ?? options.marketControls?.timeframes?.[0];
  if (activeTab && symbol) {
    options.controller.setChartTabTitle(options.chartTileId, activeTab.id, symbol);
  }
  if (paneId && (symbol || timeframe)) {
    options.controller.setChartPaneSource(paneId, { symbol, timeframe });
  }
  return { paneId, symbol, timeframe };
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

export function addChartTabWithInheritedSource(options: AddChartTabOptions): string | null {
  const added = addChartTabAndResolvePane(options.controller, options.chartTileId);
  if (!added) return null;
  options.controller.setChartPaneSource(added.paneId, resolveInheritedSource(options));
  options.applyIndicatorSetToTile(options.chartTileId);
  return added.tabId;
}

export function addChartTabForSymbol(
  options: AddChartTabForSymbolOptions
): { paneId: string; timeframe: string | undefined } | null {
  const added = addChartTabAndResolvePane(options.controller, options.chartTileId);
  if (!added) return null;
  options.controller.setChartTabTitle(options.chartTileId, added.tabId, options.symbol);
  const timeframe = resolveInheritedSource(options).timeframe;
  options.controller.setChartPaneSource(added.paneId, { symbol: options.symbol, timeframe });
  options.applyIndicatorSetToTile(options.chartTileId);
  return { paneId: added.paneId, timeframe };
}

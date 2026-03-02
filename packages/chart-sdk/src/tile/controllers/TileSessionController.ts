import type {
  WorkspaceChartTileId,
  WorkspaceChartTileSpec,
  WorkspaceChartTabId,
  WorkspaceChartTabSpec,
} from "../../workspace/models/types.js";
import type { WorkspaceState } from "../../workspace/controllers/WorkspaceController.js";
import { normalizeIndicatorIds } from "../../workspace/services/indicatorIdentity.js";

export interface TileSessionSnapshot {
  chartTileId: WorkspaceChartTileId;
  chartTile: WorkspaceChartTileSpec;
  indicatorTokens: string[];
  paneIds: string[];
}

export class TileSessionController {
  static snapshot(
    state: WorkspaceState,
    chartTileIndicatorTokens: Record<string, string[]>,
    chartTileId: WorkspaceChartTileId
  ): TileSessionSnapshot | null {
    const chartTile = state.chartTiles[chartTileId];
    if (!chartTile) return null;
    return {
      chartTileId,
      chartTile,
      indicatorTokens: normalizeIndicatorIds(chartTileIndicatorTokens[chartTileId] ?? []),
      paneIds: chartTile.tabs.map((tab) => tab.chartPaneId),
    };
  }

  static setIndicatorTokens(
    chartTileIndicatorTokens: Record<string, string[]>,
    chartTileId: WorkspaceChartTileId,
    tokens: readonly string[]
  ): Record<string, string[]> {
    return {
      ...chartTileIndicatorTokens,
      [chartTileId]: normalizeIndicatorIds(tokens),
    };
  }

  static setActiveTab(
    state: WorkspaceState,
    chartTileId: WorkspaceChartTileId,
    tabId: WorkspaceChartTabId
  ): WorkspaceState {
    const tile = state.chartTiles[chartTileId];
    if (!tile) return state;
    const tab = tile.tabs.find((candidate) => candidate.id === tabId);
    if (!tab) return state;
    return {
      ...state,
      chartTiles: {
        ...state.chartTiles,
        [chartTileId]: { ...tile, activeTabId: tabId },
      },
      activeChartTileId: chartTileId,
      activeChartPaneId: tab.chartPaneId,
    };
  }

  static setTabTitle(
    state: WorkspaceState,
    chartTileId: WorkspaceChartTileId,
    tabId: WorkspaceChartTabId,
    title: string
  ): WorkspaceState {
    const tile = state.chartTiles[chartTileId];
    if (!tile) return state;
    const trimmed = String(title || "").trim();
    if (!trimmed) return state;
    const idx = tile.tabs.findIndex((candidate) => candidate.id === tabId);
    if (idx < 0) return state;
    const current = tile.tabs[idx];
    if (current?.title === trimmed) return state;
    const nextTabs = [...tile.tabs];
    nextTabs[idx] = { ...nextTabs[idx]!, title: trimmed };
    return {
      ...state,
      chartTiles: {
        ...state.chartTiles,
        [chartTileId]: {
          ...tile,
          tabs: nextTabs,
        },
      },
    };
  }

  static moveTab(
    state: WorkspaceState,
    sourceChartTileId: WorkspaceChartTileId,
    tabId: WorkspaceChartTabId,
    targetChartTileId: WorkspaceChartTileId,
    targetIndex: number
  ): WorkspaceState {
    const sourceTile = state.chartTiles[sourceChartTileId];
    const targetTile = state.chartTiles[targetChartTileId];
    if (!sourceTile || !targetTile) return state;
    const movingTab = sourceTile.tabs.find((tab) => tab.id === tabId);
    if (!movingTab) return state;

    if (sourceChartTileId === targetChartTileId) {
      const currentIndex = sourceTile.tabs.findIndex((tab) => tab.id === tabId);
      if (currentIndex < 0) return state;
      const clamped = Math.max(0, Math.min(sourceTile.tabs.length - 1, targetIndex));
      if (clamped === currentIndex) return state;
      const nextTabs = [...sourceTile.tabs];
      nextTabs.splice(currentIndex, 1);
      nextTabs.splice(clamped, 0, movingTab);
      return {
        ...state,
        chartTiles: {
          ...state.chartTiles,
          [sourceChartTileId]: {
            ...sourceTile,
            tabs: nextTabs,
          },
        },
      };
    }

    if (sourceTile.tabs.length <= 1) return state;
    const sourceTabs = sourceTile.tabs.filter((tab) => tab.id !== tabId);
    const sourceActiveTabId =
      sourceTile.activeTabId === tabId ? sourceTabs[0]?.id ?? sourceTile.activeTabId : sourceTile.activeTabId;
    const targetTabs = [...targetTile.tabs];
    const clampedTargetIndex = Math.max(0, Math.min(targetTabs.length, targetIndex));
    targetTabs.splice(clampedTargetIndex, 0, movingTab);
    return {
      ...state,
      chartTiles: {
        ...state.chartTiles,
        [sourceChartTileId]: {
          ...sourceTile,
          tabs: sourceTabs,
          activeTabId: sourceActiveTabId,
        },
        [targetChartTileId]: {
          ...targetTile,
          tabs: targetTabs,
          activeTabId: movingTab.id,
        },
      },
      activeChartTileId: targetChartTileId,
      activeChartPaneId: movingTab.chartPaneId,
    };
  }

  static appendTab(
    state: WorkspaceState,
    chartTileId: WorkspaceChartTileId,
    nextTab: WorkspaceChartTabSpec
  ): WorkspaceState {
    const tile = state.chartTiles[chartTileId];
    if (!tile) return state;
    return {
      ...state,
      chartTiles: {
        ...state.chartTiles,
        [chartTileId]: {
          ...tile,
          tabs: [...tile.tabs, nextTab],
          activeTabId: nextTab.id,
        },
      },
      activeChartTileId: chartTileId,
      activeChartPaneId: nextTab.chartPaneId,
    };
  }
}

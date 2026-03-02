import type { SeriesStyleOverride } from "../wasm/contracts.js";
import type { WorkspaceChartPaneSpec, WorkspaceChartSplitNode } from "./types.js";
import { normalizeIndicatorIds } from "./indicatorIdentity.js";

export interface PersistedChartTileShape {
  id: string;
  tabs: Array<{ id: string; title: string; chartPaneId: string }>;
  activeTabId: string;
}

export interface PersistedChartTileStoredShape extends PersistedChartTileShape {
  config?: PersistedChartTileConfig;
}

export interface PersistedChartTileConfig {
  paneSourcesByPane?: Record<string, { symbol?: string; timeframe?: string }>;
  paneStateByPane?: Record<string, string | null>;
  indicators?: string[];
  indicatorStyleOverridesByPane?: Record<string, Record<string, SeriesStyleOverride>>;
  treeOpen?: boolean;
}

export const normalizePersistedChartTileConfig = (
  raw?: PersistedChartTileConfig
): PersistedChartTileConfig => {
  const paneSourcesByPane: Record<string, { symbol?: string; timeframe?: string }> = {};
  for (const [paneId, src] of Object.entries(raw?.paneSourcesByPane ?? {})) {
    if (!src || typeof src !== "object") continue;
    paneSourcesByPane[paneId] = {
      symbol: typeof src.symbol === "string" ? src.symbol : undefined,
      timeframe: typeof src.timeframe === "string" ? src.timeframe : undefined,
    };
  }
  const paneStateByPane: Record<string, string | null> = {};
  for (const [paneId, paneState] of Object.entries(raw?.paneStateByPane ?? {})) {
    paneStateByPane[paneId] = typeof paneState === "string" ? paneState : null;
  }
  const indicatorStyleOverridesByPane: Record<string, Record<string, SeriesStyleOverride>> = {};
  for (const [paneId, styleMap] of Object.entries(raw?.indicatorStyleOverridesByPane ?? {})) {
    if (!styleMap || typeof styleMap !== "object") continue;
    indicatorStyleOverridesByPane[paneId] = styleMap as Record<string, SeriesStyleOverride>;
  }
  return {
    paneSourcesByPane,
    paneStateByPane,
    indicators: normalizeIndicatorIds(raw?.indicators ?? []),
    indicatorStyleOverridesByPane,
    treeOpen: raw?.treeOpen === true,
  };
};

export const normalizePersistedChartTiles = (
  raw?: Record<string, PersistedChartTileStoredShape>
): Record<string, PersistedChartTileStoredShape> => {
  const out: Record<string, PersistedChartTileStoredShape> = {};
  for (const [tileId, value] of Object.entries(raw ?? {})) {
    const tabs = Array.isArray(value?.tabs)
      ? value.tabs
          .map((tab) => ({
            id: typeof tab?.id === "string" ? tab.id : "",
            title: typeof tab?.title === "string" ? tab.title : "Chart",
            chartPaneId: typeof tab?.chartPaneId === "string" ? tab.chartPaneId : "",
          }))
          .filter((tab) => tab.id && tab.chartPaneId)
      : [];
    if (!tabs.length) continue;
    const activeTabId =
      typeof value?.activeTabId === "string" && tabs.some((tab) => tab.id === value.activeTabId)
        ? value.activeTabId
        : tabs[0].id;
    out[tileId] = {
      id: typeof value?.id === "string" ? value.id : tileId,
      tabs,
      activeTabId,
      config: normalizePersistedChartTileConfig(value?.config),
    };
  }
  return out;
};

export const deriveChartPanesFromPersistedTiles = (
  chartTiles: Record<string, PersistedChartTileStoredShape>
): Record<string, WorkspaceChartPaneSpec> => {
  const panes: Record<string, WorkspaceChartPaneSpec> = {
    price: { id: "price", title: "Main Chart", visible: true },
  };
  for (const tile of Object.values(chartTiles)) {
    for (const tab of tile.tabs) {
      if (!tab.chartPaneId || panes[tab.chartPaneId]) continue;
      panes[tab.chartPaneId] = {
        id: tab.chartPaneId,
        title: tab.title || tab.chartPaneId.toUpperCase(),
        visible: true,
      };
    }
  }
  return panes;
};

export const deriveActivePaneIdFromPersistedTiles = (
  chartTiles: Record<string, PersistedChartTileStoredShape>,
  activeChartTileId?: string
): string => {
  if (activeChartTileId && chartTiles[activeChartTileId]) {
    const tile = chartTiles[activeChartTileId];
    const activeTab = tile.tabs.find((tab) => tab.id === tile.activeTabId) ?? tile.tabs[0];
    if (activeTab?.chartPaneId) return activeTab.chartPaneId;
  }
  const firstTile = Object.values(chartTiles)[0];
  const firstTab = firstTile?.tabs?.[0];
  return firstTab?.chartPaneId ?? "price";
};

export const buildChartLayoutTree = (paneIds: string[]): WorkspaceChartSplitNode => {
  const ordered = paneIds.filter((id) => id && id !== "price");
  let tree: WorkspaceChartSplitNode = { type: "leaf", chartPaneId: "price" };
  for (const paneId of ordered) {
    tree = {
      type: "split",
      direction: "horizontal",
      ratio: 0.5,
      first: tree,
      second: { type: "leaf", chartPaneId: paneId },
    };
  }
  return tree;
};

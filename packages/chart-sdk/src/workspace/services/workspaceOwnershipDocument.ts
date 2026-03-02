import type { WorkspaceLayoutNode } from "../../state/schema.js";
import type { PersistedChartTileStoredShape } from "./persistenceHelpers.js";
import type { WorkspaceState } from "../controllers/WorkspaceController.js";
import type { WorkspaceGraphState, TileSessionState } from "../models/ownership.js";

export interface WorkspaceOwnershipDocument {
  workspace: WorkspaceGraphState;
  tileSessions: Record<string, PersistedChartTileStoredShape>;
}

export function buildWorkspaceOwnershipDocument(options: {
  state: WorkspaceState;
  chartTiles: Record<string, PersistedChartTileStoredShape>;
  workspaceLayoutTree?: WorkspaceLayoutNode;
  chartTileIndicatorTokens?: Record<string, string[]>;
}): WorkspaceOwnershipDocument {
  const { state, chartTiles, workspaceLayoutTree, chartTileIndicatorTokens } = options;
  const tileSessions: Record<string, PersistedChartTileStoredShape> = {};
  for (const [chartTileId, tile] of Object.entries(chartTiles)) {
    tileSessions[chartTileId] = {
      ...tile,
      config: {
        ...tile.config,
        indicators: chartTileIndicatorTokens?.[chartTileId] ?? tile.config?.indicators ?? [],
      },
    };
  }
  return {
    workspace: {
      activeChartTileId: state.activeChartTileId,
      workspaceTiles: state.workspaceTiles,
      workspaceTileOrder: state.workspaceTileOrder,
      workspaceLayoutTree,
    },
    tileSessions,
  };
}

export function flattenOwnershipDocumentForLegacyRuntime(doc: WorkspaceOwnershipDocument): {
  workspaceTiles: WorkspaceState["workspaceTiles"];
  workspaceTileOrder: WorkspaceState["workspaceTileOrder"];
  activeChartTileId: WorkspaceState["activeChartTileId"];
  activeWorkspaceTileId: string | undefined;
} {
  const activeWorkspaceTileId = Object.values(doc.workspace.workspaceTiles).find(
    (tile) => tile.kind === "chart" && tile.chartTileId === doc.workspace.activeChartTileId
  )?.id;
  return {
    workspaceTiles: doc.workspace.workspaceTiles,
    workspaceTileOrder: doc.workspace.workspaceTileOrder,
    activeChartTileId: doc.workspace.activeChartTileId,
    activeWorkspaceTileId,
  };
}

export function toTileSessionStates(
  state: WorkspaceState,
  chartTileIndicatorTokens: Record<string, string[]>
): Record<string, TileSessionState> {
  const out: Record<string, TileSessionState> = {};
  for (const [chartTileId, chartTile] of Object.entries(state.chartTiles)) {
    const paneIds = new Set(chartTile.tabs.map((tab) => tab.chartPaneId));
    const paneSources: Record<string, WorkspaceState["chartPaneSources"][string]> = {};
    for (const paneId of paneIds) {
      if (state.chartPaneSources[paneId]) {
        paneSources[paneId] = state.chartPaneSources[paneId]!;
      }
    }
    out[chartTileId] = {
      chartTileId,
      activeTabId: chartTile.activeTabId,
      tabs: chartTile.tabs,
      indicatorTokens: chartTileIndicatorTokens[chartTileId] ?? [],
      paneSources,
      replay: state.activeChartTileId === chartTileId ? state.replay : { playing: false, cursor_ts: null },
    };
  }
  return out;
}

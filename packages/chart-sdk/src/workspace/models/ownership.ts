import type { WorkspaceLayoutNode } from "../../state/schema.js";
import type {
  WorkspaceChartTileId,
  WorkspacePaneId,
  WorkspaceTileId,
  WorkspaceTileSpec,
} from "./types.js";
import type { WorkspaceState } from "../controllers/WorkspaceController.js";
import type { ReplayState } from "../../wasm/contracts.js";

export interface WorkspaceGraphState {
  activeChartTileId: WorkspaceChartTileId;
  workspaceTiles: Record<WorkspaceTileId, WorkspaceTileSpec>;
  workspaceTileOrder: WorkspaceTileId[];
  workspaceLayoutTree?: WorkspaceLayoutNode;
}

export interface TileSessionState {
  chartTileId: WorkspaceChartTileId;
  activeTabId: string;
  tabs: WorkspaceState["chartTiles"][string]["tabs"];
  indicatorTokens: string[];
  paneSources: Record<WorkspacePaneId, WorkspaceState["chartPaneSources"][string]>;
  replay: ReplayState;
}

export function assertWorkspaceGraphState(graph: WorkspaceGraphState): void {
  if (!graph.workspaceTiles[graph.workspaceTileOrder[0] ?? ""] && graph.workspaceTileOrder.length > 0) {
    throw new Error("Workspace graph invariant failed: tile order references unknown tile id");
  }
  if (!Object.values(graph.workspaceTiles).some((tile) => tile.kind === "chart")) {
    throw new Error("Workspace graph invariant failed: expected at least one chart tile");
  }
}

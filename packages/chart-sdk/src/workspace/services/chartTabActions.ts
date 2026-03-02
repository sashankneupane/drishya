import type { WorkspaceController } from "../controllers/WorkspaceController.js";

export function closeChartTabOrTile(
  controller: WorkspaceController,
  chartTileId: string,
  tabId: string
): boolean {
  const currentTile = controller.getState().chartTiles[chartTileId];
  if (!currentTile) return false;
  if (currentTile.tabs.length > 1) {
    controller.removeChartTab(chartTileId, tabId);
    return true;
  }
  const state = controller.getState();
  const workspaceTileId = Object.entries(state.workspaceTiles).find(
    ([, tile]) => tile?.kind === "chart" && tile.chartTileId === chartTileId
  )?.[0];
  if (!workspaceTileId) return false;
  controller.removeWorkspaceTile(workspaceTileId);
  return true;
}


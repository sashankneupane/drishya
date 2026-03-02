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
  const workspaceTileId = state.workspaceTileOrder.find(
    (id) => state.workspaceTiles[id]?.chartTileId === chartTileId
  );
  if (!workspaceTileId) return false;
  controller.removeWorkspaceTile(workspaceTileId);
  return true;
}


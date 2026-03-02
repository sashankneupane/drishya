import type { WorkspaceController } from "../controllers/WorkspaceController.js";

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


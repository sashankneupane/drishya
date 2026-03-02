import type { WorkspaceController } from "./WorkspaceController.js";

export function removeWorkspaceTileByChartTileId(
  controller: WorkspaceController,
  chartTileId: string
): boolean {
  const state = controller.getState();
  const tileId = state.workspaceTileOrder.find(
    (workspaceTileId) =>
      state.workspaceTiles[workspaceTileId]?.kind === "chart" &&
      state.workspaceTiles[workspaceTileId]?.chartTileId === chartTileId
  );
  if (!tileId) return false;
  controller.removeWorkspaceTile(tileId);
  return true;
}


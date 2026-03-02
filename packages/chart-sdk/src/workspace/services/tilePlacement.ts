import type { WorkspaceController } from "../controllers/WorkspaceController.js";

interface PlaceNewChartTileAtPointerOptions {
  controller: WorkspaceController;
  tileShellById: Map<string, HTMLDivElement>;
  clientX: number;
  newTileId: string;
}

export function placeNewChartTileAtPointer(
  options: PlaceNewChartTileAtPointerOptions
): boolean {
  const state = options.controller.getState();
  const ordered = state.workspaceTileOrder.filter(
    (id) => state.workspaceTiles[id]?.kind === "chart"
  );
  if (!ordered.includes(options.newTileId)) return false;
  const centers = ordered.map((id) => {
    const el = options.tileShellById.get(id);
    const rect = el?.getBoundingClientRect();
    return rect ? rect.left + rect.width / 2 : Number.POSITIVE_INFINITY;
  });
  let targetIndex = ordered.length - 1;
  for (let i = 0; i < centers.length; i += 1) {
    if (options.clientX < centers[i]) {
      targetIndex = i;
      break;
    }
  }
  options.controller.moveWorkspaceTile(options.newTileId, targetIndex);
  return true;
}


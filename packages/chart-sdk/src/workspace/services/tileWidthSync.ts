import type { WorkspaceState } from "../controllers/WorkspaceController.js";

export function syncChartTileShellWidths(
  state: WorkspaceState,
  tileShellById: Map<string, HTMLDivElement>
): void {
  const order = state.workspaceTileOrder.filter((tileId) => state.workspaceTiles[tileId]);
  const visibleChartTiles = order.filter((tileId) => state.workspaceTiles[tileId]?.kind === "chart");
  const sum = visibleChartTiles.reduce(
    (acc, tileId) => acc + Math.max(0.0001, state.workspaceTiles[tileId]?.widthRatio ?? 0),
    0
  );
  for (const tileId of order) {
    const tile = state.workspaceTiles[tileId];
    const el = tileShellById.get(tileId);
    if (!tile || !el) continue;
    if (tile.kind !== "chart") {
      el.style.display = "none";
      continue;
    }
    el.style.display = "";
    const ratio = Math.max(0.0001, tile.widthRatio || 0) / Math.max(0.0001, sum);
    el.style.flex = `0 0 ${ratio * 100}%`;
    el.style.minWidth = "360px";
  }
}


import type { WorkspaceTileId, WorkspaceTileSpec } from "../models/types.js";
import type { WorkspaceState } from "./WorkspaceController.js";

export class WorkspaceGraphController {
  static moveWorkspaceTile(state: WorkspaceState, tileId: WorkspaceTileId, nextIndex: number): WorkspaceState {
    const currentIndex = state.workspaceTileOrder.indexOf(tileId);
    if (currentIndex < 0) return state;
    const clamped = Math.max(0, Math.min(state.workspaceTileOrder.length - 1, nextIndex));
    if (clamped === currentIndex) return state;
    const nextOrder = [...state.workspaceTileOrder];
    nextOrder.splice(currentIndex, 1);
    nextOrder.splice(clamped, 0, tileId);
    return { ...state, workspaceTileOrder: nextOrder };
  }

  static updateWorkspaceTileRatios(
    state: WorkspaceState,
    updates: Record<WorkspaceTileId, number>
  ): WorkspaceState {
    const nextTiles = { ...state.workspaceTiles };
    for (const [tileId, ratio] of Object.entries(updates)) {
      const tile = nextTiles[tileId];
      if (!tile) continue;
      nextTiles[tileId] = { ...tile, widthRatio: Math.max(0.08, ratio) };
    }
    return {
      ...state,
      workspaceTiles: WorkspaceGraphController.normalizeWorkspaceTileRatios({
        ...state,
        workspaceTiles: nextTiles,
      }).workspaceTiles,
    };
  }

  static normalizeWorkspaceTileRatios(state: WorkspaceState): WorkspaceState {
    const chartTileIds = Object.entries(state.workspaceTiles)
      .filter(([, tile]) => tile.kind === "chart")
      .map(([tileId]) => tileId);
    const ratioSum = chartTileIds.reduce(
      (sum, id) => sum + Math.max(0, state.workspaceTiles[id]?.widthRatio ?? 0),
      0
    );
    const next = { ...state.workspaceTiles };
    if (ratioSum <= 0) {
      const each = 1 / Math.max(1, chartTileIds.length);
      for (const id of chartTileIds) next[id] = { ...next[id], widthRatio: each };
      return { ...state, workspaceTiles: next };
    }
    for (const id of chartTileIds) {
      const raw = Math.max(0, next[id]?.widthRatio ?? 0);
      next[id] = { ...next[id], widthRatio: raw / ratioSum };
    }
    return { ...state, workspaceTiles: next };
  }

  static appendChartTile(
    state: WorkspaceState,
    tileId: WorkspaceTileId,
    chartTileId: string
  ): WorkspaceState {
    const chartCount = Object.values(state.workspaceTiles).filter((tile) => tile.kind === "chart").length;
    const tile: WorkspaceTileSpec = {
      id: tileId,
      kind: "chart",
      title: `Chart ${chartCount + 1}`,
      widthRatio: 0.5,
      chartTileId,
    };
    return {
      ...state,
      workspaceTiles: {
        ...state.workspaceTiles,
        [tileId]: tile,
      },
      workspaceTileOrder: [...state.workspaceTileOrder, tileId],
      activeChartTileId: chartTileId,
    };
  }

  static removeWorkspaceTileRecord(state: WorkspaceState, tileId: WorkspaceTileId): WorkspaceState {
    if (!state.workspaceTiles[tileId]) return state;
    const nextTiles = { ...state.workspaceTiles };
    delete nextTiles[tileId];
    return {
      ...state,
      workspaceTiles: nextTiles,
      workspaceTileOrder: state.workspaceTileOrder.filter((id) => id !== tileId),
    };
  }
}

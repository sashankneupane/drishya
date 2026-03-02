import type {
  AssetId,
  ChartTileState,
  TileId,
  WorkspaceDocument,
  WorkspaceState,
} from "./schema.js";

export const selectWorkspaceState = (doc: WorkspaceDocument): WorkspaceState => doc.workspace;

export const selectTiles = (doc: WorkspaceDocument) => doc.workspace.tiles;

export const selectTile = (doc: WorkspaceDocument, tileId: TileId) =>
  doc.workspace.tiles[tileId] ?? null;

export const selectChartTile = (doc: WorkspaceDocument, tileId: TileId): ChartTileState | null => {
  const tile = doc.workspace.tiles[tileId];
  if (!tile || tile.kind !== "chart" || !tile.chart) return null;
  return tile.chart;
};

export const selectActiveTileId = (doc: WorkspaceDocument): TileId | null =>
  doc.workspace.activeTileId;

export const selectDrawingsForAsset = (doc: WorkspaceDocument, assetId: AssetId) =>
  doc.workspace.drawingsByAsset[assetId] ?? {};

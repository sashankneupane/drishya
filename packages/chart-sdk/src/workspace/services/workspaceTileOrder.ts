import type { WorkspaceLayoutNode } from "../../state/schema.js";

interface WorkspaceTileShape {
  kind: "chart" | "objects";
}

interface CollectWorkspaceTileOrderOptions {
  layoutTree?: WorkspaceLayoutNode;
  workspaceTileOrder?: readonly string[];
  workspaceTiles: Record<string, WorkspaceTileShape | undefined>;
}

const collectLayoutLeafTileIds = (node: WorkspaceLayoutNode): string[] => {
  if (node.type === "leaf") return [node.tileId];
  return [...collectLayoutLeafTileIds(node.first), ...collectLayoutLeafTileIds(node.second)];
};

export function collectWorkspaceTileOrder(
  options: CollectWorkspaceTileOrderOptions
): string[] {
  const { workspaceTiles } = options;
  const fromTree = options.layoutTree
    ? collectLayoutLeafTileIds(options.layoutTree).filter((tileId) => workspaceTiles[tileId])
    : [];
  const fallback = (options.workspaceTileOrder ?? []).filter((tileId) => workspaceTiles[tileId]);
  if (fromTree.length === 0) return fallback;
  const seen = new Set(fromTree);
  const missingFromTree = fallback.filter((tileId) => !seen.has(tileId));
  return [...fromTree, ...missingFromTree];
}

export function collectWorkspaceChartTileOrder(
  options: CollectWorkspaceTileOrderOptions
): string[] {
  return collectWorkspaceTileOrder(options).filter(
    (tileId) => options.workspaceTiles[tileId]?.kind === "chart"
  );
}

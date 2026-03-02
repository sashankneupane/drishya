import type { WorkspaceState } from "../controllers/WorkspaceController.js";
import type { WorkspaceLayoutNode } from "../../state/schema.js";
import { collectWorkspaceTileOrder } from "./workspaceTileOrder.js";

export function syncChartTileShellWidths(
  state: WorkspaceState & { workspaceLayoutTree?: WorkspaceLayoutNode },
  tileShellById: Map<string, HTMLDivElement>,
  tilesContainer: HTMLDivElement
): void {
  const chartOrder = collectWorkspaceTileOrder({
    layoutTree: state.workspaceLayoutTree,
    workspaceTileOrder: state.workspaceTileOrder,
    workspaceTiles: state.workspaceTiles,
  }).filter((tileId) => state.workspaceTiles[tileId]?.kind === "chart");
  const layoutTree = state.workspaceLayoutTree ?? buildLinearRowTree(chartOrder);
  if (!layoutTree) return;
  applyTreeRectsLayout(state, tileShellById, tilesContainer, layoutTree);
}

function applyTreeRectsLayout(
  state: WorkspaceState & { workspaceLayoutTree?: WorkspaceLayoutNode },
  tileShellById: Map<string, HTMLDivElement>,
  tilesContainer: HTMLDivElement,
  layoutTree: WorkspaceLayoutNode
): void {
  const chartTileIds = new Set(
    Object.entries(state.workspaceTiles)
      .filter(([, tile]) => tile?.kind === "chart")
      .map(([tileId]) => tileId)
  );
  const chartLayoutTree = pruneLayoutTree(layoutTree, chartTileIds);
  if (!chartLayoutTree) return;
  const uniqueChartLayoutTree = dedupeLayoutTreeLeaves(chartLayoutTree);
  if (!uniqueChartLayoutTree) return;

  const bounds = tilesContainer.getBoundingClientRect();
  const rootRect = {
    x: 0,
    y: 0,
    w: Math.max(1, Math.floor(bounds.width)),
    h: Math.max(1, Math.floor(bounds.height)),
  };
  const rectByTileId = new Map<string, { x: number; y: number; w: number; h: number }>();
  collectLeafRects(uniqueChartLayoutTree, rootRect, rectByTileId);

  const order = collectWorkspaceTileOrder({
    layoutTree,
    workspaceTileOrder: state.workspaceTileOrder,
    workspaceTiles: state.workspaceTiles,
  });
  for (const tileId of order) {
    const tile = state.workspaceTiles[tileId];
    const shell = tileShellById.get(tileId);
    if (!tile || !shell) continue;
    if (tile.kind !== "chart") {
      shell.style.display = "none";
      continue;
    }
    const rect = rectByTileId.get(tileId);
    if (!rect) {
      shell.style.display = "none";
      continue;
    }
    shell.style.display = "";
    shell.style.flex = "none";
    shell.style.minWidth = "0";
    shell.style.minHeight = "0";
    shell.style.position = "absolute";
    shell.style.left = `${rect.x}px`;
    shell.style.top = `${rect.y}px`;
    shell.style.width = `${rect.w}px`;
    shell.style.height = `${rect.h}px`;
  }
}

function buildLinearRowTree(tileIds: readonly string[]): WorkspaceLayoutNode | null {
  if (tileIds.length === 0) return null;
  let tree: WorkspaceLayoutNode = { type: "leaf", tileId: tileIds[0]! };
  for (let i = 1; i < tileIds.length; i += 1) {
    tree = {
      type: "split",
      id: `workspace-sync-fallback-${i}`,
      direction: "row",
      ratio: 0.5,
      first: tree,
      second: { type: "leaf", tileId: tileIds[i]! },
    };
  }
  return tree;
}

function collectLeafRects(
  node: WorkspaceLayoutNode,
  rect: { x: number; y: number; w: number; h: number },
  out: Map<string, { x: number; y: number; w: number; h: number }>
): void {
  if (node.type === "leaf") {
    out.set(node.tileId, rect);
    return;
  }
  const ratio = Math.max(0.05, Math.min(0.95, node.ratio));
  if (node.direction === "row") {
    const firstW = Math.max(1, Math.floor(rect.w * ratio));
    const secondW = Math.max(1, rect.w - firstW);
    collectLeafRects(node.first, { x: rect.x, y: rect.y, w: firstW, h: rect.h }, out);
    collectLeafRects(node.second, { x: rect.x + firstW, y: rect.y, w: secondW, h: rect.h }, out);
    return;
  }
  const firstH = Math.max(1, Math.floor(rect.h * ratio));
  const secondH = Math.max(1, rect.h - firstH);
  collectLeafRects(node.first, { x: rect.x, y: rect.y, w: rect.w, h: firstH }, out);
  collectLeafRects(node.second, { x: rect.x, y: rect.y + firstH, w: rect.w, h: secondH }, out);
}

function pruneLayoutTree(
  node: WorkspaceLayoutNode,
  allowedTileIds: Set<string>
): WorkspaceLayoutNode | null {
  if (node.type === "leaf") {
    return allowedTileIds.has(node.tileId) ? node : null;
  }
  const first = pruneLayoutTree(node.first, allowedTileIds);
  const second = pruneLayoutTree(node.second, allowedTileIds);
  if (!first && !second) return null;
  if (!first) return second;
  if (!second) return first;
  return { ...node, first, second };
}

function dedupeLayoutTreeLeaves(
  node: WorkspaceLayoutNode,
  seen: Set<string> = new Set()
): WorkspaceLayoutNode | null {
  if (node.type === "leaf") {
    if (seen.has(node.tileId)) return null;
    seen.add(node.tileId);
    return node;
  }
  const first = dedupeLayoutTreeLeaves(node.first, seen);
  const second = dedupeLayoutTreeLeaves(node.second, seen);
  if (!first && !second) return null;
  if (!first) return second;
  if (!second) return first;
  return { ...node, first, second };
}


import type { WorkspaceLayoutNode } from "../../state/schema.js";

export type WorkspaceTileDropSide = "left" | "right" | "top" | "bottom";

export interface WorkspaceTileDropTarget {
  tileId: string;
  side: WorkspaceTileDropSide;
  previewRect: { x: number; y: number; w: number; h: number };
}

interface ResolveWorkspaceTileDropTargetOptions {
  orderedChartTileIds: readonly string[];
  tileShellById: Map<string, HTMLDivElement>;
  clientX: number;
  clientY: number;
  excludeTileId?: string;
}

interface ApplyWorkspaceTileDropOptions {
  layoutTree: WorkspaceLayoutNode;
  tileId: string;
  targetTileId: string;
  side: WorkspaceTileDropSide;
}

export function resolveWorkspaceTileDropTarget(
  options: ResolveWorkspaceTileDropTargetOptions
): WorkspaceTileDropTarget | null {
  const candidates = options.orderedChartTileIds.filter((tileId) => tileId !== options.excludeTileId);
  if (candidates.length === 0) return null;

  const domHitTarget = resolveTileFromDomHit(options);
  if (domHitTarget) {
    const splitPreview = computePreviewRect(domHitTarget.rect, domHitTarget.side);
    return {
      tileId: domHitTarget.tileId,
      side: domHitTarget.side,
      previewRect: splitPreview,
    };
  }

  let bestTileId: string | null = null;
  let bestRect: DOMRect | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  let bestInsideDistance = Number.POSITIVE_INFINITY;

  for (const tileId of candidates) {
    const rect = options.tileShellById.get(tileId)?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) continue;
    const inside =
      options.clientX >= rect.left &&
      options.clientX <= rect.right &&
      options.clientY >= rect.top &&
      options.clientY <= rect.bottom;
    if (inside) {
      const cx = rect.left + rect.width * 0.5;
      const cy = rect.top + rect.height * 0.5;
      const insideDistance = Math.hypot(options.clientX - cx, options.clientY - cy);
      if (insideDistance < bestInsideDistance) {
        bestInsideDistance = insideDistance;
        bestTileId = tileId;
        bestRect = rect;
      }
      continue;
    }
    if (bestInsideDistance < Number.POSITIVE_INFINITY) continue;
    const cx = rect.left + rect.width * 0.5;
    const cy = rect.top + rect.height * 0.5;
    const dx = options.clientX - cx;
    const dy = options.clientY - cy;
    const distance = Math.hypot(dx, dy);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestTileId = tileId;
      bestRect = rect;
    }
  }

  if (!bestTileId || !bestRect) return null;

  const leftDist = Math.abs(options.clientX - bestRect.left);
  const rightDist = Math.abs(bestRect.right - options.clientX);
  const topDist = Math.abs(options.clientY - bestRect.top);
  const bottomDist = Math.abs(bestRect.bottom - options.clientY);
  const minDist = Math.min(leftDist, rightDist, topDist, bottomDist);

  let side: WorkspaceTileDropSide = "right";
  if (minDist === leftDist) side = "left";
  else if (minDist === rightDist) side = "right";
  else if (minDist === topDist) side = "top";
  else side = "bottom";

  const splitPreview = computePreviewRect(bestRect, side);
  return {
    tileId: bestTileId,
    side,
    previewRect: splitPreview,
  };
}

function resolveTileFromDomHit(
  options: ResolveWorkspaceTileDropTargetOptions
): { tileId: string; rect: DOMRect; side: WorkspaceTileDropSide } | null {
  if (typeof document === "undefined") return null;
  const hit = document.elementFromPoint(options.clientX, options.clientY);
  if (!hit) return null;
  const candidates = options.orderedChartTileIds.filter((tileId) => tileId !== options.excludeTileId);
  for (const tileId of candidates) {
    const shell = options.tileShellById.get(tileId);
    if (!shell) continue;
    if (!shell.contains(hit)) continue;
    const rect = shell.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    const side = resolveNearestSide(rect, options.clientX, options.clientY);
    return { tileId, rect, side };
  }
  return null;
}

function resolveNearestSide(rect: DOMRect, clientX: number, clientY: number): WorkspaceTileDropSide {
  const leftDist = Math.abs(clientX - rect.left);
  const rightDist = Math.abs(rect.right - clientX);
  const topDist = Math.abs(clientY - rect.top);
  const bottomDist = Math.abs(rect.bottom - clientY);
  const minDist = Math.min(leftDist, rightDist, topDist, bottomDist);
  if (minDist === leftDist) return "left";
  if (minDist === rightDist) return "right";
  if (minDist === topDist) return "top";
  return "bottom";
}

export function applyWorkspaceTileDrop(
  options: ApplyWorkspaceTileDropOptions
): WorkspaceLayoutNode {
  const { layoutTree, tileId, targetTileId, side } = options;
  if (tileId === targetTileId) return layoutTree;
  if (!treeContainsTile(layoutTree, targetTileId)) return layoutTree;

  const treeWithoutDragged = treeContainsTile(layoutTree, tileId)
    ? removeTileFromLayoutTree(layoutTree, tileId)
    : layoutTree;
  if (!treeWithoutDragged) return layoutTree;
  if (!treeContainsTile(treeWithoutDragged, targetTileId)) return layoutTree;

  const splitNode: WorkspaceLayoutNode = {
    type: "split",
    id: `workspace-drop-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    direction: side === "left" || side === "right" ? "row" : "column",
    ratio: 0.5,
    first:
      side === "left" || side === "top"
        ? { type: "leaf", tileId }
        : { type: "leaf", tileId: targetTileId },
    second:
      side === "left" || side === "top"
        ? { type: "leaf", tileId: targetTileId }
        : { type: "leaf", tileId },
  };

  return replaceLeafTile(treeWithoutDragged, targetTileId, splitNode).node;
}

function computePreviewRect(
  rect: DOMRect,
  side: WorkspaceTileDropSide
): { x: number; y: number; w: number; h: number } {
  const minBandPx = 24;
  if (side === "left" || side === "right") {
    const w = Math.max(minBandPx, Math.floor(rect.width * 0.5));
    return side === "left"
      ? { x: rect.left, y: rect.top, w, h: rect.height }
      : { x: rect.right - w, y: rect.top, w, h: rect.height };
  }
  const h = Math.max(minBandPx, Math.floor(rect.height * 0.5));
  return side === "top"
    ? { x: rect.left, y: rect.top, w: rect.width, h }
    : { x: rect.left, y: rect.bottom - h, w: rect.width, h };
}

function treeContainsTile(node: WorkspaceLayoutNode, tileId: string): boolean {
  if (node.type === "leaf") return node.tileId === tileId;
  return treeContainsTile(node.first, tileId) || treeContainsTile(node.second, tileId);
}

function removeTileFromLayoutTree(
  node: WorkspaceLayoutNode,
  tileId: string
): WorkspaceLayoutNode | null {
  if (node.type === "leaf") {
    return node.tileId === tileId ? null : node;
  }
  const first = removeTileFromLayoutTree(node.first, tileId);
  const second = removeTileFromLayoutTree(node.second, tileId);
  if (!first && !second) return null;
  if (!first) return second;
  if (!second) return first;
  return { ...node, first, second };
}

function replaceLeafTile(
  node: WorkspaceLayoutNode,
  targetTileId: string,
  replacement: WorkspaceLayoutNode
): { node: WorkspaceLayoutNode; replaced: boolean } {
  if (node.type === "leaf") {
    if (node.tileId === targetTileId) {
      return { node: replacement, replaced: true };
    }
    return { node, replaced: false };
  }
  const first = replaceLeafTile(node.first, targetTileId, replacement);
  if (first.replaced) {
    return {
      node: { ...node, first: first.node },
      replaced: true,
    };
  }
  const second = replaceLeafTile(node.second, targetTileId, replacement);
  if (second.replaced) {
    return {
      node: { ...node, second: second.node },
      replaced: true,
    };
  }
  return { node, replaced: false };
}


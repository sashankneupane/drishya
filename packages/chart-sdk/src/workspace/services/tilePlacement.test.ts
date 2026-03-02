import type { WorkspaceLayoutNode } from "../../state/schema.js";
import { applyWorkspaceTileDrop, resolveWorkspaceTileDropTarget } from "./tilePlacement.js";

function testResolveWorkspaceTileDropTargetPrefersNearestEdge() {
  const tileShellById = new Map<string, HTMLDivElement>();
  tileShellById.set("tile-a", makeShellRect(0, 0, 400, 300));
  tileShellById.set("tile-b", makeShellRect(400, 0, 400, 300));

  const target = resolveWorkspaceTileDropTarget({
    orderedChartTileIds: ["tile-a", "tile-b"],
    tileShellById,
    clientX: 180,
    clientY: 6,
  });
  if (!target) {
    throw new Error("Expected a drop target for pointer inside tile-a.");
  }
  if (target.tileId !== "tile-a") {
    throw new Error(`Expected tile-a as target, received ${target.tileId}.`);
  }
  if (target.side !== "top") {
    throw new Error(`Expected top split side, received ${target.side}.`);
  }
}

function testApplyWorkspaceTileDropInsertsNewTileWithColumnSplit() {
  const initial: WorkspaceLayoutNode = {
    type: "split",
    id: "root",
    direction: "row",
    ratio: 0.5,
    first: { type: "leaf", tileId: "tile-a" },
    second: { type: "leaf", tileId: "tile-b" },
  };
  const next = applyWorkspaceTileDrop({
    layoutTree: initial,
    tileId: "tile-c",
    targetTileId: "tile-a",
    side: "bottom",
  });
  const leafOrder = collectLeafIds(next);
  if (leafOrder.join(",") !== "tile-a,tile-c,tile-b") {
    throw new Error(`Unexpected leaf order after split: ${leafOrder.join(",")}`);
  }
  if (next.type !== "split" || next.first.type !== "split" || next.first.direction !== "column") {
    throw new Error("Expected tile-a branch to become a column split.");
  }
}

function testApplyWorkspaceTileDropMovesExistingTile() {
  const initial: WorkspaceLayoutNode = {
    type: "split",
    id: "root",
    direction: "row",
    ratio: 0.5,
    first: { type: "leaf", tileId: "tile-a" },
    second: { type: "leaf", tileId: "tile-b" },
  };
  const next = applyWorkspaceTileDrop({
    layoutTree: initial,
    tileId: "tile-b",
    targetTileId: "tile-a",
    side: "left",
  });
  const leafOrder = collectLeafIds(next);
  if (leafOrder.join(",") !== "tile-b,tile-a") {
    throw new Error(`Expected tile-b to move before tile-a, got ${leafOrder.join(",")}`);
  }
}

function makeShellRect(left: number, top: number, width: number, height: number): HTMLDivElement {
  const rect = {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({}),
  } as DOMRect;
  return {
    getBoundingClientRect: () => rect,
  } as HTMLDivElement;
}

function collectLeafIds(node: WorkspaceLayoutNode): string[] {
  if (node.type === "leaf") return [node.tileId];
  return [...collectLeafIds(node.first), ...collectLeafIds(node.second)];
}

testResolveWorkspaceTileDropTargetPrefersNearestEdge();
testApplyWorkspaceTileDropInsertsNewTileWithColumnSplit();
testApplyWorkspaceTileDropMovesExistingTile();

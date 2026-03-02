import type { LayoutRect } from "../../layout/splitTree.js";
import type { WorkspaceChartPaneId, WorkspaceChartSplitNode } from "../models/types.js";

export interface ChartPaneRect {
  chartPaneId: WorkspaceChartPaneId;
  rect: LayoutRect;
}

export function computeChartPaneRects(
  tree: WorkspaceChartSplitNode,
  viewport: LayoutRect
): ChartPaneRect[] {
  const out: ChartPaneRect[] = [];
  walk(tree, viewport, out);
  return out;
}

function walk(node: WorkspaceChartSplitNode, rect: LayoutRect, out: ChartPaneRect[]): void {
  if (node.type === "leaf") {
    out.push({ chartPaneId: node.chartPaneId, rect });
    return;
  }
  const ratio = clamp(node.ratio, 0.05, 0.95);
  if (node.direction === "horizontal") {
    const firstW = Math.floor(rect.w * ratio);
    const secondW = rect.w - firstW;
    walk(node.first, { x: rect.x, y: rect.y, w: firstW, h: rect.h }, out);
    walk(node.second, { x: rect.x + firstW, y: rect.y, w: secondW, h: rect.h }, out);
  } else {
    const firstH = Math.floor(rect.h * ratio);
    const secondH = rect.h - firstH;
    walk(node.first, { x: rect.x, y: rect.y, w: rect.w, h: firstH }, out);
    walk(node.second, { x: rect.x, y: rect.y + firstH, w: rect.w, h: secondH }, out);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

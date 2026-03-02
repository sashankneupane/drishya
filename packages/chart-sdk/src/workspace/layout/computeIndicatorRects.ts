import type { LayoutRect } from "../../layout/splitTree.js";
import { computePaneLayouts } from "../../chrome/layout.js";
import type { WorkspacePaneLayoutState } from "../models/types.js";

export interface PaneRect {
  paneId: string;
  rect: LayoutRect;
}

export function computeIndicatorRectsForChartPane(
  paneLayout: WorkspacePaneLayoutState,
  chartPaneId: string,
  chartRect: LayoutRect
): PaneRect[] {
  const scoped = selectPaneScope(paneLayout, chartPaneId);
  if (scoped.order.length === 0) {
    return [];
  }
  return computePaneLayouts(scoped, chartRect).map((it) => ({ paneId: it.id, rect: it.rect }));
}

function selectPaneScope(
  paneLayout: WorkspacePaneLayoutState,
  chartPaneId: string
): WorkspacePaneLayoutState {
  const order = paneLayout.order.filter((id) => {
    const spec = paneLayout.panes[id];
    if (!spec) return false;
    if (id === chartPaneId && (spec.kind === "price" || spec.kind === "chart")) return true;
    return spec.kind === "indicator" && spec.parentChartPaneId === chartPaneId;
  });

  const ratios: Record<string, number> = {};
  const visibility: Record<string, boolean> = {};
  const collapsed: Record<string, boolean> = {};
  const panes = {} as WorkspacePaneLayoutState["panes"];

  for (const id of order) {
    ratios[id] = paneLayout.ratios[id] ?? 0;
    visibility[id] = paneLayout.visibility[id] ?? true;
    collapsed[id] = paneLayout.collapsed[id] ?? false;
    panes[id] = paneLayout.panes[id];
  }

  return { order, ratios, visibility, collapsed, panes };
}

import type { WorkspacePaneId, WorkspacePaneKind, WorkspacePaneLayoutState, WorkspacePaneSpec } from "./types.js";

export function inferPaneKind(
  paneId: string,
  existingSpec?: WorkspacePaneSpec | null
): WorkspacePaneKind {
  if (existingSpec) return existingSpec.kind;
  if (paneId === "price") return "price";
  if (paneId.startsWith("chart-")) return "chart";
  return "indicator";
}

export function inferIndicatorParent(
  paneId: WorkspacePaneId,
  order: WorkspacePaneId[],
  panes: Record<WorkspacePaneId, WorkspacePaneSpec>
): WorkspacePaneId {
  const idx = order.indexOf(paneId);
  const scan = idx >= 0 ? order.slice(0, idx).reverse() : order.slice().reverse();
  for (const id of scan) {
    const spec = panes[id];
    if (!spec) continue;
    if (spec.kind === "price" || spec.kind === "chart") {
      return id;
    }
  }
  return "price";
}

export function buildPaneSpecForRuntime(
  paneId: WorkspacePaneId,
  layout: WorkspacePaneLayoutState,
  runtimeOrder: WorkspacePaneId[]
): WorkspacePaneSpec {
  const existing = layout.panes[paneId];
  const kind = inferPaneKind(paneId, existing);
  const spec: WorkspacePaneSpec = {
    id: paneId,
    kind,
    title:
      existing?.title ??
      (kind === "price" ? "Main Chart" : kind === "chart" ? paneId.toUpperCase() : paneId.toUpperCase())
  };
  if (kind === "indicator") {
    spec.parentChartPaneId =
      existing?.parentChartPaneId ?? inferIndicatorParent(paneId, runtimeOrder, layout.panes);
  }
  return spec;
}

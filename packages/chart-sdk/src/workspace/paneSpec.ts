import type { WorkspacePaneId, WorkspacePaneKind, WorkspacePaneLayoutState, WorkspacePaneSpec } from "./types.js";

export function canonicalRuntimePaneId(id: string): WorkspacePaneId {
  const trimmed = String(id || "").trim();
  if (!trimmed) return trimmed;
  if (trimmed === "price-pane") return "price";
  if (trimmed.endsWith("-pane")) return trimmed.slice(0, -"-pane".length);
  return trimmed;
}

export function inferPaneKind(
  paneId: string,
  existingSpec?: WorkspacePaneSpec | null
): WorkspacePaneKind {
  const canonicalId = canonicalRuntimePaneId(paneId);
  if (existingSpec) return existingSpec.kind;
  if (canonicalId === "price") return "price";
  if (canonicalId.startsWith("chart-")) return "chart";
  return "indicator";
}

export function inferIndicatorParent(
  paneId: WorkspacePaneId,
  order: WorkspacePaneId[],
  panes: Record<WorkspacePaneId, WorkspacePaneSpec>
): WorkspacePaneId {
  const canonicalId = canonicalRuntimePaneId(paneId);
  const canonicalOrder = order.map((id) => canonicalRuntimePaneId(id));
  const idx = canonicalOrder.indexOf(canonicalId);
  const scan = idx >= 0 ? canonicalOrder.slice(0, idx).reverse() : canonicalOrder.slice().reverse();
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
  const canonicalId = canonicalRuntimePaneId(paneId);
  const canonicalRuntimeOrder = runtimeOrder.map((id) => canonicalRuntimePaneId(id));
  const existing = layout.panes[canonicalId];
  const kind = inferPaneKind(canonicalId, existing);
  const spec: WorkspacePaneSpec = {
    id: canonicalId,
    kind,
    title:
      existing?.title ??
      (kind === "price" ? "Main Chart" : kind === "chart" ? canonicalId.toUpperCase() : canonicalId.toUpperCase())
  };
  if (kind === "indicator") {
    spec.parentChartPaneId =
      existing?.parentChartPaneId ?? inferIndicatorParent(canonicalId, canonicalRuntimeOrder, layout.panes);
  }
  return spec;
}

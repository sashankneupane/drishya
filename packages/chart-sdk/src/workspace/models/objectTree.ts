import type { ObjectTreeState } from "../../wasm/contracts.js";
import type { WorkspacePaneLayoutState } from "./types.js";

export type ObjectTreeNodeKind = "pane" | "series" | "drawing" | "header" | "layer" | "group";

export interface ObjectTreeNode {
  id: string;
  label: string;
  kind: ObjectTreeNodeKind;
  paneKind?: "price" | "chart" | "indicator" | "custom";
  depth: number;
  visible?: boolean;
  deletable?: boolean;
  locked?: boolean;
}

export type ObjectTreeAction =
  | {
      type: "toggle_visibility";
      kind: "pane" | "series" | "drawing" | "layer" | "group";
      id: string;
      visible: boolean;
    }
  | {
      type: "delete";
      kind: "series" | "drawing" | "layer" | "group";
      id: string;
    };

function canonicalPaneId(id: string): string {
  const trimmed = String(id || "").trim();
  if (!trimmed) return trimmed;
  if (trimmed === "price-pane") return "price";
  if (trimmed.endsWith("-pane")) return trimmed.slice(0, -"-pane".length);
  return trimmed;
}

export function buildObjectTreeNodes(
  state: ObjectTreeState,
  paneLayout?: WorkspacePaneLayoutState
): ObjectTreeNode[] {
  const out: ObjectTreeNode[] = [];

  out.push({
    id: "header:data",
    label: "Data",
    kind: "header",
    depth: 0,
  });

  const panesById = new Map(state.panes.map((pane) => [canonicalPaneId(pane.id), pane] as const));
  const orderedPaneIds = (() => {
    const layoutOrder = (paneLayout?.order ?? []).map((id) => canonicalPaneId(id));
    const base = layoutOrder.filter((id) => panesById.has(id));
    const seen = new Set(base);
    for (const pane of state.panes) {
      const id = canonicalPaneId(pane.id);
      if (!seen.has(id)) base.push(id);
    }
    return base.length ? base : state.panes.map((pane) => canonicalPaneId(pane.id));
  })();
  const paneSpecMap = paneLayout?.panes ?? {};

  const chartRoots = orderedPaneIds.filter((id) => {
    const kind = paneSpecMap[id]?.kind;
    return kind === "price" || kind === "chart" || (!kind && id === "price");
  });

  for (const rootId of chartRoots) {
    const title = paneSpecMap[rootId]?.title ?? (rootId === "price" ? "Main Chart" : rootId.toUpperCase());

    out.push({
      id: `chart-root:${rootId}`,
      label: `Chart: ${title}`,
      kind: "pane",
      paneKind: "custom",
      depth: 1,
      deletable: false,
    });

    const scopedPaneOrder = orderedPaneIds.filter((paneId) => {
      if (paneId === rootId) return true;
      const spec = paneSpecMap[paneId];
      if (spec?.kind !== "indicator") return false;
      return canonicalPaneId(spec.parentChartPaneId ?? "price") === rootId;
    });

    for (const scopedPaneId of scopedPaneOrder) {
      const scopedPane = panesById.get(scopedPaneId);
      if (!scopedPane) continue;
      if (scopedPaneId === rootId) {
        const rootTitle = paneSpecMap[rootId]?.title ?? (rootId === "price" ? "Main Chart" : rootId.toUpperCase());
        out.push({
          id: rootId,
          label: rootId === "price" ? "Price Pane" : `Chart Pane: ${rootTitle}`,
          kind: "pane",
          paneKind: paneSpecMap[rootId]?.kind ?? (rootId === "price" ? "price" : "chart"),
          depth: 2,
          visible: scopedPane.visible,
          deletable: rootId !== "price",
        });
      } else {
        const indicatorTitle = paneSpecMap[scopedPaneId]?.title ?? scopedPaneId.toUpperCase();
        out.push({
          id: scopedPaneId,
          label: `Indicator Pane: ${indicatorTitle}`,
          kind: "pane",
          paneKind: paneSpecMap[scopedPaneId]?.kind ?? "indicator",
          depth: 2,
          visible: scopedPane.visible,
          deletable: true,
        });
      }
      for (const series of state.series) {
        if (series.deleted || canonicalPaneId(series.pane_id) !== scopedPaneId) continue;
        out.push({
          id: series.id,
          label: `Series: ${series.name}`,
          kind: "series",
          depth: 3,
          visible: series.visible,
          deletable: true,
        });
      }
    }
  }

  if (chartRoots.length === 0) {
    for (const paneId of orderedPaneIds) {
      const pane = panesById.get(paneId);
      if (!pane) continue;
      out.push({
        id: paneId,
        label: `Pane: ${paneId}`,
        kind: "pane",
        paneKind: paneSpecMap[paneId]?.kind ?? (paneId === "price" ? "price" : "custom"),
        depth: 1,
        visible: pane.visible,
        deletable: paneId !== "price",
      });
      for (const series of state.series) {
        if (series.deleted || canonicalPaneId(series.pane_id) !== paneId) continue;
        out.push({
          id: series.id,
          label: `Series: ${series.name}`,
          kind: "series",
          depth: 2,
          visible: series.visible,
          deletable: true,
        });
      }
    }
  }

  out.push({
    id: "header:drawings",
    label: "Drawings",
    kind: "header",
    depth: 0,
  });

  const sortedLayers = [...state.layers].sort((a, b) => b.order - a.order);
  for (const layer of sortedLayers) {
    out.push({
      id: layer.id,
      label: layer.name,
      kind: "layer",
      depth: 1,
      visible: layer.visible,
      locked: layer.locked,
      deletable: layer.id !== "default",
    });

    const topGroups = state.groups
      .filter((g) => g.layer_id === layer.id && !g.parent_group_id)
      .sort((a, b) => b.order - a.order);
    for (const group of topGroups) {
      addGroupsRecursively(group, 2, state, out);
    }

    const layerDrawings = state.drawings.filter((d) => d.layer_id === layer.id && !d.group_id);
    for (const drawing of layerDrawings) {
      out.push({
        id: String(drawing.id),
        label: `${drawing.kind} #${drawing.id}`,
        kind: "drawing",
        depth: 2,
        visible: drawing.visible,
        locked: drawing.locked,
        deletable: true,
      });
    }
  }

  return out;
}

function addGroupsRecursively(
  group: {
    id: string;
    name: string;
    visible: boolean;
    locked: boolean;
    order: number;
  },
  depth: number,
  state: ObjectTreeState,
  out: ObjectTreeNode[]
): void {
  out.push({
    id: group.id,
    label: group.name,
    kind: "group",
    depth,
    visible: group.visible,
    locked: group.locked,
    deletable: true,
  });

  const subGroups = state.groups
    .filter((g) => g.parent_group_id === group.id)
    .sort((a, b) => b.order - a.order);
  for (const sub of subGroups) {
    addGroupsRecursively(sub, depth + 1, state, out);
  }

  const groupDrawings = state.drawings.filter((d) => d.group_id === group.id);
  for (const drawing of groupDrawings) {
    out.push({
      id: String(drawing.id),
      label: `${drawing.kind} #${drawing.id}`,
      kind: "drawing",
      depth: depth + 1,
      visible: drawing.visible,
      locked: drawing.locked,
      deletable: true,
    });
  }
}

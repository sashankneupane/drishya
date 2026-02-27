import type { ObjectTreeState } from "../wasm/contracts.js";
import type { WorkspacePaneLayoutState } from "../workspace/types.js";

export type ObjectTreeNodeKind = "pane" | "series" | "drawing" | "header" | "layer" | "group";

export interface ObjectTreeNode {
  id: string;
  label: string;
  kind: ObjectTreeNodeKind;
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

export function buildObjectTreeNodes(
  state: ObjectTreeState,
  paneLayout?: WorkspacePaneLayoutState
): ObjectTreeNode[] {
  const out: ObjectTreeNode[] = [];

  out.push({
    id: "header:data",
    label: "Data",
    kind: "header",
    depth: 0
  });

  const panesById = new Map(state.panes.map((pane) => [pane.id, pane] as const));
  const orderedPaneIds =
    paneLayout?.order?.filter((id) => panesById.has(id)) ?? state.panes.map((pane) => pane.id);
  const paneSpecMap = paneLayout?.panes ?? {};

  const chartRoots = orderedPaneIds.filter((id) => {
    const kind = paneSpecMap[id]?.kind;
    return kind === "price" || kind === "chart" || (!kind && id === "price");
  });
  const indicatorIds = orderedPaneIds.filter((id) => !chartRoots.includes(id));

  for (const rootId of chartRoots) {
    const pane = panesById.get(rootId);
    if (!pane) continue;
    const title = paneSpecMap[rootId]?.title ?? (rootId === "price" ? "Main Chart" : rootId.toUpperCase());
    out.push({
      id: rootId,
      label: `Chart: ${title}`,
      kind: "pane",
      depth: 1,
      visible: pane.visible
    });

    const ownedIndicators = indicatorIds.filter((id) => {
      const spec = paneSpecMap[id];
      if (spec?.parentChartPaneId) return spec.parentChartPaneId === rootId;
      const idx = orderedPaneIds.indexOf(id);
      for (let i = idx - 1; i >= 0; i -= 1) {
        const prevId = orderedPaneIds[i];
        if (chartRoots.includes(prevId)) return prevId === rootId;
      }
      return rootId === "price";
    });

    for (const indicatorId of ownedIndicators) {
      const indicatorPane = panesById.get(indicatorId);
      if (!indicatorPane) continue;
      const indicatorTitle = paneSpecMap[indicatorId]?.title ?? indicatorId.toUpperCase();
      out.push({
        id: indicatorId,
        label: `Indicator Pane: ${indicatorTitle}`,
        kind: "pane",
        depth: 2,
        visible: indicatorPane.visible
      });
      for (const series of state.series) {
        if (series.deleted || series.pane_id !== indicatorId) continue;
        out.push({
          id: series.id,
          label: `Series: ${series.name}`,
          kind: "series",
          depth: 3,
          visible: series.visible,
          deletable: true
        });
      }
    }

    for (const series of state.series) {
      if (series.deleted || series.pane_id !== rootId) continue;
      out.push({
        id: series.id,
        label: `Series: ${series.name}`,
        kind: "series",
        depth: 2,
        visible: series.visible,
        deletable: true
      });
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
        depth: 1,
        visible: pane.visible
      });
      for (const series of state.series) {
        if (series.deleted || series.pane_id !== paneId) continue;
        out.push({
          id: series.id,
          label: `Series: ${series.name}`,
          kind: "series",
          depth: 2,
          visible: series.visible,
          deletable: true
        });
      }
    }
  }

  out.push({
    id: "header:drawings",
    label: "Drawings",
    kind: "header",
    depth: 0
  });

  // Sort layers by order
  const sortedLayers = [...state.layers].sort((a, b) => b.order - a.order);

  for (const layer of sortedLayers) {
    out.push({
      id: layer.id,
      label: layer.name,
      kind: "layer",
      depth: 1,
      visible: layer.visible,
      locked: layer.locked,
      deletable: layer.id !== "default"
    });

    // Groups in this layer with no parent
    const topGroups = state.groups.filter(g => g.layer_id === layer.id && !g.parent_group_id)
      .sort((a, b) => b.order - a.order);

    for (const group of topGroups) {
      addGroupsRecursively(group, 2, state, out);
    }

    // Drawings in this layer with no group
    const layerDrawings = state.drawings.filter(d => d.layer_id === layer.id && !d.group_id);
    for (const drawing of layerDrawings) {
      out.push({
        id: String(drawing.id),
        label: `${drawing.kind} #${drawing.id}`,
        kind: "drawing",
        depth: 2,
        visible: drawing.visible,
        locked: drawing.locked,
        deletable: true
      });
    }
  }

  return out;
}

function addGroupsRecursively(group: any, depth: number, state: ObjectTreeState, out: ObjectTreeNode[]) {
  out.push({
    id: group.id,
    label: group.name,
    kind: "group",
    depth: depth,
    visible: group.visible,
    locked: group.locked,
    deletable: true
  });

  // Subgroups
  const subGroups = state.groups.filter(g => g.parent_group_id === group.id)
    .sort((a, b) => b.order - a.order);
  for (const sub of subGroups) {
    addGroupsRecursively(sub, depth + 1, state, out);
  }

  // Drawings in this group
  const groupDrawings = state.drawings.filter(d => d.group_id === group.id);
  for (const drawing of groupDrawings) {
    out.push({
      id: String(drawing.id),
      label: `${drawing.kind} #${drawing.id}`,
      kind: "drawing",
      depth: depth + 1,
      visible: drawing.visible,
      locked: drawing.locked,
      deletable: true
    });
  }
}

import type { ObjectTreeState } from "../wasm/contracts.js";

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

export function buildObjectTreeNodes(state: ObjectTreeState): ObjectTreeNode[] {
  const out: ObjectTreeNode[] = [];

  out.push({
    id: "header:data",
    label: "Data",
    kind: "header",
    depth: 0
  });

  for (const pane of state.panes) {
    out.push({
      id: pane.id,
      label: `Pane: ${pane.id}`,
      kind: "pane",
      depth: 1,
      visible: pane.visible
    });
  }

  for (const series of state.series) {
    if (series.deleted) continue;
    out.push({
      id: series.id,
      label: `Series: ${series.name} [${series.pane_id}]`,
      kind: "series",
      depth: 1,
      visible: series.visible,
      deletable: true
    });
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


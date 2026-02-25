import type { ObjectTreeState } from "../wasm/contracts.js";

export type ObjectTreeNodeKind = "pane" | "series" | "drawing" | "header";

export interface ObjectTreeNode {
  id: string;
  label: string;
  kind: ObjectTreeNodeKind;
  depth: number;
  visible?: boolean;
  deletable?: boolean;
}

export type ObjectTreeAction =
  | {
      type: "toggle_visibility";
      kind: "pane" | "series" | "drawing";
      id: string;
      visible: boolean;
    }
  | {
      type: "delete";
      kind: "series" | "drawing";
      id: string;
      visible: boolean;
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

  for (const drawing of state.drawings) {
    out.push({
      id: String(drawing.id),
      label: `${drawing.kind} #${drawing.id}`,
      kind: "drawing",
      depth: 1,
      visible: drawing.visible,
      deletable: true
    });
  }

  return out;
}


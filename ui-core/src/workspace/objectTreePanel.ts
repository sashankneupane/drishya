import {
  buildObjectTreeNodes,
  type ObjectTreeAction,
  type ObjectTreeNode,
} from "../chrome/objectTree.js";
import type { DrishyaChartClient } from "../wasm/client.js";
import { makeSvgIcon } from "./icons.js";

type ActionableNodeKind = "pane" | "series" | "drawing";
type ActionableObjectTreeNode = ObjectTreeNode & { kind: ActionableNodeKind };

export interface ObjectTreePanelHandle {
  root: HTMLElement;
  refresh: () => void;
}

interface CreateObjectTreePanelOptions {
  chart: DrishyaChartClient;
  onMutate: () => void;
}

export function createObjectTreePanel(options: CreateObjectTreePanelOptions): ObjectTreePanelHandle {
  const root = document.createElement("aside");
  root.className = "drishya-tree";
  root.setAttribute("aria-label", "Object tree");

  const header = document.createElement("div");
  header.className = "drishya-tree-header";
  header.textContent = "Object Tree";
  root.appendChild(header);

  const body = document.createElement("div");
  body.className = "drishya-tree-body";
  root.appendChild(body);

  let signature = "";

  function refresh(): void {
    const state = options.chart.objectTreeState();
    const nextSignature = JSON.stringify(state);
    if (nextSignature === signature) return;
    signature = nextSignature;

    const nodes = buildObjectTreeNodes(state);
    body.innerHTML = "";
    for (const node of nodes) {
      body.appendChild(renderNode(node));
    }
  }

  function renderNode(node: ObjectTreeNode): HTMLElement {
    const row = document.createElement("div");
    row.className = node.kind === "header" ? "drishya-tree-row is-header" : "drishya-tree-row";
    row.style.paddingLeft = `${8 + node.depth * 12}px`;

    const label = document.createElement("span");
    label.className = "drishya-tree-label";
    label.textContent = node.label;
    row.appendChild(label);

    if (!isActionableObjectTreeNode(node)) {
      return row;
    }

    const actionableNode = node;

    const actions = document.createElement("div");
    actions.className = "drishya-tree-actions";

    if (typeof actionableNode.visible === "boolean") {
      const toggleBtn = document.createElement("button");
      toggleBtn.type = "button";
      toggleBtn.className = "drishya-tree-btn";
      toggleBtn.title = actionableNode.visible ? "Hide" : "Show";
      toggleBtn.disabled = actionableNode.kind === "pane" && actionableNode.id === "price";
      toggleBtn.appendChild(
        makeSvgIcon(actionableNode.visible ? "eye" : "eye-off", "drishya-icon-xs"),
      );
      toggleBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        const action: ObjectTreeAction = {
          type: "toggle_visibility",
          kind: actionableNode.kind,
          id: actionableNode.id,
          visible: !actionableNode.visible,
        };
        options.chart.applyObjectTreeAction(action);
        options.onMutate();
      });
      actions.appendChild(toggleBtn);
    }

    if (actionableNode.deletable) {
      const deleteKind =
        actionableNode.kind === "series" || actionableNode.kind === "drawing"
          ? actionableNode.kind
          : null;
      if (!deleteKind) {
        row.appendChild(actions);
        return row;
      }

      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "drishya-tree-btn danger";
      deleteBtn.title = "Delete";
      deleteBtn.appendChild(makeSvgIcon("x", "drishya-icon-xs"));
      deleteBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        const action: ObjectTreeAction = {
          type: "delete",
          kind: deleteKind,
          id: actionableNode.id,
          visible: false,
        };
        options.chart.applyObjectTreeAction(action);
        options.onMutate();
      });
      actions.appendChild(deleteBtn);
    }

    row.appendChild(actions);
    return row;
  }

  return {
    root,
    refresh
  };
}

function isActionableObjectTreeNode(node: ObjectTreeNode): node is ActionableObjectTreeNode {
  return node.kind === "pane" || node.kind === "series" || node.kind === "drawing";
}


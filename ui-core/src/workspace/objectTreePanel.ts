import { makeSvgIcon } from "./icons.js";
import type { DrishyaChartClient } from "../wasm/client.js";
import type { WorkspaceController } from "./WorkspaceController.js";
import { buildObjectTreeNodes } from "../chrome/objectTree.js";

interface ObjectTreePanelOptions {
  chart: DrishyaChartClient;
  controller: WorkspaceController;
  onMutate?: () => void;
}

export interface ObjectTreePanelHandle {
  root: HTMLElement;
  refresh: () => void;
  destroy: () => void;
}

export function createObjectTreePanel(options: ObjectTreePanelOptions): ObjectTreePanelHandle {
  const { chart, controller } = options;
  const root = document.createElement("div");
  root.className = "w-object-tree h-full bg-workspace-bg border-l border-workspace-border flex flex-col z-20 shrink-0 select-none overflow-hidden";
  root.style.display = "none";

  const header = document.createElement("div");
  header.className = "h-top-strip flex items-center justify-between px-3 border-b border-workspace-border shrink-0 bg-zinc-950/20";

  const title = document.createElement("span");
  title.className = "text-[10px] font-bold text-zinc-500 uppercase tracking-wider";
  title.textContent = "Objects";

  const close = document.createElement("button");
  close.className = "h-5 w-5 flex items-center justify-center text-zinc-600 hover:text-white transition-colors cursor-pointer rounded hover:bg-zinc-800";
  close.appendChild(makeSvgIcon("close", "h-3.5 w-3.5"));
  close.onclick = () => controller.setObjectTreeOpen(false);

  header.append(title, close);
  root.appendChild(header);

  const container = document.createElement("div");
  container.className = "flex-1 overflow-y-auto no-scrollbar py-1";
  root.appendChild(container);

  const refresh = () => {
    container.innerHTML = "";
    const state = chart.objectTreeState();
    const nodes = buildObjectTreeNodes(state);

    if (nodes.length === 0) {
      const empty = document.createElement("div");
      empty.className = "p-8 text-center text-[10px] text-zinc-700 italic";
      empty.textContent = "No objects active";
      container.appendChild(empty);
      return;
    }

    nodes.forEach((node) => {
      if (node.kind === "header") {
        const headerRow = document.createElement("div");
        headerRow.className = "h-6 flex items-center px-3 text-[9px] font-bold text-zinc-600 uppercase tracking-widest mt-2 mb-1";
        headerRow.textContent = node.label;
        container.appendChild(headerRow);
        return;
      }

      const row = document.createElement("div");
      row.className = "group h-8 flex items-center px-3 hover:bg-zinc-900/50 transition-colors cursor-default";
      row.style.paddingLeft = `${node.depth * 12 + 12}px`;

      const label = document.createElement("span");
      const isVisible = node.visible !== false;
      label.className = `flex-1 truncate text-[11px] ${isVisible ? 'text-zinc-500' : 'text-zinc-700 italic line-through'}`;
      label.textContent = node.label;

      const actions = document.createElement("div");
      actions.className = "flex items-center gap-1 opacity-20 group-hover:opacity-100 transition-opacity";

      // Visibility Toggle
      if (node.visible !== undefined) {
        const visibility = document.createElement("button");
        visibility.className = `p-1 cursor-pointer transition-colors border-none outline-none bg-transparent ${node.visible ? 'text-zinc-600 hover:text-zinc-200' : 'text-zinc-400'}`;
        visibility.appendChild(makeSvgIcon(node.visible ? "eye" : "eye-off", "h-3.5 w-3.5"));
        visibility.title = node.visible ? "Hide" : "Show";
        visibility.onclick = () => {
          chart.applyObjectTreeAction({
            type: "toggle_visibility",
            kind: node.kind as any,
            id: node.id,
            visible: !node.visible
          });
          refresh();
          options.onMutate?.();
        };
        actions.appendChild(visibility);
      }

      // Lock Toggle (Layers/Groups/Drawings)
      if (node.locked !== undefined) {
        const lock = document.createElement("button");
        lock.className = `p-1 cursor-pointer transition-colors border-none outline-none bg-transparent ${node.locked ? 'text-amber-600 hover:text-amber-400' : 'text-zinc-700 hover:text-zinc-300'}`;
        lock.appendChild(makeSvgIcon(node.locked ? "lock" : "unlock", "h-3.5 w-3.5")); // Assuming 'unlock' icon exists
        lock.title = node.locked ? "Unlock" : "Lock";
        lock.onclick = () => {
          if (node.kind === "drawing") {
            chart.setDrawingConfig(Number(node.id), { locked: !node.locked });
          } else if (node.kind === "layer") {
            chart.updateLayer(node.id, { locked: !node.locked });
          } else if (node.kind === "group") {
            chart.updateGroup(node.id, { locked: !node.locked });
          }
          refresh();
          options.onMutate?.();
        };
        actions.appendChild(lock);
      }

      // Delete (Everything except Pane and Default Layer)
      if (node.deletable) {
        const del = document.createElement("button");
        del.className = "p-1 text-zinc-700 hover:text-red-500 transition-colors cursor-pointer border-none outline-none bg-transparent";
        del.appendChild(makeSvgIcon("delete", "h-3.5 w-3.5"));
        del.title = "Delete";
        del.onclick = () => {
          chart.applyObjectTreeAction({
            type: "delete",
            kind: node.kind as any,
            id: node.id
          });
          refresh();
          options.onMutate?.();
        };
        actions.appendChild(del);
      }

      row.append(label, actions);
      container.appendChild(row);
    });
  };

  const unsubscribe = controller.subscribe((state) => {
    root.style.display = state.isObjectTreeOpen ? "flex" : "none";
    if (state.isObjectTreeOpen) refresh();
  });

  return {
    root,
    refresh,
    destroy: () => unsubscribe()
  };
}

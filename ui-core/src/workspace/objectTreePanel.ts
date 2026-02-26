import { makeSvgIcon } from "./icons.js";
import type { DrishyaChartClient } from "../wasm/client.js";
import type { WorkspaceController } from "./WorkspaceController.js";

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

    // Categorize and filter
    const paneItems = state.panes.map(p => ({ id: p.id, label: `Pane: ${p.id}`, visible: p.visible, kind: 'pane' as const }));
    const seriesItems = state.series
      .filter(s => !s.deleted)
      .map(s => ({ id: s.id, label: s.name || s.id, visible: s.visible, kind: 'series' as const }));
    const drawingItems = state.drawings
      .map(d => ({ id: String(d.id), label: `${d.kind} #${d.id}`, visible: d.visible, kind: 'drawing' as const }));

    const allItems = [...paneItems, ...seriesItems, ...drawingItems];

    if (allItems.length === 0) {
      const empty = document.createElement("div");
      empty.className = "p-8 text-center text-[10px] text-zinc-700 italic";
      empty.textContent = "No objects active";
      container.appendChild(empty);
      return;
    }

    allItems.forEach((item) => {
      const row = document.createElement("div");
      row.className = "group h-8 flex items-center px-3 hover:bg-zinc-900/50 transition-colors cursor-default";

      const label = document.createElement("span");
      label.className = `flex-1 truncate text-[11px] ${item.visible ? 'text-zinc-500' : 'text-zinc-700 italic line-through'}`;
      label.textContent = item.label;

      const actions = document.createElement("div");
      actions.className = "flex items-center gap-1 opacity-20 group-hover:opacity-100 transition-opacity";

      const visibility = document.createElement("button");
      visibility.className = `p-1 cursor-pointer transition-colors border-none outline-none bg-transparent ${item.visible ? 'text-zinc-600 hover:text-zinc-200' : 'text-zinc-400'}`;
      visibility.appendChild(makeSvgIcon(item.visible ? "eye" : "eye-off", "h-3.5 w-3.5"));
      visibility.title = item.visible ? "Hide" : "Show";
      visibility.onclick = () => {
        chart.applyObjectTreeAction({
          type: "toggle_visibility",
          kind: item.kind,
          id: item.id,
          visible: !item.visible
        });
        refresh();
        options.onMutate?.();
      };

      actions.appendChild(visibility);

      if (item.kind !== 'pane') {
        const del = document.createElement("button");
        del.className = "p-1 text-zinc-700 hover:text-red-500 transition-colors cursor-pointer border-none outline-none bg-transparent";
        del.appendChild(makeSvgIcon("delete", "h-3.5 w-3.5"));
        del.title = "Delete";
        del.onclick = () => {
          chart.applyObjectTreeAction({
            type: "delete",
            kind: item.kind,
            id: item.id,
            visible: false
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

import { makeSvgIcon } from "./icons.js";
import { createSymbolSearchModal } from "./SymbolSearchModal.js";
import type { DrishyaChartClient } from "../wasm/client.js";
import type { WorkspaceController } from "./WorkspaceController.js";
import { buildObjectTreeNodes } from "../chrome/objectTree.js";
import { canonicalRuntimePaneId } from "./paneSpec.js";

interface ObjectTreePanelOptions {
  getChart: () => DrishyaChartClient | null;
  controller: WorkspaceController;
  symbols?: readonly string[];
  onPaneSourceChange?: (paneId: string, symbol: string) => void | Promise<void>;
  onIndicatorConfig?: (target: { paneId?: string; seriesId?: string; indicatorId?: string }) => void;
  onDrawingConfig?: (target: { drawingId: number }) => void;
  onToggleVisibility?: (target: { kind: "pane" | "series" | "drawing" | "layer" | "group"; id: string; visible: boolean }) => void;
  onToggleLock?: (target: { kind: "drawing" | "layer" | "group"; id: string; locked: boolean }) => void;
  onDelete?: (target: { kind: "pane" | "series" | "drawing" | "layer" | "group"; id: string; paneKind?: string }) => void;
  onMovePane?: (target: { paneId: string; direction: "up" | "down" }) => void;
  onMutate?: () => void;
  getIsOpen?: () => boolean;
  onSetOpen?: (open: boolean) => void;
}

export interface ObjectTreePanelHandle {
  root: HTMLElement;
  refresh: () => void;
  destroy: () => void;
}

export function createObjectTreePanel(options: ObjectTreePanelOptions): ObjectTreePanelHandle {
  const { controller } = options;
  const root = document.createElement("div");
  root.className = "h-full bg-zinc-950/90 border-l border-zinc-800/80 flex flex-col z-20 shrink-0 select-none overflow-hidden";
  root.style.display = "none";

  const header = document.createElement("div");
  header.className = "h-9 flex items-center justify-between px-2 border-b border-zinc-800/80 shrink-0 bg-zinc-950/95";

  const title = document.createElement("span");
  title.className = "text-[10px] font-semibold text-zinc-300 uppercase tracking-[0.12em]";
  title.textContent = "Objects";

  const close = document.createElement("button");
  close.className = "h-7 w-7 inline-flex items-center justify-center rounded-none text-zinc-500 hover:text-zinc-100 hover:bg-zinc-900/50 transition-colors cursor-pointer border-none bg-transparent";
  close.appendChild(makeSvgIcon("close", "h-3.5 w-3.5"));
  close.onclick = () => {
    root.style.display = "none";
    if (options.onSetOpen) {
      options.onSetOpen(false);
    } else {
      controller.setObjectTreeOpen(false);
    }
  };

  header.append(title, close);
  root.appendChild(header);

  const container = document.createElement("div");
  container.className = "flex-1 overflow-y-auto no-scrollbar py-1.5";
  root.appendChild(container);

  const refresh = () => {
    container.innerHTML = "";
    const chart = options.getChart();
    if (!chart) {
      return;
    }
    const runtimePaneOrder = chart.paneLayouts().map((pane) => canonicalRuntimePaneId(pane.id));
    const state = chart.objectTreeState();
    const paneLayout = controller.getState().paneLayout;
    const runtimePaneSet = new Set(state.panes.map((pane) => canonicalRuntimePaneId(pane.id)));
    const preferredOrder = (runtimePaneOrder.length
      ? runtimePaneOrder
      : paneLayout.order.map((id) => canonicalRuntimePaneId(id))).filter(
      (id, idx, arr) => runtimePaneSet.has(id) && arr.indexOf(id) === idx
    );
    const scopedOrder = [...preferredOrder];
    for (const paneId of paneLayout.order.map((id) => canonicalRuntimePaneId(id))) {
      if (!runtimePaneSet.has(paneId)) continue;
      if (!scopedOrder.includes(paneId)) scopedOrder.push(paneId);
    }
    const scopedPaneLayout = {
      ...paneLayout,
      order: scopedOrder,
    };
    const nodes = buildObjectTreeNodes(state, scopedPaneLayout);
    const orderedPaneIds = scopedOrder;
    const paneKindById = new Map<string, string>();
    for (const [paneId, paneSpec] of Object.entries(paneLayout.panes ?? {})) {
      paneKindById.set(paneId, paneSpec.kind);
    }
    for (const pane of state.panes) {
      const canonicalPaneId = canonicalRuntimePaneId(pane.id);
      if (!paneKindById.has(canonicalPaneId)) {
        paneKindById.set(canonicalPaneId, canonicalPaneId === "price" ? "price" : "custom");
      }
    }
    const seriesById = new Map(state.series.map((item) => [item.id, item] as const));
    const indicatorSeriesIds = new Set<string>();
    const readout = chart.readoutSnapshot();
    for (const item of readout?.indicators ?? []) {
      indicatorSeriesIds.add(item.id);
    }

    if (nodes.length === 0) {
      const empty = document.createElement("div");
      empty.className = "p-6 text-center text-[10px] text-zinc-600 italic";
      empty.textContent = "No objects active";
      container.appendChild(empty);
      return;
    }

    nodes.forEach((node) => {
      if (node.kind === "header") {
        const headerRow = document.createElement("div");
        headerRow.className = "h-6 flex items-center px-3 text-[9px] font-semibold text-zinc-600 uppercase tracking-[0.14em] mt-1.5 mb-0.5";
        headerRow.textContent = node.label;
        container.appendChild(headerRow);
        return;
      }

      const row = document.createElement("div");
      row.className = "group h-8 flex items-center px-3 hover:bg-zinc-900/55 transition-colors cursor-default";
      row.style.paddingLeft = `${node.depth * 12 + 12}px`;

      const label = document.createElement("span");
      const isVisible = node.visible !== false;
      label.className = `flex-1 truncate text-[11px] ${isVisible ? 'text-zinc-500' : 'text-zinc-700 italic line-through'}`;
      label.textContent = node.label;

      const actions = document.createElement("div");
      actions.className = "flex items-center gap-0.5 opacity-25 group-hover:opacity-100 transition-opacity";
      const isIndicatorPane = node.kind === "pane" && node.paneKind === "indicator";
      const canMovePane =
        node.kind === "pane" &&
        (node.paneKind === "indicator" || node.paneKind === "price" || node.paneKind === "chart");
      const isIndicatorSeries = node.kind === "series" && (() => {
        const series = seriesById.get(node.id);
        if (!series) return false;
        if (paneKindById.get(canonicalRuntimePaneId(series.pane_id)) === "indicator") return true;
        return indicatorSeriesIds.has(node.id);
      })();

      if (node.kind === "pane" && (node.paneKind === "chart" || node.paneKind === "price")) {
        const sourceBtn = document.createElement("button");
        sourceBtn.className = "h-6 w-6 inline-flex items-center justify-center text-zinc-600 hover:text-zinc-100 hover:bg-zinc-900/50 transition-colors cursor-pointer border-none outline-none bg-transparent rounded-none";
        sourceBtn.title = "Change source";
        sourceBtn.appendChild(makeSvgIcon("search", "h-3.5 w-3.5"));
        sourceBtn.onclick = () => {
          controller.setActiveChartPane(node.id);
          const symbols = options.symbols ?? [];
          if (!symbols.length) return;
          createSymbolSearchModal({
            symbols,
            onSelect: async (symbol) => {
              await options.onPaneSourceChange?.(node.id, symbol);
            },
            onClose: () => { }
          });
        };
        actions.appendChild(sourceBtn);
      }

      if (isIndicatorPane || isIndicatorSeries) {
        const config = document.createElement("button");
        config.className = "h-6 w-6 inline-flex items-center justify-center text-zinc-600 hover:text-zinc-100 hover:bg-zinc-900/50 transition-colors cursor-pointer border-none outline-none bg-transparent rounded-none";
        config.appendChild(makeSvgIcon("settings", "h-3.5 w-3.5"));
        config.title = "Indicator settings";
        config.onclick = () => {
          const indicatorId = node.kind === "series" ? node.id.split(":")[0] : undefined;
          options.onIndicatorConfig?.({
            paneId: node.kind === "pane" ? node.id : undefined,
            seriesId: node.kind === "series" ? node.id : undefined,
            indicatorId
          });
        };
        actions.appendChild(config);
      }

      if (canMovePane) {
        const canonicalPaneId = canonicalRuntimePaneId(node.id);
        const paneIndex = orderedPaneIds.indexOf(canonicalPaneId);
        const canMoveUp = paneIndex > 0;
        const canMoveDown = paneIndex >= 0 && paneIndex < orderedPaneIds.length - 1;
        const mkPaneMoveBtn = (icon: "chevron-up" | "chevron-down", title: string, direction: "up" | "down") => {
          const btn = document.createElement("button");
          btn.className = "h-6 w-6 inline-flex items-center justify-center text-zinc-600 hover:text-zinc-100 hover:bg-zinc-900/50 transition-colors cursor-pointer border-none outline-none bg-transparent rounded-none";
          btn.appendChild(makeSvgIcon(icon, "h-3.5 w-3.5"));
          btn.title = title;
          btn.onclick = () => {
            options.onMovePane?.({ paneId: node.id, direction });
            refresh();
            options.onMutate?.();
          };
          return btn;
        };
        if (canMoveUp) actions.append(mkPaneMoveBtn("chevron-up", "Move up", "up"));
        if (canMoveDown) actions.append(mkPaneMoveBtn("chevron-down", "Move down", "down"));
      }

      if (node.kind === "drawing") {
        const config = document.createElement("button");
        config.className = "h-6 w-6 inline-flex items-center justify-center text-zinc-600 hover:text-zinc-100 hover:bg-zinc-900/50 transition-colors cursor-pointer border-none outline-none bg-transparent rounded-none";
        config.appendChild(makeSvgIcon("settings", "h-3.5 w-3.5"));
        config.title = "Drawing settings";
        config.onclick = () => {
          const drawingId = Number(node.id);
          if (!Number.isFinite(drawingId)) return;
          options.onDrawingConfig?.({ drawingId });
        };
        actions.appendChild(config);
      }

      // Visibility Toggle
      if (node.visible !== undefined) {
        const visibility = document.createElement("button");
        visibility.className = `h-6 w-6 inline-flex items-center justify-center cursor-pointer transition-colors border-none outline-none bg-transparent rounded-none ${node.visible ? 'text-zinc-600 hover:text-zinc-100 hover:bg-zinc-900/50' : 'text-zinc-400 hover:bg-zinc-900/40'}`;
        visibility.appendChild(makeSvgIcon(node.visible ? "eye" : "eye-off", "h-3.5 w-3.5"));
        visibility.title = node.visible ? "Hide" : "Show";
        visibility.onclick = () => {
          options.onToggleVisibility?.({
            kind: node.kind as "pane" | "series" | "drawing" | "layer" | "group",
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
        lock.className = `h-6 w-6 inline-flex items-center justify-center cursor-pointer transition-colors border-none outline-none bg-transparent rounded-none ${node.locked ? 'text-amber-400 hover:text-amber-200 hover:bg-zinc-900/50' : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900/50'}`;
        lock.appendChild(makeSvgIcon(node.locked ? "lock" : "unlock", "h-3.5 w-3.5")); // Assuming 'unlock' icon exists
        lock.title = node.locked ? "Unlock" : "Lock";
        lock.onclick = () => {
          if (node.kind === "drawing" || node.kind === "layer" || node.kind === "group") {
            options.onToggleLock?.({
              kind: node.kind,
              id: node.id,
              locked: !node.locked
            });
          }
          refresh();
          options.onMutate?.();
        };
        actions.appendChild(lock);
      }

      // Delete (Everything except Pane and Default Layer)
      if (node.deletable) {
        const del = document.createElement("button");
        del.className = "h-6 w-6 inline-flex items-center justify-center text-zinc-600 hover:text-red-400 hover:bg-zinc-900/50 transition-colors cursor-pointer border-none outline-none bg-transparent rounded-none";
        del.appendChild(makeSvgIcon("delete", "h-3.5 w-3.5"));
        del.title = "Delete";
        del.onclick = () => {
          options.onDelete?.({
            kind: node.kind as "pane" | "series" | "drawing" | "layer" | "group",
            id: node.id,
            paneKind: node.paneKind
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
    const open = options.getIsOpen ? options.getIsOpen() : state.isObjectTreeOpen;
    root.style.display = open ? "flex" : "none";
    if (open) refresh();
  });

  return {
    root,
    refresh,
    destroy: () => unsubscribe()
  };
}

import { makeSvgIcon } from "./icons.js";
import type { WorkspaceController } from "../controllers/WorkspaceController.js";
import type { WorkspaceToolDef } from "../models/types.js";
import type { DrawingToolId } from "../models/drawingTool.js";

interface LeftStripOptions {
  tools: readonly WorkspaceToolDef[];
  controller: WorkspaceController;
  drawingToolsEnabled?: boolean;
  onClear?: () => void;
  onAddChartTile?: () => void;
  onOpenSettings?: () => void;
}

export interface LeftStripHandle {
  root: HTMLElement;
  destroy: () => void;
}

const BTN_BASE = "w-10 h-10 flex items-center justify-center transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed border-none outline-none bg-transparent";
const ICON_SIZE = "h-4 w-4";

// Visibility classes: subtle when idle, high visibility when active/hover
const BTN_IDLE = "text-zinc-500 hover:text-zinc-100 hover:bg-zinc-900/50";
const BTN_ACTIVE = "text-white bg-zinc-700/70 border-l-2 border-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.15)]";

export function createLeftStrip(options: LeftStripOptions): LeftStripHandle {
  const { controller } = options;
  const root = document.createElement("div");
  root.className = "w-10 flex flex-col bg-workspace-bg border-r border-workspace-border h-full shrink-0 z-30 overflow-y-auto no-scrollbar";

  const toolButtons: Map<string, HTMLElement> = new Map();
  const activePopups: HTMLElement[] = [];

  const closeAllPopups = () => {
    activePopups.forEach(p => p.remove());
    activePopups.length = 0;
  };
  const renderActiveState = (state: ReturnType<WorkspaceController["getState"]>) => {
    const activeTool = state.activeTool;
    options.tools.forEach(tool => {
      const btn = toolButtons.get(tool.id);
      if (!btn) return;
      const isActive =
        tool.id === activeTool ||
        (tool.children?.some(c => c.id === activeTool)) ||
        (tool.id === "cursor-group" && activeTool === "select");
      if (isActive) {
        btn.className = `${BTN_BASE} ${BTN_ACTIVE} relative group`;
      } else {
        btn.className = `${BTN_BASE} ${BTN_IDLE} relative group`;
      }
      if (tool.id === "theme") {
        const container = btn.querySelector("div");
        if (container) container.replaceChildren(makeSvgIcon(state.theme === "dark" ? "theme" : "theme-off", ICON_SIZE));
      }
    });
  };

  options.tools.forEach((tool) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `${BTN_BASE} ${BTN_IDLE} relative group`;

    // Default icon
    let currentIconName = tool.id;
    if (tool.children && tool.children.length > 0) {
      currentIconName = tool.children[0].id; // Show first child by default or last used
    }

    const iconContainer = document.createElement("div");
    iconContainer.replaceChildren(makeSvgIcon(currentIconName, ICON_SIZE));
    btn.appendChild(iconContainer);

    // Indicator for groups
    if (tool.children) {
      const arrow = document.createElement("div");
      arrow.className = "absolute bottom-1 right-1 w-0 h-0 border-t-2 border-l-2 border-transparent border-t-zinc-700 border-l-zinc-700 rotate-45 group-hover:border-zinc-500";
      btn.appendChild(arrow);
    }

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (tool.children) {
        if (activePopups.some(p => p.dataset.owner === tool.id)) {
          closeAllPopups();
        } else {
          showGroupPopup(tool, btn);
        }
      } else {
        closeAllPopups();
        if (tool.id === "clear") options.onClear?.();
        else if (tool.id === "theme") controller.toggleTheme();
        else controller.setActiveTool(tool.id as DrawingToolId, { force: true });
      }
    });

    root.appendChild(btn);
    toolButtons.set(tool.id, btn);
  });

  const utilityRail = document.createElement("div");
  utilityRail.className = "mt-auto flex flex-col border-t border-workspace-border";

  const makeUtilityButton = (icon: string, label: string, onClick: () => void) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `${BTN_BASE} ${BTN_IDLE} relative group`;
    btn.title = label;
    btn.appendChild(makeSvgIcon(icon, ICON_SIZE));
    const hoverLabel = document.createElement("span");
    hoverLabel.className =
      "pointer-events-none absolute left-full ml-2 px-2 py-1 rounded bg-zinc-950 border border-workspace-border text-[10px] text-zinc-200 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity";
    hoverLabel.textContent = label;
    btn.appendChild(hoverLabel);
    btn.onclick = (event) => {
      event.stopPropagation();
      closeAllPopups();
      onClick();
    };
    return btn;
  };

  const addTileBtn = makeUtilityButton("plus", "Add Chart Tile", () => options.onAddChartTile?.());
  addTileBtn.draggable = true;
  addTileBtn.ondragstart = (event) => {
    event.dataTransfer?.setData("application/x-drishya-add-chart-tile", "1");
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "copyMove";
  };
  utilityRail.appendChild(addTileBtn);

  const settingsBtn = makeUtilityButton("settings", "Settings", () => options.onOpenSettings?.());
  utilityRail.appendChild(settingsBtn);
  root.appendChild(utilityRail);

  function showGroupPopup(tool: WorkspaceToolDef, ownerBtn: HTMLElement) {
    closeAllPopups();
    const popup = document.createElement("div");
    popup.dataset.owner = tool.id;
    popup.className = "fixed left-10 bg-zinc-950 border border-workspace-border py-1 flex flex-col shadow-2xl z-50 animate-in fade-in slide-in-from-left-1 duration-150 min-w-[220px]";

    const rect = ownerBtn.getBoundingClientRect();
    popup.style.top = `${rect.top}px`;

    tool.children?.forEach(child => {
      const cbtn = document.createElement("button");
      cbtn.className = "h-9 flex items-center px-3 gap-3 text-zinc-500 hover:text-white hover:bg-zinc-900 transition-colors border-none outline-none bg-transparent cursor-pointer group w-full";

      const icon = makeSvgIcon(child.id, ICON_SIZE);

      const label = document.createElement("span");
      label.className = "flex-1 text-left text-[12px] font-medium";
      label.textContent = child.title;

      const hotkey = document.createElement("span");
      hotkey.className = "text-[10px] text-zinc-700 font-mono uppercase group-hover:text-zinc-500 transition-colors";
      hotkey.textContent = child.hotkey || "";

      cbtn.append(icon, label, hotkey);
      cbtn.onclick = () => {
        if (child.id === "crosshair" || child.id === "dot" || child.id === "normal") {
          controller.setCursorMode(child.id as any);
          if (child.id === "normal") {
            controller.setActiveTool("select", { force: true });
          }
        } else {
          controller.setActiveTool(child.id as DrawingToolId, { force: true });
        }
        // Update owner icon
        const iconContainer = ownerBtn.querySelector("div");
        if (iconContainer) iconContainer.replaceChildren(makeSvgIcon(child.id, ICON_SIZE));
        closeAllPopups();
      };
      popup.appendChild(cbtn);
    });

    document.body.appendChild(popup);
    activePopups.push(popup);
  }

  const unsubscribe = controller.subscribe((state) => renderActiveState(state));
  renderActiveState(controller.getState());

  // Global click to close popups
  const globalClick = () => closeAllPopups();
  window.addEventListener("click", globalClick);

  return {
    root,
    destroy: () => {
      unsubscribe();
      window.removeEventListener("click", globalClick);
      closeAllPopups();
    }
  };
}

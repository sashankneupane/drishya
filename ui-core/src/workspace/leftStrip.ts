import type { DrawingToolId } from "../toolbar/model";
import { makeSvgIcon } from "./icons";
import type { WorkspaceToolDef } from "./types";

interface CreateLeftStripOptions {
  tools: readonly WorkspaceToolDef[];
  activeTool: DrawingToolId;
  drawingToolsEnabled: boolean;
  onSelectTool: (toolId: DrawingToolId) => void;
  onClear: () => void;
  onToggleTheme: () => void;
}

export interface LeftStripHandle {
  root: HTMLElement;
  setActiveTool: (toolId: DrawingToolId) => void;
}

export function createLeftStrip(options: CreateLeftStripOptions): LeftStripHandle {
  const root = document.createElement("aside");
  root.className = "drishya-strip";
  root.setAttribute("aria-label", "Chart controls");

  const brand = document.createElement("div");
  brand.className = "drishya-strip-brand";
  brand.textContent = "DR";
  root.appendChild(brand);

  const toolList = document.createElement("div");
  toolList.className = "drishya-strip-tools";
  root.appendChild(toolList);

  const divider = document.createElement("div");
  divider.className = "drishya-strip-divider";
  root.appendChild(divider);

  const actionList = document.createElement("div");
  actionList.className = "drishya-strip-actions";
  root.appendChild(actionList);

  const toolButtons = new Map<DrawingToolId, HTMLButtonElement>();
  let activeTool = options.activeTool;

  for (const tool of options.tools) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "drishya-strip-btn";
    button.dataset.active = "false";
    button.title = `${tool.title} (${tool.hotkey})`;
    button.disabled = !options.drawingToolsEnabled;
    button.appendChild(makeSvgIcon(tool.id));
    button.addEventListener("click", () => options.onSelectTool(tool.id));
    toolList.appendChild(button);
    toolButtons.set(tool.id, button);
  }

  const clearBtn = document.createElement("button");
  clearBtn.type = "button";
  clearBtn.className = "drishya-strip-btn";
  clearBtn.title = "Clear drawings (C)";
  clearBtn.appendChild(makeSvgIcon("trash"));
  clearBtn.addEventListener("click", options.onClear);
  actionList.appendChild(clearBtn);

  const themeBtn = document.createElement("button");
  themeBtn.type = "button";
  themeBtn.className = "drishya-strip-btn";
  themeBtn.title = "Toggle theme (T)";
  themeBtn.appendChild(makeSvgIcon("theme"));
  themeBtn.addEventListener("click", options.onToggleTheme);
  actionList.appendChild(themeBtn);

  function setActiveTool(toolId: DrawingToolId): void {
    activeTool = toolId;
    for (const [id, button] of toolButtons.entries()) {
      const active = id === activeTool;
      button.dataset.active = active ? "true" : "false";
      button.setAttribute("aria-pressed", active ? "true" : "false");
    }
  }

  setActiveTool(options.activeTool);

  return {
    root,
    setActiveTool
  };
}


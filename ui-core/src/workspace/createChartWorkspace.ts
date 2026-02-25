import type { DrawingToolId } from "../toolbar/model";
import { DrishyaChartClient } from "../wasm/client";
import { WORKSPACE_DRAW_TOOLS } from "./constants";
import { bindWorkspaceInteractions } from "./interactions";
import { createLeftStrip } from "./leftStrip";
import { createObjectTreePanel } from "./objectTreePanel";
import type { ChartWorkspaceHandle, CreateChartWorkspaceOptions, WorkspaceTheme } from "./types";

export function createChartWorkspace(options: CreateChartWorkspaceOptions): ChartWorkspaceHandle {
  const { host, createWasmChart } = options;
  host.innerHTML = "";

  const root = document.createElement("div");
  root.className = "drishya-workspace";

  const stage = document.createElement("div");
  stage.className = "drishya-stage";

  const canvas = document.createElement("canvas");
  const canvasId = `drishya-canvas-${Math.random().toString(36).slice(2, 10)}`;
  canvas.id = canvasId;
  stage.appendChild(canvas);

  let theme: WorkspaceTheme = options.initialTheme === "light" ? "light" : "dark";
  let activeTool: DrawingToolId = options.initialTool ?? "select";
  let rawChart = createWasmChart(canvasId, 300, 300);
  const chart = new DrishyaChartClient(rawChart);
  chart.setTheme(theme);

  const stripHandle = createLeftStrip({
    tools: WORKSPACE_DRAW_TOOLS,
    activeTool,
    drawingToolsEnabled: typeof rawChart.set_drawing_tool_mode === "function",
    onSelectTool: (toolId) => {
      setTool(toolId);
      draw();
    },
    onClear: () => {
      clearDrawings();
      draw();
    },
    onToggleTheme: () => {
      toggleTheme();
      draw();
    }
  });

  const treeHandle = createObjectTreePanel({
    chart,
    onMutate: () => draw()
  });

  root.appendChild(stripHandle.root);
  root.appendChild(stage);
  root.appendChild(treeHandle.root);
  host.appendChild(root);

  const setupCanvasBackingStore = () => {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const rect = stage.getBoundingClientRect();
    const width = Math.max(300, Math.floor(rect.width));
    const height = Math.max(300, Math.floor(rect.height));
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    chart.resize(width, height);
  };

  const setTool = (toolId: DrawingToolId) => {
    activeTool = toolId;
    chart.setDrawingTool(toolId);
    stripHandle.setActiveTool(toolId);
  };

  const clearDrawings = () => {
    chart.clearDrawings();
    if (typeof rawChart.cancel_drawing_interaction === "function") {
      rawChart.cancel_drawing_interaction();
    }
    setTool("select");
  };

  const toggleTheme = (): WorkspaceTheme => {
    theme = theme === "dark" ? "light" : "dark";
    chart.setTheme(theme);
    return theme;
  };

  const draw = () => {
    chart.draw();
    treeHandle.refresh();
  };

  const unbindInteractions = bindWorkspaceInteractions({
    canvas,
    chart,
    rawChart,
    redraw: draw,
    getPaneLayouts: () => chart.paneLayouts()
  });

  const hotkeyToolMap = Object.fromEntries(
    WORKSPACE_DRAW_TOOLS.map((tool) => [tool.hotkey.toLowerCase(), tool.id as DrawingToolId])
  );

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const key = event.key.toLowerCase();

    const mode = hotkeyToolMap[key];
    if (mode) {
      event.preventDefault();
      setTool(mode);
      draw();
      return;
    }

    if (key === "c") {
      clearDrawings();
      draw();
      return;
    }

    if (event.key === "Escape") {
      if (typeof rawChart.cancel_drawing_interaction === "function") {
        rawChart.cancel_drawing_interaction();
      }
      setTool("select");
      draw();
      return;
    }

    if (key === "t") {
      toggleTheme();
      draw();
    }
  };
  window.addEventListener("keydown", onKeyDown);

  let resizeObserver: ResizeObserver | null = null;
  if (typeof ResizeObserver === "function") {
    resizeObserver = new ResizeObserver(() => {
      setupCanvasBackingStore();
      draw();
    });
    resizeObserver.observe(stage);
  } else {
    window.addEventListener("resize", setupCanvasBackingStore);
  }

  setupCanvasBackingStore();
  setTool(activeTool);
  draw();

  return {
    root,
    strip: stripHandle.root,
    tree: treeHandle.root,
    canvas,
    chart,
    rawChart,
    draw,
    resize: () => {
      setupCanvasBackingStore();
      draw();
    },
    setTool,
    clearDrawings,
    toggleTheme,
    refreshObjectTree: treeHandle.refresh,
    destroy: () => {
      unbindInteractions();
      window.removeEventListener("keydown", onKeyDown);
      if (resizeObserver) {
        resizeObserver.disconnect();
      } else {
        window.removeEventListener("resize", setupCanvasBackingStore);
      }
      host.innerHTML = "";
    }
  };
}


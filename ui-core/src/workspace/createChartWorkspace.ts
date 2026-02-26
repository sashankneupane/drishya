import type { DrawingToolId } from "../toolbar/model.js";
import { DrishyaChartClient } from "../wasm/client.js";
import { DEFAULT_APPEARANCE_CONFIG, WORKSPACE_DRAW_TOOLS } from "./constants.js";
import { bindWorkspaceInteractions } from "./interactions.js";
import { createLeftStrip } from "./leftStrip.js";
import { createObjectTreePanel } from "./objectTreePanel.js";
import { createTopStrip } from "./topStrip.js";
import { WorkspaceController } from "./WorkspaceController.js";
import type {
  ChartWorkspaceHandle,
  CreateChartWorkspaceOptions,
} from "./types.js";

const WORKSPACE_STYLE_LINK_ID = "drishya-workspace-styles";

export function createChartWorkspace(options: CreateChartWorkspaceOptions): ChartWorkspaceHandle {
  const { host, createWasmChart } = options;
  if (options.injectStyles !== false) {
    ensureWorkspaceStyles();
  }
  ensureHostHasViewport(host);
  host.innerHTML = "";

  const controller = new WorkspaceController({
    theme: options.initialTheme,
    activeTool: options.initialTool
  });

  // root element fills host completely and hides any overflow
  const root = document.createElement("div");
  // vertical layout: top strip, then main workspace row
  root.className = "h-full w-full min-h-0 min-w-0 flex flex-col bg-workspace-bg text-workspace-text overflow-hidden font-sans select-none";

  const mainRow = document.createElement("div");
  mainRow.className = "flex flex-1 min-h-0 min-w-0 relative";

  const stage = document.createElement("div");
  stage.className = "flex-1 min-h-0 min-w-0 bg-chart-bg flex-shrink-0 relative overflow-hidden";

  const canvas = document.createElement("canvas");
  canvas.className = "block h-full w-full bg-transparent";
  const canvasId = `drishya-canvas-${Math.random().toString(36).slice(2, 10)}`;
  canvas.id = canvasId;
  stage.appendChild(canvas);

  // Mount elements to documented DOM before WASM initialization
  mainRow.appendChild(stage);
  root.appendChild(mainRow);
  host.appendChild(root);

  // WASM Chart setup - NOW canvas is in DOM
  let rawChart = createWasmChart(canvasId, 300, 300);
  const chart = new DrishyaChartClient(rawChart);
  chart.setTheme(controller.getState().theme);
  // Apply default appearance on init (wasm may not support it in older builds)
  const applyAppearance = (config: { background: string; candle_up: string; candle_down: string }) => {
    try {
      chart.setAppearanceConfig(config);
    } catch {
      // ignore if wasm doesn't support appearance config
    }
  };
  applyAppearance(DEFAULT_APPEARANCE_CONFIG);

  // top control strip
  const topHandle = createTopStrip({
    chart,
    controller,
    getAppearanceConfig: () => chart.getAppearanceConfig(),
    applyAppearanceConfig: (cfg) => applyAppearanceConfig(cfg),
    symbols: options.marketControls?.symbols ?? [],
    timeframes: options.marketControls?.timeframes ?? [],
    selectedSymbol: options.marketControls?.selectedSymbol,
    selectedTimeframe: options.marketControls?.selectedTimeframe,
    onSymbolChange: options.marketControls?.onSymbolChange,
    onTimeframeChange: options.marketControls?.onTimeframeChange,
    onCandleTypeChange: (mode) => {
      chart.setCandleStyle(mode);
      chart.draw();
    },
    onLayout: () => { },
    onMutate: () => draw()
  });

  const stripHandle = createLeftStrip({
    tools: WORKSPACE_DRAW_TOOLS,
    controller,
    drawingToolsEnabled: typeof rawChart.set_drawing_tool_mode === "function",
    onClear: () => {
      clearDrawings();
      draw();
    }
  });

  const treeHandle = createObjectTreePanel({
    chart,
    controller,
    onMutate: () => draw()
  });

  // Final assembly of UI pieces
  root.insertBefore(topHandle.root, mainRow);
  mainRow.insertBefore(stripHandle.root, stage);
  mainRow.appendChild(treeHandle.root);

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

  const clearDrawings = () => {
    chart.clearDrawings();
    if (typeof rawChart.cancel_drawing_interaction === "function") {
      rawChart.cancel_drawing_interaction();
    }
    controller.setActiveTool("select");
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

  // Controller subscriptions
  const unsubscribe = controller.subscribe((state) => {
    chart.setTheme(state.theme);
    chart.setDrawingTool(state.activeTool);
    chart.setCursorMode(state.cursorMode);
    draw();
  });

  // hotkeyToolMap
  const hotkeyToolMap: Record<string, DrawingToolId> = {};
  for (const tool of WORKSPACE_DRAW_TOOLS) {
    if (tool.children && Array.isArray(tool.children)) {
      for (const child of tool.children) {
        hotkeyToolMap[child.hotkey.toLowerCase()] = child.id as DrawingToolId;
      }
    } else {
      hotkeyToolMap[tool.hotkey.toLowerCase()] = tool.id as DrawingToolId;
    }
  }

  const onKeyDown = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null;
    const isEditableTarget =
      !!target &&
      (target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable);
    if (isEditableTarget) return;

    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const key = event.key.toLowerCase();

    const mode = hotkeyToolMap[key];
    if (mode) {
      event.preventDefault();
      const m = mode as string;
      if (m === "crosshair" || m === "dot" || m === "normal") {
        controller.setCursorMode(m as any);
        if (m === "normal") controller.setActiveTool("select");
      } else {
        controller.setActiveTool(mode);
      }
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
      chart.clearSelectedDrawing();
      chart.clearSelectedSeries();
      controller.setActiveTool("select");
      draw();
      return;
    }

    if (event.key === "Backspace" || event.key === "Delete") {
      if (chart.deleteSelectedDrawing() || chart.deleteSelectedSeries()) {
        event.preventDefault();
        draw();
      }
      return;
    }

    if (key === "t") {
      controller.toggleTheme();
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
  chart.setDrawingTool(controller.getState().activeTool);
  draw();

  const applyAppearanceConfig = (config: { background: string; candle_up: string; candle_down: string }) => {
    try {
      chart.setAppearanceConfig(config);
      draw();
    } catch {
      // invalid config - fail gracefully
    }
  };

  const getAppearanceConfig = () => chart.getAppearanceConfig();

  return {
    root: root as HTMLDivElement,
    strip: stripHandle.root,
    tree: treeHandle.root,
    canvas,
    chart,
    rawChart,
    controller,
    draw,
    applyAppearanceConfig,
    getAppearanceConfig,
    resize: () => {
      setupCanvasBackingStore();
      draw();
    },
    setTool: (toolId) => controller.setActiveTool(toolId),
    clearDrawings,
    toggleTheme: () => controller.toggleTheme(),
    refreshObjectTree: treeHandle.refresh,
    destroy: () => {
      unsubscribe();
      topHandle.destroy();
      stripHandle.destroy();
      treeHandle.destroy();
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

function ensureWorkspaceStyles(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(WORKSPACE_STYLE_LINK_ID)) return;

  const link = document.createElement("link");
  link.id = WORKSPACE_STYLE_LINK_ID;
  link.rel = "stylesheet";
  link.href = new URL("./styles.css", import.meta.url).href;
  document.head.appendChild(link);
}

function ensureHostHasViewport(host: HTMLElement): void {
  if (!host.style.width) {
    host.style.width = "100%";
  }
  if (!host.style.height) {
    host.style.height = "100vh";
  }
  host.style.overflow = "hidden";
}

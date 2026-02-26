import type { DrawingToolId } from "../toolbar/model.js";
import type { ChartAppearanceConfig } from "../wasm/contracts.js";
import { DrishyaChartClient } from "../wasm/client.js";
import { DEFAULT_APPEARANCE_CONFIG, WORKSPACE_DRAW_TOOLS } from "./constants.js";
import { createDrawingConfigPanel } from "./components/DrawingConfigPanel.js";
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

interface PersistedWorkspaceState {
  theme?: "dark" | "light";
  appearance?: ChartAppearanceConfig;
  paneState?: string | null;
  candleStyle?: string;
  activeTool?: string;
  cursorMode?: string;
  isObjectTreeOpen?: boolean;
  isLeftStripOpen?: boolean;
  priceAxisMode?: "linear" | "log" | "percent";
}

export function createChartWorkspace(options: CreateChartWorkspaceOptions): ChartWorkspaceHandle {
  const { host, createWasmChart } = options;
  if (options.injectStyles !== false) {
    ensureWorkspaceStyles();
  }
  ensureHostHasViewport(host);
  host.innerHTML = "";

  const persistKey = options.persistKey ?? null;

  const controller = new WorkspaceController({
    theme: options.initialTheme,
    activeTool: "select"
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

  const configPanelOverlay = document.createElement("div");
  configPanelOverlay.className = "absolute inset-0 pointer-events-none z-40";
  stage.appendChild(configPanelOverlay);

  const caretOverlay = document.createElement("div");
  caretOverlay.className = "absolute inset-0 pointer-events-none z-50";
  caretOverlay.setAttribute("aria-hidden", "true");
  caretOverlay.style.display = "none";
  stage.appendChild(caretOverlay);

  if (typeof document !== "undefined" && !document.getElementById("drishya-caret-style")) {
    const caretStyle = document.createElement("style");
    caretStyle.id = "drishya-caret-style";
    caretStyle.textContent = "@keyframes drishya-caret-blink{0%,49%{opacity:1}50%,100%{opacity:0}}";
    document.head.appendChild(caretStyle);
  }

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

  // Restore persisted state before building UI
  if (persistKey && typeof localStorage !== "undefined") {
    try {
      const raw = localStorage.getItem(persistKey);
      if (raw) {
        const saved = JSON.parse(raw) as PersistedWorkspaceState;
        if (saved.theme) {
          controller.setTheme(saved.theme);
          chart.setTheme(saved.theme);
        }
        if (saved.cursorMode) {
          controller.setCursorMode(saved.cursorMode as "crosshair" | "dot" | "normal");
          chart.setCursorMode(saved.cursorMode);
        }
        if (saved.isObjectTreeOpen !== undefined) controller.setObjectTreeOpen(saved.isObjectTreeOpen);
        if (saved.isLeftStripOpen !== undefined) controller.setLeftStripOpen(saved.isLeftStripOpen);
        if (saved.priceAxisMode) {
          controller.setPriceAxisMode(saved.priceAxisMode);
          chart.setPriceAxisMode(saved.priceAxisMode);
        }
        if (saved.appearance) applyAppearance(saved.appearance);
        const validStyle = saved.candleStyle as "solid" | "hollow" | "bars" | "volume" | undefined;
        if (validStyle && ["solid", "hollow", "bars", "volume"].includes(validStyle)) {
          chart.setCandleStyle(validStyle);
        }
        if (saved.paneState) chart.restorePaneStateJson(saved.paneState);
      }
    } catch {
      // ignore corrupt or incompatible persisted data
    }
  }

  const savePersistedState = (() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const DEBOUNCE_MS = 400;
    return () => {
      if (!persistKey || typeof localStorage === "undefined") return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        try {
          const state: PersistedWorkspaceState = {
            theme: controller.getState().theme,
            // Do not persist activeTool for the demo app; always restore as "select"
            cursorMode: controller.getState().cursorMode,
            isObjectTreeOpen: controller.getState().isObjectTreeOpen,
            isLeftStripOpen: controller.getState().isLeftStripOpen,
            priceAxisMode: controller.getState().priceAxisMode,
            candleStyle: chart.candleStyle(),
            appearance: chart.getAppearanceConfig() ?? undefined,
            paneState: chart.getPaneStateJson()
          };
          localStorage.setItem(persistKey, JSON.stringify(state));
        } catch {
          // ignore quota or parse errors
        }
      }, DEBOUNCE_MS);
    };
  })();

  // top control strip
  const topHandle = createTopStrip({
    chart,
    controller,
    getAppearanceConfig: () => chart.getAppearanceConfig(),
    applyAppearanceConfig: (cfg) => {
      applyAppearanceConfig(cfg);
      savePersistedState();
    },
    symbols: options.marketControls?.symbols ?? [],
    timeframes: options.marketControls?.timeframes ?? [],
    selectedSymbol: options.marketControls?.selectedSymbol,
    selectedTimeframe: options.marketControls?.selectedTimeframe,
    onSymbolChange: options.marketControls?.onSymbolChange,
    onTimeframeChange: options.marketControls?.onTimeframeChange,
    onCompareSymbol: options.marketControls?.onCompareSymbol,
    onCandleTypeChange: (mode) => {
      chart.setCandleStyle(mode);
      chart.draw();
      savePersistedState();
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

  let configPanelEl: HTMLElement | null = null;
  let configPanelDrawingId: number | null = null;

  const refreshConfigPanel = () => {
    const id = chart.selectedDrawingId();
    if (id === null) {
      if (configPanelEl) {
        configPanelEl.remove();
        configPanelEl = null;
        configPanelDrawingId = null;
      }
      return;
    }
    const config = chart.getSelectedDrawingConfig();
    if (!config) {
      if (configPanelEl) {
        configPanelEl.remove();
        configPanelEl = null;
        configPanelDrawingId = null;
      }
      return;
    }
    if (configPanelEl && configPanelDrawingId === id) return;
    if (configPanelEl) configPanelEl.remove();
    configPanelEl = createDrawingConfigPanel({
      chart,
      drawingId: id,
      config,
      onMutate: draw,
      onClose: () => {
        chart.clearSelectedDrawing();
        draw();
      }
    });
    configPanelDrawingId = id;
    configPanelOverlay.appendChild(configPanelEl);
  };

  const updateTextCaret = () => {
    const bounds = chart.selectedTextCaretBounds?.() ?? null;
    caretOverlay.innerHTML = "";
    if (bounds) {
      const caret = document.createElement("div");
      caret.style.position = "absolute";
      caret.style.left = `${bounds.x}px`;
      caret.style.top = `${bounds.y}px`;
      caret.style.width = "2px";
      caret.style.height = `${bounds.height}px`;
      caret.style.backgroundColor = bounds.color;
      caret.style.animation = "drishya-caret-blink 1s step-end infinite";
      caret.style.pointerEvents = "none";
      caretOverlay.appendChild(caret);
      caretOverlay.style.display = "";
    } else {
      caretOverlay.style.display = "none";
    }
  };

  const draw = () => {
    chart.draw();
    treeHandle.refresh();
    refreshConfigPanel();
    updateTextCaret();
    savePersistedState();
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
    chart.setPriceAxisMode(state.priceAxisMode);
    draw();
    savePersistedState();
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
    const key = event.key;

    // Inline text editing: when a Text drawing is selected and not locked, type directly
    const selectedId = chart.selectedDrawingId();
    if (selectedId !== null) {
      const config = chart.getSelectedDrawingConfig();
      const isTextDrawing =
        config && typeof config.text_content === "string" && !config.locked;
      if (isTextDrawing && config) {
        let text = config.text_content ?? "";
        if (event.key === "Escape") {
          chart.clearSelectedDrawing();
          draw();
          event.preventDefault();
          return;
        }
        if (event.key === "Backspace") {
          text = text.slice(0, -1);
          chart.setDrawingConfig(selectedId, { text_content: text });
          draw();
          event.preventDefault();
          return;
        }
        // Delete is not intercepted here; it falls through to delete the drawing
        if (event.key === "Enter") {
          text += "\n";
          chart.setDrawingConfig(selectedId, { text_content: text });
          draw();
          event.preventDefault();
          return;
        }
        if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
          text += key;
          chart.setDrawingConfig(selectedId, { text_content: text });
          draw();
          event.preventDefault();
          return;
        }
      }
    }

    const keyLower = key.toLowerCase();
    const mode = hotkeyToolMap[keyLower];
    if (mode) {
      event.preventDefault();
      const m = mode as string;
      if (m === "crosshair" || m === "dot" || m === "normal") {
        controller.setCursorMode(m as any);
        if (m === "normal") controller.setActiveTool("select");
      } else {
        controller.setActiveTool(mode, { force: true });
      }
      return;
    }

    if (keyLower === "c") {
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
      controller.setActiveTool("select", { force: true });
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

    if (keyLower === "t") {
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
      if (configPanelEl) configPanelEl.remove();
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

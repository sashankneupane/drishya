import type { DrishyaChartClient } from "../wasm/client";
import type { PaneLayout, WasmChartLike } from "../wasm/contracts";

const PANE_GAP_PX = 4;
const PANE_SEPARATOR_HIT_PX = 6;
const PANE_MIN_HEIGHT_PX = 24;

interface BindWorkspaceInteractionsOptions {
  canvas: HTMLCanvasElement;
  chart: DrishyaChartClient;
  rawChart: WasmChartLike;
  redraw: () => void;
  getPaneLayouts: () => PaneLayout[];
}

export function bindWorkspaceInteractions(options: BindWorkspaceInteractionsOptions): () => void {
  const { canvas, chart, rawChart, redraw, getPaneLayouts } = options;
  const hasDrawingInteraction =
    typeof rawChart.set_drawing_tool_mode === "function" &&
    typeof rawChart.drawing_pointer_down === "function" &&
    typeof rawChart.drawing_pointer_move === "function" &&
    typeof rawChart.drawing_pointer_up === "function" &&
    typeof rawChart.drawing_cursor_hint === "function";

  let dragging = false;
  let pointerInCanvas = false;
  let lastX = 0;
  let lastY = 0;
  let axisZoomDrag: { axis: "x" | "y"; lastClient: number; anchor: number } | null = null;
  let paneResizeDrag: { index: number } | null = null;

  const applyCursor = (cursor: string) => {
    canvas.style.cursor = cursor;
  };

  const pointInRect = (x: number, y: number, rect: { x: number; y: number; w: number; h: number }) =>
    x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;

  const canvasCssSize = () => {
    const rect = canvas.getBoundingClientRect();
    return {
      width: Math.max(1, Math.floor(rect.width)),
      height: Math.max(1, Math.floor(rect.height))
    };
  };

  const axisZones = () => {
    const panes = getPaneLayouts();
    if (panes.length === 0) return null;

    const view = canvasCssSize();
    const first = panes[0];
    const last = panes[panes.length - 1];
    const yAxisX = first.x + first.w;
    const xAxisY = last.y + last.h;

    return {
      yAxis: { x: yAxisX, y: first.y, w: Math.max(0, view.width - yAxisX), h: Math.max(0, xAxisY - first.y) },
      xAxis: { x: first.x, y: xAxisY, w: first.w, h: Math.max(0, view.height - xAxisY) }
    };
  };

  const paneSeparatorAt = (x: number, y: number) => {
    const panes = getPaneLayouts();
    if (panes.length < 2) return null;

    for (let i = 0; i < panes.length - 1; i++) {
      const upper = panes[i];
      const lower = panes[i + 1];
      const boundaryY = upper.y + upper.h;
      const inX = x >= upper.x && x <= upper.x + upper.w;
      const closeY = Math.abs(y - boundaryY) <= PANE_SEPARATOR_HIT_PX;
      if (!inX || !closeY) continue;
      return { index: i, upper, lower };
    }
    return null;
  };

  const applyPaneResizeAtY = (dragState: { index: number }, pointerY: number) => {
    if (typeof rawChart.set_pane_weights_json !== "function") return;
    const panes = getPaneLayouts();
    const upper = panes[dragState.index];
    const lower = panes[dragState.index + 1];
    if (!upper || !lower) return;

    const lowerBottom = lower.y + lower.h;
    const minY = upper.y + PANE_MIN_HEIGHT_PX;
    const maxY = lowerBottom - PANE_GAP_PX - PANE_MIN_HEIGHT_PX;
    const clampedBoundaryY = Math.max(minY, Math.min(maxY, pointerY));

    const newUpperH = Math.max(PANE_MIN_HEIGHT_PX, clampedBoundaryY - upper.y);
    const newLowerH = Math.max(PANE_MIN_HEIGHT_PX, lowerBottom - (clampedBoundaryY + PANE_GAP_PX));

    const weightMap: Record<string, number> = {};
    for (const pane of panes) weightMap[pane.id] = pane.h;
    weightMap[upper.id] = newUpperH;
    weightMap[lower.id] = newLowerH;
    chart.setPaneWeights(weightMap);
  };

  const updateSelectCursorAt = (x: number, y: number) => {
    if (!hasDrawingInteraction) {
      applyCursor("default");
      return;
    }
    try {
      applyCursor(chart.drawingCursorHint(x, y) || "default");
    } catch {
      applyCursor("default");
    }
  };

  const onMouseEnter = () => {
    pointerInCanvas = true;
    if (!dragging) applyCursor("default");
  };

  const onMouseDown = (event: MouseEvent) => {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const separator = paneSeparatorAt(x, y);
    if (separator) {
      paneResizeDrag = { index: separator.index };
      applyCursor("row-resize");
      return;
    }

    if (hasDrawingInteraction) {
      const consumed = chart.drawingPointerDown(x, y);
      if (consumed) {
        applyCursor(chart.drawingToolMode() === "select" ? "grabbing" : "crosshair");
        redraw();
        lastX = event.clientX;
        lastY = event.clientY;
        return;
      }
    }

    const zones = axisZones();
    if (zones && pointInRect(x, y, zones.yAxis)) {
      axisZoomDrag = { axis: "y", lastClient: event.clientY, anchor: y };
      return;
    }
    if (zones && pointInRect(x, y, zones.xAxis)) {
      axisZoomDrag = { axis: "x", lastClient: event.clientX, anchor: x };
      return;
    }

    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    applyCursor("grabbing");
  };

  const onMouseUp = () => {
    if (hasDrawingInteraction) {
      const rect = canvas.getBoundingClientRect();
      if (chart.drawingPointerUp(lastX - rect.left, lastY - rect.top)) {
        redraw();
      }
    }

    axisZoomDrag = null;
    paneResizeDrag = null;
    dragging = false;

    if (pointerInCanvas) {
      const rect = canvas.getBoundingClientRect();
      updateSelectCursorAt(lastX - rect.left, lastY - rect.top);
    } else {
      applyCursor("default");
    }
  };

  const onWindowMouseMove = (event: MouseEvent) => {
    const prevX = lastX;
    const prevY = lastY;
    lastX = event.clientX;
    lastY = event.clientY;

    if (paneResizeDrag) {
      const rect = canvas.getBoundingClientRect();
      applyPaneResizeAtY(paneResizeDrag, event.clientY - rect.top);
      redraw();
      return;
    }

    if (hasDrawingInteraction) {
      const rect = canvas.getBoundingClientRect();
      if (chart.drawingPointerMove(event.clientX - rect.left, event.clientY - rect.top)) {
        redraw();
        return;
      }
    }

    if (axisZoomDrag?.axis === "y") {
      const dy = event.clientY - axisZoomDrag.lastClient;
      axisZoomDrag.lastClient = event.clientY;
      if (dy !== 0) {
        chart.zoomY(axisZoomDrag.anchor, Math.max(0.85, Math.min(1.15, 1.0 + dy * 0.01)));
        redraw();
      }
      return;
    }

    if (axisZoomDrag?.axis === "x") {
      const dx = event.clientX - axisZoomDrag.lastClient;
      axisZoomDrag.lastClient = event.clientX;
      if (dx !== 0) {
        chart.zoomX(axisZoomDrag.anchor, Math.max(0.85, Math.min(1.15, 1.0 + dx * 0.01)));
        redraw();
      }
      return;
    }

    if (!dragging) return;
    const rect = canvas.getBoundingClientRect();
    chart.pan2d(event.clientX - prevX, event.clientY - prevY, event.clientY - rect.top);
    redraw();
  };

  const onCanvasMouseMove = (event: MouseEvent) => {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    if (paneSeparatorAt(x, y)) {
      chart.clearCrosshair();
      applyCursor("row-resize");
      redraw();
      return;
    }

    chart.setCrosshair(x, y);
    const zones = axisZones();
    if (zones && pointInRect(x, y, zones.yAxis)) {
      applyCursor("ns-resize");
      redraw();
      return;
    }
    if (zones && pointInRect(x, y, zones.xAxis)) {
      applyCursor("ew-resize");
      redraw();
      return;
    }

    if (!dragging) updateSelectCursorAt(x, y);
    redraw();
  };

  const onMouseLeave = () => {
    pointerInCanvas = false;
    chart.clearCrosshair();
    if (!dragging) applyCursor("default");
    redraw();
  };

  const onWheel = (event: WheelEvent) => {
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    chart.zoomX(x, event.deltaY > 0 ? 1.1 : 0.9);
    redraw();
  };

  canvas.addEventListener("mouseenter", onMouseEnter);
  canvas.addEventListener("mousedown", onMouseDown);
  canvas.addEventListener("mousemove", onCanvasMouseMove);
  canvas.addEventListener("mouseleave", onMouseLeave);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  window.addEventListener("mousemove", onWindowMouseMove);
  window.addEventListener("mouseup", onMouseUp);

  return () => {
    canvas.removeEventListener("mouseenter", onMouseEnter);
    canvas.removeEventListener("mousedown", onMouseDown);
    canvas.removeEventListener("mousemove", onCanvasMouseMove);
    canvas.removeEventListener("mouseleave", onMouseLeave);
    canvas.removeEventListener("wheel", onWheel);
    window.removeEventListener("mousemove", onWindowMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
  };
}


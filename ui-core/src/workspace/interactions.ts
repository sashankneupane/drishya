import type { DrishyaChartClient } from "../wasm/client.js";
import type { PaneLayout, WasmChartLike } from "../wasm/contracts.js";

const PANE_GAP_PX = 4;
const PANE_SEPARATOR_HIT_PX = 10;
const PANE_MIN_HEIGHT_PX = 24;

import type { WorkspaceController } from "./WorkspaceController.js";

interface BindWorkspaceInteractionsOptions {
  canvas: HTMLCanvasElement;
  chart: DrishyaChartClient;
  rawChart: WasmChartLike;
  redraw: () => void;
  getPaneLayouts: () => PaneLayout[];
  controller: WorkspaceController;
}

export function bindWorkspaceInteractions(options: BindWorkspaceInteractionsOptions): () => void {
  const { canvas, chart, rawChart, redraw, getPaneLayouts, controller } = options;
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
  let panAnchorY: number | null = null;
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

    const totalAvailPx = panes.reduce((sum, p) => sum + p.h, 0);
    if (totalAvailPx <= 0) return;

    const newUpperRatio = newUpperH / totalAvailPx;
    const newLowerRatio = newLowerH / totalAvailPx;

    controller.updatePaneRatios({
      [upper.id]: newUpperRatio,
      [lower.id]: newLowerRatio
    });
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
      if (chart.drawingToolMode() === "select") {
        const selectedSeries = chart.selectSeriesAt(x, y);
        if (selectedSeries) {
          redraw();
          lastX = event.clientX;
          lastY = event.clientY;
          return;
        }
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
    panAnchorY = y;
    lastX = event.clientX;
    lastY = event.clientY;
    applyCursor("grabbing");
  };

  const onTouchStart = (event: TouchEvent) => {
    if (!hasDrawingInteraction) return;
    if (event.touches.length !== 1) return;

    const touch = event.touches[0];
    const rect = canvas.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;

    if (chart.drawingToolMode() === "select") {
      const selectedDrawing = chart.selectDrawingAt(x, y);
      if (!selectedDrawing) {
        chart.selectSeriesAt(x, y);
      }
    }
    chart.drawingPointerDown(x, y);
    redraw();
    event.preventDefault();
  };

  const onTouchMove = (event: TouchEvent) => {
    if (!hasDrawingInteraction) return;
    if (event.touches.length !== 1) return;

    const touch = event.touches[0];
    const rect = canvas.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;

    if (chart.drawingPointerMove(x, y)) {
      redraw();
      event.preventDefault();
    }
  };

  const onTouchEnd = (event: TouchEvent) => {
    if (!hasDrawingInteraction) return;
    const touch = event.changedTouches[0];
    if (!touch) return;

    const rect = canvas.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;
    if (chart.drawingPointerUp(x, y)) {
      redraw();
    }
    event.preventDefault();
  };

  const onMouseUp = (event: MouseEvent) => {
    // update last coordinates from the release event so we don't rely solely on
    // intermediate mousemove events (important for clicks without movement)
    lastX = event.clientX;
    lastY = event.clientY;

    if (hasDrawingInteraction) {
      const rect = canvas.getBoundingClientRect();
      if (chart.drawingPointerUp(lastX - rect.left, lastY - rect.top)) {
        redraw();
      }
    }

    axisZoomDrag = null;
    paneResizeDrag = null;
    dragging = false;
    panAnchorY = null;

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
    const anchorY = panAnchorY ?? (event.clientY - rect.top);
    chart.pan2d(event.clientX - prevX, event.clientY - prevY, anchorY);
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
    // Notice: we don't call redraw() here manually if updateSyncCrosshair triggers one via controller,
    // but we optimized the subscription to avoid that. So we MUST call redraw here.
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
    // Dampen wheel/trackpad zoom so pinch is less aggressive on high-resolution touchpads.
    const delta = Math.max(-120, Math.min(120, event.deltaY));
    const sensitivity = event.ctrlKey ? 0.00065 : 0.00095;
    const factor = Math.exp(delta * sensitivity);
    chart.zoomX(x, Math.max(0.96, Math.min(1.04, factor)));
    redraw();
  };

  canvas.addEventListener("mouseenter", onMouseEnter);
  canvas.addEventListener("mousedown", onMouseDown);
  canvas.addEventListener("mousemove", onCanvasMouseMove);
  canvas.addEventListener("mouseleave", onMouseLeave);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("touchstart", onTouchStart, { passive: false });
  canvas.addEventListener("touchmove", onTouchMove, { passive: false });
  canvas.addEventListener("touchend", onTouchEnd, { passive: false });
  window.addEventListener("mousemove", onWindowMouseMove);
  window.addEventListener("mouseup", onMouseUp);

  return () => {
    canvas.removeEventListener("mouseenter", onMouseEnter);
    canvas.removeEventListener("mousedown", onMouseDown);
    canvas.removeEventListener("mousemove", onCanvasMouseMove);
    canvas.removeEventListener("mouseleave", onMouseLeave);
    canvas.removeEventListener("wheel", onWheel);
    canvas.removeEventListener("touchstart", onTouchStart);
    canvas.removeEventListener("touchmove", onTouchMove);
    canvas.removeEventListener("touchend", onTouchEnd);
    window.removeEventListener("mousemove", onWindowMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
  };
}

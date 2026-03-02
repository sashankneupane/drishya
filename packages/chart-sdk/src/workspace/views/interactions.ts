import type { DrishyaChartClient } from "../../wasm/client.js";
import type { PaneLayout, WasmChartLike } from "../../wasm/contracts.js";
import { isDrawingToolId } from "../../toolbar/model.js";
import type { LayoutRect } from "../../layout/splitTree.js";
import type { WorkspaceChartSplitDirection, WorkspaceChartSplitNode } from "../models/types.js";

const PANE_GAP_PX = 4;
const PANE_SEPARATOR_HIT_PX = 10;
const PANE_MIN_HEIGHT_PX = 24;

import type { WorkspaceController } from "../controllers/WorkspaceController.js";

interface BindWorkspaceInteractionsOptions {
  canvas: HTMLCanvasElement;
  chart: DrishyaChartClient;
  rawChart: WasmChartLike;
  redraw: () => void;
  redrawFast?: () => void;
  getPaneLayouts: () => PaneLayout[];
  controller: WorkspaceController;
  paneId?: string;
  getPaneViewport?: () => LayoutRect | null;
  getWorkspaceViewport?: () => LayoutRect;
  onSourceReadoutClick?: () => void;
}

export function bindWorkspaceInteractions(options: BindWorkspaceInteractionsOptions): () => void {
  const {
    canvas,
    chart,
    rawChart,
    redraw,
    redrawFast,
    getPaneLayouts,
    controller,
    onSourceReadoutClick,
    paneId,
    getPaneViewport,
    getWorkspaceViewport
  } = options;
  const drawFast = redrawFast ?? redraw;
  let fastDrawQueued = false;
  const requestFastDraw = () => {
    if (fastDrawQueued) return;
    fastDrawQueued = true;
    requestAnimationFrame(() => {
      fastDrawQueued = false;
      drawFast();
    });
  };
  const hasDrawingInteraction =
    typeof rawChart.drawing_pointer_down === "function" &&
    typeof rawChart.drawing_pointer_move === "function" &&
    typeof rawChart.drawing_pointer_up === "function";

  let dragging = false;
  let pointerInCanvas = false;
  let lastX = 0;
  let lastY = 0;
  let panAnchorY: number | null = null;
  let axisZoomDrag: { axis: "x" | "y"; lastClient: number; anchor: number } | null = null;
  let paneResizeDrag: { index: number } | null = null;
  let drawingInteractionActive = false;
  let movedWhileDragging = false;
  let drawingSessionMouseActive = false;
  let drawingSessionTouchActive = false;
  let suppressSyntheticMouseUntil = 0;
  let drawingSessionStartCount = 0;
  let drawingSessionStartSelectedId: number | null = null;
  let drawingSessionStartX = 0;
  let drawingSessionStartY = 0;
  let chartSplitDrag: {
    path: number[];
    direction: WorkspaceChartSplitDirection;
    rect: LayoutRect;
  } | null = null;

  const applyCursor = (cursor: string) => {
    canvas.style.cursor = cursor;
  };
  const syncControllerToolWithChartMode = () => {
    const mode = chart.drawingToolMode();
    if (mode === "select") {
      controller.setActiveTool("select", { force: true });
      return;
    }
    if (isDrawingToolId(mode)) {
      controller.setActiveTool(mode, { force: true });
    }
  };
  const ONE_SHOT_TOOLS = new Set(["hline", "vline"]);
  const captureDrawingSessionStart = () => {
    drawingSessionStartCount = chart.objectTreeState().drawings.length;
    drawingSessionStartSelectedId = chart.selectedDrawingId();
  };
  const rememberSessionStartPoint = (x: number, y: number) => {
    drawingSessionStartX = x;
    drawingSessionStartY = y;
  };
  const isRobustDrawingCompletion = (completedByEngine: boolean) => {
    if (!completedByEngine) return false;
    const endCount = chart.objectTreeState().drawings.length;
    const endSelectedId = chart.selectedDrawingId();
    const createdDrawing = endCount > drawingSessionStartCount;
    const selectedChanged = endSelectedId !== null && endSelectedId !== drawingSessionStartSelectedId;
    return createdDrawing || selectedChanged;
  };
  const maybeAutoReturnToSelect = (
    toolModeAtRelease: string,
    completedByEngine: boolean,
    releaseX: number,
    releaseY: number
  ) => {
    if (!completedByEngine || toolModeAtRelease === "select") return;
    requestAnimationFrame(() => {
      const endCount = chart.objectTreeState().drawings.length;
      const endSelectedId = chart.selectedDrawingId();
      const createdDrawing = endCount > drawingSessionStartCount;
      const selectedChanged = endSelectedId !== null && endSelectedId !== drawingSessionStartSelectedId;
      if (createdDrawing || selectedChanged || ONE_SHOT_TOOLS.has(toolModeAtRelease)) {
        controller.setActiveTool("select", { force: true });
        const mx = (drawingSessionStartX + releaseX) * 0.5;
        const my = (drawingSessionStartY + releaseY) * 0.5;
        const candidates: Array<[number, number]> = [
          [releaseX, releaseY],
          [drawingSessionStartX, drawingSessionStartY],
          [mx, my],
        ];
        const ring = [0, -8, 8, -12, 12];
        for (const [cx, cy] of [...candidates]) {
          for (const dx of ring) {
            for (const dy of ring) {
              candidates.push([cx + dx, cy + dy]);
            }
          }
        }
        for (const [sx, sy] of candidates) {
          chart.selectDrawingAt(sx, sy);
          if (chart.selectedDrawingId() !== null) break;
        }
        redraw();
      }
    });
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
      const withinPaneX = x >= upper.x && x <= upper.x + upper.w;
      if (!withinPaneX) continue;
      const upperBottom = upper.y + upper.h;
      const gapPx = Math.max(0, lower.y - upperBottom);
      const separatorCenterY = upperBottom + gapPx * 0.5;
      const closeY = Math.abs(y - separatorCenterY) <= PANE_SEPARATOR_HIT_PX;
      if (!closeY) continue;
      return { index: i, upper, lower, gapPx };
    }
    return null;
  };

  const chartSplitSeparatorAt = (x: number, y: number) => {
    const paneViewport = getPaneViewport?.() ?? {
      x: 0,
      y: 0,
      w: Math.max(1, Math.floor(canvas.getBoundingClientRect().width)),
      h: Math.max(1, Math.floor(canvas.getBoundingClientRect().height))
    };
    const viewport: LayoutRect = getWorkspaceViewport?.() ?? paneViewport;
    const globalX = paneViewport.x + x;
    const globalY = paneViewport.y + y;
    const out: {
      path: number[];
      direction: WorkspaceChartSplitDirection;
      rect: LayoutRect;
    }[] = [];
    collectChartSplitSeparators(controller.getState().chartLayoutTree, viewport, [], out);
    for (const item of out) {
      if (item.direction === "horizontal") {
        const dividerX = item.rect.x + item.rect.w * 0.5;
        const closeX = Math.abs(globalX - dividerX) <= PANE_SEPARATOR_HIT_PX;
        const inY = globalY >= item.rect.y && globalY <= item.rect.y + item.rect.h;
        if (closeX && inY) return item;
      } else {
        const dividerY = item.rect.y + item.rect.h * 0.5;
        const closeY = Math.abs(globalY - dividerY) <= PANE_SEPARATOR_HIT_PX;
        const inX = globalX >= item.rect.x && globalX <= item.rect.x + item.rect.w;
        if (closeY && inX) return item;
      }
    }
    return null;
  };

  const applyPaneResizeAtY = (dragState: { index: number }, pointerY: number) => {
    const panes = getPaneLayouts();
    const upper = panes[dragState.index];
    const lower = panes[dragState.index + 1];
    if (!upper || !lower) return;

    const lowerBottom = lower.y + lower.h;
    const upperBottom = upper.y + upper.h;
    const gapPx = Math.max(0, lower.y - upperBottom);
    const minY = upper.y + PANE_MIN_HEIGHT_PX;
    const maxY = lowerBottom - gapPx - PANE_MIN_HEIGHT_PX;
    const clampedBoundaryY = Math.max(minY, Math.min(maxY, pointerY));

    const newUpperH = Math.max(PANE_MIN_HEIGHT_PX, clampedBoundaryY - upper.y);
    const newLowerH = Math.max(PANE_MIN_HEIGHT_PX, lowerBottom - (clampedBoundaryY + gapPx));

    const totalAvailPx = panes.reduce((sum, p) => sum + p.h, 0);
    if (totalAvailPx <= 0) return;

    const updates: Record<string, number> = {};
    for (let i = 0; i < panes.length; i += 1) {
      const pane = panes[i];
      if (pane.id === upper.id) {
        updates[pane.id] = newUpperH / totalAvailPx;
      } else if (pane.id === lower.id) {
        updates[pane.id] = newLowerH / totalAvailPx;
      } else {
        updates[pane.id] = pane.h / totalAvailPx;
      }
    }
    chart.setPaneWeights(updates);
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
    if (Date.now() < suppressSyntheticMouseUntil) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    if (paneId) {
      controller.setActiveChartPane(paneId);
    } else {
      const activeChartPaneId = chartPaneAtPoint(controller.getState().chartLayoutTree, {
        x: 0,
        y: 0,
        w: Math.max(1, Math.floor(rect.width)),
        h: Math.max(1, Math.floor(rect.height))
      }, x, y);
      if (activeChartPaneId) {
        controller.setActiveChartPane(activeChartPaneId);
      }
    }
    if (chart.sourceReadoutHitTest(x, y)) {
      event.preventDefault();
      onSourceReadoutClick?.();
      return;
    }

    const chartSplit = chartSplitSeparatorAt(x, y);
    if (chartSplit) {
      event.preventDefault();
      chartSplitDrag = chartSplit;
      applyCursor(chartSplit.direction === "horizontal" ? "col-resize" : "row-resize");
      return;
    }

    const separator = paneSeparatorAt(x, y);
    if (separator) {
      event.preventDefault();
      paneResizeDrag = { index: separator.index };
      applyCursor("row-resize");
      return;
    }

    if (hasDrawingInteraction) {
      const toolMode = chart.drawingToolMode();
      if (toolMode !== "select") {
        captureDrawingSessionStart();
        rememberSessionStartPoint(x, y);
        const consumed = chart.drawingPointerDown(x, y);
        syncControllerToolWithChartMode();
        drawingSessionMouseActive = true;
        drawingInteractionActive = consumed;
        applyCursor("crosshair");
        redraw();
        lastX = event.clientX;
        lastY = event.clientY;
        // Never fall through to pan/axis interactions while a drawing tool is active.
        return;
      } else {
        // In select mode, always let drawing interaction consume first so
        // resize/anchor handles and drag moves don't fall through to chart pan.
        const consumeSelectedInteraction = chart.drawingPointerDown(x, y);
        if (consumeSelectedInteraction) {
          drawingSessionMouseActive = true;
          drawingInteractionActive = true;
          applyCursor("grabbing");
          redraw();
          lastX = event.clientX;
          lastY = event.clientY;
          return;
        }
        const selectedDrawing = chart.selectDrawingAt(x, y);
        if (selectedDrawing !== null) {
          // Ensure selection click updates UI (floating drawing toolbar),
          // even when no drag interaction starts.
          redraw();
          drawingInteractionActive = false;
          lastX = event.clientX;
          lastY = event.clientY;
          return;
        }
        const selectedSeries = chart.selectSeriesAt(x, y);
        if (selectedSeries) {
          drawingInteractionActive = false;
          lastX = event.clientX;
          lastY = event.clientY;
        }
      }
    }
    drawingInteractionActive = false;

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
    movedWhileDragging = false;
    panAnchorY = y;
    lastX = event.clientX;
    lastY = event.clientY;
    applyCursor("grabbing");
  };

  const onTouchStart = (event: TouchEvent) => {
    if (!hasDrawingInteraction) return;
    if (event.touches.length !== 1) return;
    suppressSyntheticMouseUntil = Date.now() + 1000;

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
    captureDrawingSessionStart();
    rememberSessionStartPoint(x, y);
    drawingSessionTouchActive = true;
    chart.drawingPointerDown(x, y);
    syncControllerToolWithChartMode();
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
    suppressSyntheticMouseUntil = Date.now() + 1000;
    const touch = event.changedTouches[0];
    if (!touch) return;

    const rect = canvas.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;
    const toolModeAtRelease = chart.drawingToolMode();
    if (drawingSessionTouchActive) {
      const completed = chart.drawingPointerUp(x, y);
      maybeAutoReturnToSelect(toolModeAtRelease, completed, x, y);
      syncControllerToolWithChartMode();
      redraw();
    }
    drawingSessionTouchActive = false;
    event.preventDefault();
  };

  const onMouseUp = (event: MouseEvent) => {
    if (Date.now() < suppressSyntheticMouseUntil) {
      drawingSessionMouseActive = false;
      drawingInteractionActive = false;
      movedWhileDragging = false;
      dragging = false;
      panAnchorY = null;
      return;
    }
    // update last coordinates from the release event so we don't rely solely on
    // intermediate mousemove events (important for clicks without movement)
    lastX = event.clientX;
    lastY = event.clientY;

    const toolModeAtRelease = hasDrawingInteraction ? chart.drawingToolMode() : "select";
    const shouldFinalizeDrawing = hasDrawingInteraction && drawingSessionMouseActive;
    if (shouldFinalizeDrawing) {
      const rect = canvas.getBoundingClientRect();
      const releaseX = lastX - rect.left;
      const releaseY = lastY - rect.top;
      const completed = chart.drawingPointerUp(releaseX, releaseY);
      maybeAutoReturnToSelect(toolModeAtRelease, completed, releaseX, releaseY);
      syncControllerToolWithChartMode();
      requestFastDraw();
    }
    drawingSessionMouseActive = false;

    if (!drawingInteractionActive && !movedWhileDragging && chart.drawingToolMode() === "select") {
      const rect = canvas.getBoundingClientRect();
      const localX = event.clientX - rect.left;
      const localY = event.clientY - rect.top;
      if (chart.selectSeriesAt(localX, localY)) {
        redraw();
      }
    }

    const hadChartSplitDrag = chartSplitDrag !== null;
    const hadPaneResizeDrag = paneResizeDrag !== null;
    axisZoomDrag = null;
    chartSplitDrag = null;
    paneResizeDrag = null;
    drawingInteractionActive = false;
    movedWhileDragging = false;
    dragging = false;
    panAnchorY = null;
    if (hadPaneResizeDrag || hadChartSplitDrag) {
      redraw();
    }

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

    if (chartSplitDrag) {
      const rect = canvas.getBoundingClientRect();
      const localX = event.clientX - rect.left;
      const localY = event.clientY - rect.top;
      const paneViewport = getPaneViewport?.() ?? { x: 0, y: 0, w: rect.width, h: rect.height };
      const globalX = paneViewport.x + localX;
      const globalY = paneViewport.y + localY;
      const ratio =
        chartSplitDrag.direction === "horizontal"
          ? (globalX - chartSplitDrag.rect.x) / Math.max(1, chartSplitDrag.rect.w)
          : (globalY - chartSplitDrag.rect.y) / Math.max(1, chartSplitDrag.rect.h);
      controller.setChartSplitRatio(chartSplitDrag.path, ratio);
      requestFastDraw();
      return;
    }

    if (paneResizeDrag) {
      const rect = canvas.getBoundingClientRect();
      applyPaneResizeAtY(paneResizeDrag, event.clientY - rect.top);
      requestFastDraw();
      return;
    }

    if (axisZoomDrag?.axis === "y") {
      const dy = event.clientY - axisZoomDrag.lastClient;
      axisZoomDrag.lastClient = event.clientY;
      if (dy !== 0) {
        chart.zoomY(axisZoomDrag.anchor, Math.max(0.85, Math.min(1.15, 1.0 + dy * 0.01)));
        requestFastDraw();
      }
      return;
    }

    if (axisZoomDrag?.axis === "x") {
      const dx = event.clientX - axisZoomDrag.lastClient;
      axisZoomDrag.lastClient = event.clientX;
      if (dx !== 0) {
        chart.zoomX(axisZoomDrag.anchor, Math.max(0.85, Math.min(1.15, 1.0 + dx * 0.01)));
        requestFastDraw();
      }
      return;
    }

    if (!dragging) return;
    const rect = canvas.getBoundingClientRect();
    const anchorY = panAnchorY ?? (event.clientY - rect.top);
    const dx = event.clientX - prevX;
    const dy = event.clientY - prevY;
    if (dx !== 0 || dy !== 0) {
      movedWhileDragging = true;
    }
    chart.pan2d(dx, dy, anchorY);
    requestFastDraw();
    return;
  };

  const onWindowMouseMoveDrawing = (event: MouseEvent) => {
    if (!hasDrawingInteraction || !drawingInteractionActive || dragging || chartSplitDrag || paneResizeDrag || axisZoomDrag) {
      return;
    }
    const rect = canvas.getBoundingClientRect();
    if (chart.drawingPointerMove(event.clientX - rect.left, event.clientY - rect.top)) {
      requestFastDraw();
    }
  };

  const onCanvasMouseMove = (event: MouseEvent) => {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const splitSeparator = chartSplitSeparatorAt(x, y);
    if (splitSeparator) {
      chart.clearCrosshair();
      applyCursor(splitSeparator.direction === "horizontal" ? "col-resize" : "row-resize");
      requestFastDraw();
      return;
    }

    if (paneSeparatorAt(x, y)) {
      chart.clearCrosshair();
      applyCursor("row-resize");
      requestFastDraw();
      return;
    }

    if (chart.sourceReadoutHitTest(x, y)) {
      chart.clearCrosshair();
      applyCursor("pointer");
      requestFastDraw();
      return;
    }

    chart.setCrosshair(x, y);

    const zones = axisZones();
    if (zones && pointInRect(x, y, zones.yAxis)) {
      applyCursor("ns-resize");
      requestFastDraw();
      return;
    }
    if (zones && pointInRect(x, y, zones.xAxis)) {
      applyCursor("ew-resize");
      requestFastDraw();
      return;
    }

    if (!dragging) updateSelectCursorAt(x, y);
    requestFastDraw();
  };

  const onMouseLeave = () => {
    pointerInCanvas = false;
    chart.clearCrosshair();
    if (!dragging) applyCursor("default");
    requestFastDraw();
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
    requestFastDraw();
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
  window.addEventListener("mousemove", onWindowMouseMoveDrawing);
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
    window.removeEventListener("mousemove", onWindowMouseMoveDrawing);
    window.removeEventListener("mouseup", onMouseUp);
  };
}

function collectChartSplitSeparators(
  node: WorkspaceChartSplitNode,
  rect: LayoutRect,
  path: number[],
  out: { path: number[]; direction: WorkspaceChartSplitDirection; rect: LayoutRect }[]
): void {
  if (node.type === "leaf") return;
  const ratio = Math.max(0.1, Math.min(0.9, node.ratio));
  if (node.direction === "horizontal") {
    const firstW = Math.floor(rect.w * ratio);
    const secondW = rect.w - firstW;
    out.push({
      path,
      direction: node.direction,
      rect: { x: rect.x + firstW - 1, y: rect.y, w: 2, h: rect.h }
    });
    collectChartSplitSeparators(node.first, { x: rect.x, y: rect.y, w: firstW, h: rect.h }, [...path, 0], out);
    collectChartSplitSeparators(
      node.second,
      { x: rect.x + firstW, y: rect.y, w: secondW, h: rect.h },
      [...path, 1],
      out
    );
    return;
  }

  const firstH = Math.floor(rect.h * ratio);
  const secondH = rect.h - firstH;
  out.push({
    path,
    direction: node.direction,
    rect: { x: rect.x, y: rect.y + firstH - 1, w: rect.w, h: 2 }
  });
  collectChartSplitSeparators(node.first, { x: rect.x, y: rect.y, w: rect.w, h: firstH }, [...path, 0], out);
  collectChartSplitSeparators(
    node.second,
    { x: rect.x, y: rect.y + firstH, w: rect.w, h: secondH },
    [...path, 1],
    out
  );
}

function chartPaneAtPoint(
  node: WorkspaceChartSplitNode,
  rect: LayoutRect,
  x: number,
  y: number
): string | null {
  if (x < rect.x || x > rect.x + rect.w || y < rect.y || y > rect.y + rect.h) {
    return null;
  }
  if (node.type === "leaf") {
    return node.chartPaneId;
  }
  const ratio = Math.max(0.1, Math.min(0.9, node.ratio));
  if (node.direction === "horizontal") {
    const firstW = Math.floor(rect.w * ratio);
    const firstRect: LayoutRect = { x: rect.x, y: rect.y, w: firstW, h: rect.h };
    const secondRect: LayoutRect = { x: rect.x + firstW, y: rect.y, w: rect.w - firstW, h: rect.h };
    return chartPaneAtPoint(node.first, firstRect, x, y) ?? chartPaneAtPoint(node.second, secondRect, x, y);
  }
  const firstH = Math.floor(rect.h * ratio);
  const firstRect: LayoutRect = { x: rect.x, y: rect.y, w: rect.w, h: firstH };
  const secondRect: LayoutRect = { x: rect.x, y: rect.y + firstH, w: rect.w, h: rect.h - firstH };
  return chartPaneAtPoint(node.first, firstRect, x, y) ?? chartPaneAtPoint(node.second, secondRect, x, y);
}

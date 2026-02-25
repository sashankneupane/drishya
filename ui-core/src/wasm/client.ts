import type {
  Candle,
  ObjectTreeState,
  PaneLayout,
  PaneLayoutSnapshot,
  WasmChartLike
} from "./contracts";

import type { ObjectTreeAction } from "../chrome/objectTree";

const EMPTY_OBJECT_TREE: ObjectTreeState = {
  panes: [],
  series: [],
  drawings: []
};

export class DrishyaChartClient {
  constructor(private readonly wasm: WasmChartLike) {}

  raw(): WasmChartLike {
    return this.wasm;
  }

  resize(width: number, height: number): void {
    this.wasm.resize(width, height);
  }

  draw(): void {
    this.wasm.draw();
  }

  setCandles(candles: Candle[]): void {
    this.wasm.set_ohlcv_json(JSON.stringify(candles));
  }

  appendCandle(candle: Candle): void {
    this.wasm.append_ohlcv_json?.(JSON.stringify(candle));
  }

  pan(dx: number): void {
    this.wasm.pan_pixels(dx);
  }

  pan2d(dx: number, dy: number, anchorY: number): void {
    if (typeof this.wasm.pan_pixels_2d === "function") {
      this.wasm.pan_pixels_2d(dx, dy, anchorY);
      return;
    }
    this.wasm.pan_pixels(dx);
  }

  zoomX(anchorX: number, zoomFactor: number): void {
    this.wasm.zoom_at_x(anchorX, zoomFactor);
  }

  zoomY(anchorY: number, zoomFactor: number): void {
    this.wasm.zoom_y_axis_at?.(anchorY, zoomFactor);
  }

  setCrosshair(x: number, y: number): void {
    this.wasm.set_crosshair_at?.(x, y);
  }

  clearCrosshair(): void {
    this.wasm.clear_crosshair?.();
  }

  setTheme(theme: string): void {
    this.wasm.set_theme?.(theme);
  }

  setDrawingTool(mode: string): void {
    this.wasm.set_drawing_tool_mode?.(mode);
  }

  drawingToolMode(): string {
    return this.wasm.drawing_tool_mode?.() ?? "select";
  }

  drawingPointerDown(x: number, y: number): boolean {
    return this.wasm.drawing_pointer_down?.(x, y) ?? false;
  }

  drawingPointerMove(x: number, y: number): boolean {
    return this.wasm.drawing_pointer_move?.(x, y) ?? false;
  }

  drawingPointerUp(x: number, y: number): boolean {
    return this.wasm.drawing_pointer_up?.(x, y) ?? false;
  }

  drawingCursorHint(x: number, y: number): string {
    return this.wasm.drawing_cursor_hint?.(x, y) ?? "default";
  }

  clearDrawings(): void {
    this.wasm.clear_drawings?.();
  }

  addSmaOverlay(period: number): void {
    this.wasm.add_sma_overlay?.(period);
  }

  addBbandsOverlay(period: number, stdMult: number): void {
    this.wasm.add_bbands_overlay?.(period, stdMult);
  }

  addRsiPaneIndicator(period: number): void {
    this.wasm.add_rsi_pane_indicator?.(period);
  }

  addMomentumHistogramOverlay(): void {
    this.wasm.add_momentum_histogram_overlay?.();
  }

  clearIndicatorOverlays(): void {
    this.wasm.clear_indicator_overlays?.();
  }

  setPaneWeights(weightMap: Record<string, number>): void {
    this.wasm.set_pane_weights_json?.(JSON.stringify(weightMap));
  }

  paneLayouts(): PaneLayout[] {
    const raw = this.wasm.pane_layouts_json?.();
    if (!raw) return [];
    const parsed = safeJsonParse<PaneLayoutSnapshot>(raw);
    return Array.isArray(parsed?.panes) ? parsed.panes : [];
  }

  objectTreeState(): ObjectTreeState {
    const raw = this.wasm.object_tree_state_json?.();
    if (!raw) return EMPTY_OBJECT_TREE;
    const parsed = safeJsonParse<ObjectTreeState>(raw);
    if (!parsed) return EMPTY_OBJECT_TREE;
    return {
      panes: Array.isArray(parsed.panes) ? parsed.panes : [],
      series: Array.isArray(parsed.series) ? parsed.series : [],
      drawings: Array.isArray(parsed.drawings) ? parsed.drawings : []
    };
  }

  applyObjectTreeAction(action: ObjectTreeAction): void {
    if (action.kind === "pane") {
      this.wasm.set_pane_visible?.(action.id, action.visible);
      return;
    }

    if (action.kind === "series") {
      if (action.type === "delete") {
        this.wasm.delete_series?.(action.id);
      } else {
        this.wasm.set_series_visible?.(action.id, action.visible);
      }
      return;
    }

    if (action.kind === "drawing") {
      const drawingId = Number(action.id);
      if (!Number.isFinite(drawingId)) return;
      if (action.type === "delete") {
        this.wasm.remove_drawing?.(drawingId);
      } else {
        this.wasm.set_drawing_visible?.(drawingId, action.visible);
      }
    }
  }
}

function safeJsonParse<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

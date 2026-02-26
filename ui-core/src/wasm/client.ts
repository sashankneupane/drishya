import type {
  Candle,
  ChartAppearanceConfig,
  DrawingConfig,
  ObjectTreeState,
  PaneLayout,
  PaneLayoutSnapshot,
  WasmChartLike
} from "./contracts";

import type { ObjectTreeAction } from "../chrome/objectTree.js";

const EMPTY_OBJECT_TREE: ObjectTreeState = {
  panes: [],
  series: [],
  drawings: []
};

export class DrishyaChartClient {
  constructor(private readonly wasm: WasmChartLike) { }

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

  setCursorMode(mode: string): void {
    this.wasm.set_cursor_mode?.(mode);
  }

  cursorMode(): string {
    return this.wasm.cursor_mode?.() ?? "crosshair";
  }

  setTheme(theme: string): void {
    this.wasm.set_theme?.(theme);
  }

  setAppearanceConfig(config: ChartAppearanceConfig): void {
    this.wasm.set_appearance_config?.(JSON.stringify(config));
  }

  getAppearanceConfig(): ChartAppearanceConfig | null {
    const raw = this.wasm.appearance_config?.();
    if (!raw) return null;
    try {
      return JSON.parse(raw) as ChartAppearanceConfig;
    } catch {
      return null;
    }
  }

  setCandleStyle(style: "solid" | "hollow" | "bars" | "volume"): void {
    this.wasm.set_candle_style?.(style);
  }

  candleStyle(): string {
    return this.wasm.candle_style?.() ?? "solid";
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

  selectDrawingAt(x: number, y: number): number | null {
    const selected = this.wasm.select_drawing_at?.(x, y);
    return Number.isFinite(selected) ? (selected as number) : null;
  }

  selectedDrawingId(): number | null {
    const selected = this.wasm.selected_drawing_id?.();
    if (selected === undefined || selected === null) return null;
    const n = typeof selected === "bigint" ? Number(selected) : selected;
    return Number.isFinite(n) && Number.isSafeInteger(n) ? n : null;
  }

  clearSelectedDrawing(): void {
    this.wasm.clear_selected_drawing?.();
  }

  deleteSelectedDrawing(): boolean {
    return this.wasm.delete_selected_drawing?.() ?? false;
  }

  selectSeriesAt(x: number, y: number): string | null {
    const selected = this.wasm.select_series_at?.(x, y);
    return typeof selected === "string" && selected.length > 0 ? selected : null;
  }

  selectedSeriesId(): string | null {
    const selected = this.wasm.selected_series_id?.();
    return typeof selected === "string" && selected.length > 0 ? selected : null;
  }

  clearSelectedSeries(): void {
    this.wasm.clear_selected_series?.();
  }

  deleteSelectedSeries(): boolean {
    return this.wasm.delete_selected_series?.() ?? false;
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

  getPaneStateJson(): string | null {
    return this.wasm.pane_state_json?.() ?? null;
  }

  restorePaneStateJson(json: string): void {
    this.wasm.restore_pane_state_json?.(json);
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

  getDrawingConfig(drawingId: number): DrawingConfig | null {
    const id = Number.isSafeInteger(drawingId) ? BigInt(drawingId) : BigInt(0);
    const raw = this.wasm.drawing_config?.(id);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as DrawingConfig;
      return {
        stroke_color: parsed.stroke_color ?? null,
        fill_color: parsed.fill_color ?? null,
        fill_opacity: parsed.fill_opacity ?? null,
        stroke_width: parsed.stroke_width ?? null,
        stroke_type: parsed.stroke_type ?? "solid",
        locked: !!parsed.locked,
        supports_fill: !!parsed.supports_fill
      };
    } catch {
      return null;
    }
  }

  setDrawingConfig(drawingId: number, config: Partial<DrawingConfig>): void {
    const id = Number.isSafeInteger(drawingId) ? BigInt(drawingId) : BigInt(0);
    const payload: Record<string, unknown> = {};
    if (config.stroke_color !== undefined) payload.stroke_color = config.stroke_color || null;
    if (config.fill_color !== undefined) payload.fill_color = config.fill_color || null;
    if (config.fill_opacity !== undefined) payload.fill_opacity = config.fill_opacity;
    if (config.stroke_width !== undefined) payload.stroke_width = config.stroke_width;
    if (config.stroke_type !== undefined) payload.stroke_type = config.stroke_type ?? null;
    if (config.locked !== undefined) payload.locked = config.locked;
    this.wasm.set_drawing_config?.(id, JSON.stringify(payload));
  }

  getSelectedDrawingConfig(): DrawingConfig | null {
    const raw = this.wasm.selected_drawing_config?.();
    if (!raw || raw === "{}") return null;
    try {
      const parsed = JSON.parse(raw) as DrawingConfig;
      return {
        stroke_color: parsed.stroke_color ?? null,
        fill_color: parsed.fill_color ?? null,
        fill_opacity: parsed.fill_opacity ?? null,
        stroke_width: parsed.stroke_width ?? null,
        stroke_type: parsed.stroke_type ?? "solid",
        locked: !!parsed.locked,
        supports_fill: !!parsed.supports_fill
      };
    } catch {
      return null;
    }
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

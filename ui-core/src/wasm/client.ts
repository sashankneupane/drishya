import type {
  Candle,
  ChartStateSnapshot,
  ChartAppearanceConfig,
  ChartEvent,
  DrawingConfig,
  ObjectTreeState,
  PaneLayout,
  PaneLayoutSnapshot,
  ChartPaneViewport,
  ReplayState,
  RestoreChartStateOptions,
  WasmChartLike,
  CrosshairSyncSnapshotDto
} from "./contracts";

import type { ObjectTreeAction } from "../chrome/objectTree.js";

const EMPTY_OBJECT_TREE: ObjectTreeState = {
  panes: [],
  series: [],
  layers: [],
  groups: [],
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

  setCrosshairTimestamp(timestamp: number, y: number): boolean {
    return this.wasm.set_crosshair_at_timestamp?.(timestamp, y) ?? false;
  }

  clearCrosshair(): void {
    this.wasm.clear_crosshair?.();
  }

  crosshairSyncSnapshot(): CrosshairSyncSnapshotDto | null {
    const raw = this.wasm.crosshair_sync_snapshot_json?.();
    if (!raw) return null;
    return safeJsonParse<CrosshairSyncSnapshotDto>(raw);
  }

  setCursorMode(mode: string): void {
    this.wasm.set_cursor_mode?.(mode);
  }

  cursorMode(): string {
    return this.wasm.cursor_mode?.() ?? "crosshair";
  }

  setPriceAxisMode(mode: "linear" | "log" | "percent"): void {
    this.wasm.set_price_axis_mode?.(mode);
  }

  setEvents(events: ChartEvent[]): void {
    this.wasm.set_events_json?.(JSON.stringify(events));
  }

  clearEvents(): void {
    this.wasm.clear_events?.();
  }

  selectEventAt(x: number, y: number): string | null {
    const id = this.wasm.select_event_at?.(x, y);
    return typeof id === "string" && id.length > 0 ? id : null;
  }

  selectedEvent(): ChartEvent | null {
    const raw = this.wasm.selected_event_json?.();
    if (!raw) return null;
    const parsed = safeJsonParse<ChartEvent | null>(raw);
    return parsed ?? null;
  }

  replayPlay(): void {
    this.wasm.replay_play?.();
  }

  replayPause(): void {
    this.wasm.replay_pause?.();
  }

  replayStop(): void {
    this.wasm.replay_stop?.();
  }

  replayStepBar(): number | null {
    const ts = this.wasm.replay_step_bar?.();
    return Number.isFinite(ts) ? (ts as number) : null;
  }

  replayStepEvent(): number | null {
    const ts = this.wasm.replay_step_event?.();
    return Number.isFinite(ts) ? (ts as number) : null;
  }

  replaySeekTs(ts: number): void {
    this.wasm.replay_seek_ts?.(ts);
  }

  replayTick(): number | null {
    const ts = this.wasm.replay_tick?.();
    return Number.isFinite(ts) ? (ts as number) : null;
  }

  replayState(): ReplayState {
    const raw = this.wasm.replay_state_json?.();
    const parsed = raw ? safeJsonParse<ReplayState>(raw) : null;
    return {
      playing: !!parsed?.playing,
      cursor_ts: typeof parsed?.cursor_ts === "number" ? parsed.cursor_ts : null
    };
  }

  priceAxisMode(): string {
    return this.wasm.price_axis_mode?.() ?? "linear";
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

  addEmaOverlay(period: number): void {
    this.wasm.add_ema_overlay?.(period);
  }

  addBbandsOverlay(period: number, stdMult: number): void {
    this.wasm.add_bbands_overlay?.(period, stdMult);
  }

  addMacdPaneIndicator(fast: number, slow: number, signal: number): void {
    this.wasm.add_macd_pane_indicator?.(fast, slow, signal);
  }

  addRsiPaneIndicator(period: number): void {
    this.wasm.add_rsi_pane_indicator?.(period);
  }

  addAtrPaneIndicator(period: number): void {
    this.wasm.add_atr_pane_indicator?.(period);
  }

  addStochasticPaneIndicator(k: number, d: number, smooth: number): void {
    this.wasm.add_stochastic_pane_indicator?.(k, d, smooth);
  }

  addObvPaneIndicator(): void {
    this.wasm.add_obv_pane_indicator?.();
  }

  addVwapOverlay(): void {
    this.wasm.add_vwap_overlay?.();
  }

  addAdxPaneIndicator(period: number): void {
    this.wasm.add_adx_pane_indicator?.(period);
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

  setChartPaneViewports(viewports: Record<string, ChartPaneViewport>): void {
    this.wasm.set_chart_pane_viewports_json?.(JSON.stringify(viewports));
  }

  chartPaneViewports(): Record<string, ChartPaneViewport> {
    const raw = this.wasm.chart_pane_viewports_json?.();
    if (!raw) return {};
    return safeJsonParse<Record<string, ChartPaneViewport>>(raw) ?? {};
  }

  setPaneChartPaneMap(mapping: Record<string, string>): void {
    this.wasm.set_pane_chart_pane_map_json?.(JSON.stringify(mapping));
  }

  setReadoutSourceLabel(label: string): void {
    this.wasm.set_readout_source_label?.(label);
  }

  sourceReadoutHitTest(x: number, y: number): boolean {
    return this.wasm.source_readout_hit_test?.(x, y) ?? false;
  }

  paneChartPaneMap(): Record<string, string> {
    const raw = this.wasm.pane_chart_pane_map_json?.();
    if (!raw) return {};
    return safeJsonParse<Record<string, string>>(raw) ?? {};
  }

  getPaneStateJson(): string | null {
    return this.wasm.pane_state_json?.() ?? null;
  }

  restorePaneStateJson(json: string): void {
    this.wasm.restore_pane_state_json?.(json);
  }

  exportChartState(): ChartStateSnapshot {
    // Consumer usage:
    // const snapshot = client.exportChartState()
    // localStorage.setItem("chart:snapshot", JSON.stringify(snapshot))
    const raw = this.wasm.chart_state_snapshot_json?.();
    const parsed = raw ? safeJsonParse<ChartStateSnapshot>(raw) : null;
    if (!parsed) {
      throw new Error("WASM persistence export is unavailable or returned invalid JSON");
    }
    return parsed;
  }

  importChartState(snapshot: ChartStateSnapshot): void {
    // Consumer usage:
    // const raw = localStorage.getItem("chart:snapshot")
    // if (raw) client.importChartState(JSON.parse(raw))
    this.wasm.restore_chart_state_json?.(JSON.stringify(snapshot));
  }

  importChartStateJson(json: string): void {
    this.wasm.restore_chart_state_json?.(json);
  }

  importChartStatePartial(snapshot: ChartStateSnapshot, options: RestoreChartStateOptions): void {
    this.wasm.restore_chart_state_partial_json?.(JSON.stringify(snapshot), JSON.stringify(options));
  }

  importChartStatePartialJson(json: string, options: RestoreChartStateOptions): void {
    this.wasm.restore_chart_state_partial_json?.(json, JSON.stringify(options));
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
      layers: Array.isArray(parsed.layers) ? parsed.layers : [],
      groups: Array.isArray(parsed.groups) ? parsed.groups : [],
      drawings: Array.isArray(parsed.drawings) ? parsed.drawings : []
    };
  }

  createLayer(id: string, name: string): void {
    this.wasm.create_drawing_layer?.(id, name);
  }

  deleteLayer(id: string): void {
    this.wasm.delete_drawing_layer?.(id);
  }

  updateLayer(id: string, config: { name?: string; visible?: boolean; locked?: boolean }): void {
    this.wasm.update_drawing_layer?.(id, JSON.stringify(config));
  }

  createGroup(id: string, name: string, layerId: string, parentGroupId: string | null = null): void {
    this.wasm.create_drawing_group?.(id, name, layerId, parentGroupId);
  }

  deleteGroup(id: string): void {
    this.wasm.delete_drawing_group?.(id);
  }

  updateGroup(id: string, config: { name?: string; visible?: boolean; locked?: boolean }): void {
    this.wasm.update_drawing_group?.(id, JSON.stringify(config));
  }

  setDrawingLayer(drawingId: number, layerId: string): void {
    this.moveDrawingsToLayer([drawingId], layerId);
  }

  setDrawingGroup(drawingId: number, groupId: string | null): void {
    this.moveDrawingsToGroup([drawingId], groupId);
  }

  moveDrawingsToGroup(ids: number[], groupId: string | null): void {
    this.wasm.move_drawings_to_group?.(JSON.stringify(ids), groupId);
  }

  moveDrawingsToLayer(ids: number[], layerId: string): void {
    this.wasm.move_drawings_to_layer?.(JSON.stringify(ids), layerId);
  }

  setLayerOrder(order: string[]): void {
    this.wasm.set_drawing_layer_order_json?.(JSON.stringify(order));
  }

  getLayerOrder(): string[] {
    const raw = this.wasm.drawing_layer_order_json?.();
    if (!raw) return [];
    return safeJsonParse<string[]>(raw) || [];
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
        font_size: parsed.font_size ?? null,
        text_content: parsed.text_content ?? null,
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
    if (config.font_size !== undefined) payload.font_size = config.font_size;
    if (config.text_content !== undefined) payload.text_content = config.text_content ?? "";
    if (config.locked !== undefined) payload.locked = config.locked;
    this.wasm.set_drawing_config?.(id, JSON.stringify(payload));
  }

  selectedTextCaretBounds(): { x: number; y: number; height: number; color: string } | null {
    const raw = this.wasm.selected_text_caret_bounds?.();
    if (!raw || raw === "null") return null;
    try {
      const parsed = JSON.parse(raw) as { x: number; y: number; height: number; color: string };
      if (typeof parsed.x !== "number" || typeof parsed.y !== "number") return null;
      return {
        x: parsed.x,
        y: parsed.y,
        height: parsed.height ?? 14,
        color: parsed.color ?? "#e5e7eb"
      };
    } catch {
      return null;
    }
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
        font_size: parsed.font_size ?? null,
        text_content: parsed.text_content ?? null,
        locked: !!parsed.locked,
        supports_fill: !!parsed.supports_fill
      };
    } catch {
      return null;
    }
  }

  setLayerVisible(id: string, visible: boolean): void {
    this.updateLayer(id, { visible });
  }

  setGroupVisible(id: string, visible: boolean): void {
    this.updateGroup(id, { visible });
  }

  applyObjectTreeAction(action: ObjectTreeAction): void {
    if (action.kind === "pane") {
      this.wasm.set_pane_visible?.(action.id, action.visible);
      return;
    }

    if (action.kind === "series") {
      const isCompare = action.id.startsWith("compare-");
      if (action.type === "delete") {
        if (isCompare) {
          this.wasm.remove_compare_series?.(action.id);
        } else {
          this.wasm.delete_series?.(action.id);
        }
      } else {
        if (isCompare) {
          this.wasm.set_compare_series_visible?.(action.id, action.visible);
        } else {
          this.wasm.set_series_visible?.(action.id, action.visible);
        }
      }
      return;
    }

    if (action.kind === "drawing") {
      const idStr = action.id;
      if (action.type === "delete") {
        if (this.wasm.delete_drawings) {
          this.wasm.delete_drawings(JSON.stringify([Number(idStr)]));
        } else {
          this.wasm.remove_drawing?.(BigInt(idStr));
        }
      } else {
        this.wasm.set_drawing_visible?.(BigInt(idStr), !!action.visible);
      }
      return;
    }

    if (action.kind === "layer") {
      if (action.type === "toggle_visibility") {
        this.setLayerVisible(action.id, !!action.visible);
      } else if (action.type === "delete") {
        this.deleteLayer(action.id);
      }
      return;
    }

    if (action.kind === "group") {
      if (action.type === "toggle_visibility") {
        this.setGroupVisible(action.id, !!action.visible);
      } else if (action.type === "delete") {
        this.deleteGroup(action.id);
      }
      return;
    }
  }

  registerCompareSeries(symbol: string, name: string, color: string): string {
    return this.wasm.register_compare_series?.(symbol, name, color) ?? "";
  }

  removeCompareSeries(id: string): boolean {
    return this.wasm.remove_compare_series?.(id) ?? false;
  }

  setCompareSeriesVisible(id: string, visible: boolean): boolean {
    return this.wasm.set_compare_series_visible?.(id, visible) ?? false;
  }

  setCompareSeriesCandles(seriesId: string, candles: Candle[]): void {
    this.wasm.set_compare_series_ohlcv_json?.(seriesId, JSON.stringify(candles));
  }
}

function safeJsonParse<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

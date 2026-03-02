export interface Candle {
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type ChartEventKind = "signal" | "entry" | "exit" | "stop" | "target" | "reject";
export type ChartEventSide = "long" | "short";

export interface ChartEvent {
  event_id: string;
  ts: number;
  kind: ChartEventKind;
  side?: ChartEventSide;
  price?: number;
  text?: string;
  meta?: Record<string, unknown>;
}

export interface ReplayState {
  playing: boolean;
  cursor_ts: number | null;
}

export interface IndicatorStyleDefault {
  color: string;
  width: number | null;
  opacity: number | null;
  pattern: "solid" | "dashed" | "dotted" | null;
}

export interface IndicatorStyleSlot {
  slot: string;
  kind: "stroke" | "fill";
  default: IndicatorStyleDefault;
}

export interface IndicatorOutputVisual {
  output: string;
  primitive: "line" | "histogram" | "band_fill" | "markers" | "signal_flag";
  style_slot: string;
  z_index: number;
}

export interface IndicatorVisualHint {
  pane_hint: "price_overlay" | "separate_pane" | "volume_overlay" | "auto";
  scale_group: "price" | "oscillator" | "volume" | "normalized" | "binary";
  output_visuals: IndicatorOutputVisual[];
  style_slots: IndicatorStyleSlot[];
}

export interface DiscoveredIndicator {
  id: string;
  display_name: string;
  category: string;
  runtime_binding: string;
  params: Array<{
    name: string;
    kind: string;
    required: boolean;
  }>;
  outputs: string[];
  visual: IndicatorVisualHint;
}

export interface SeriesStyleOverride {
  stroke_color?: string | null;
  stroke_width?: number | null;
  stroke_pattern?: "solid" | "dashed" | "dotted" | null;
  fill_color?: string | null;
  fill_opacity?: number | null;
  histogram_positive_color?: string | null;
  histogram_negative_color?: string | null;
  histogram_width_factor?: number | null;
  marker_color?: string | null;
  marker_size?: number | null;
}

export interface SeriesStyleSnapshot {
  series_id: string;
  series_name: string;
  pane_id: string;
  primitive_types: string[];
  stroke_color?: string | null;
  stroke_width?: number | null;
  stroke_pattern?: string | null;
  fill_color?: string | null;
  fill_opacity?: number | null;
  histogram_positive_color?: string | null;
  histogram_negative_color?: string | null;
  histogram_width_factor?: number | null;
  marker_color?: string | null;
  marker_size?: number | null;
}

/** User-customizable chart appearance (background, candle up/down). */
export interface ChartAppearanceConfig {
  background: string;
  candle_up: string;
  candle_down: string;
}

export type StrokeType = "solid" | "dotted" | "dashed";

/** Per-drawing style and lock config (stroke/fill colors, opacity, stroke width, stroke type, locked). */
export interface DrawingConfig {
  stroke_color: string | null;
  fill_color: string | null;
  fill_opacity: number | null;
  stroke_width: number | null;
  stroke_type?: StrokeType | null;
  font_size?: number | null;
  text_content?: string | null;
  locked: boolean;
  supports_fill: boolean;
}

export interface PaneLayout {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  yAxisVisible: boolean;
}

export interface PaneLayoutSnapshot {
  panes: PaneLayout[];
}

export interface ChartPaneViewport {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CrosshairPaneReadoutDto {
  pane_id: string;
  value: number;
}

export interface ReadoutIndicatorSnapshot {
  id: string;
  name: string;
  pane_id: string;
  value: number;
  visible: boolean;
}

export interface ReadoutSnapshot {
  source_label: string;
  ohlcv: {
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  } | null;
  indicators: ReadoutIndicatorSnapshot[];
}

export interface PaneTreeState {
  id: string;
  visible: boolean;
}

export interface SeriesTreeState {
  id: string;
  name: string;
  pane_id: string;
  visible: boolean;
  deleted: boolean;
}

export interface DrawingTreeState {
  id: number;
  kind: string;
  layer_id: string;
  group_id: string | null;
  visible: boolean;
  locked: boolean;
}

export interface LayerTreeState {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  order: number;
}

export interface GroupTreeState {
  id: string;
  name: string;
  layer_id: string;
  parent_group_id: string | null;
  visible: boolean;
  locked: boolean;
  order: number;
}

export interface ObjectTreeState {
  panes: PaneTreeState[];
  series: SeriesTreeState[];
  layers: LayerTreeState[];
  groups: GroupTreeState[];
  drawings: DrawingTreeState[];
}

/**
 * Beta chart state snapshot contract.
 *
 * Compatibility policy for beta:
 * - Existing field names are stable.
 * - New optional fields can be added.
 * - Removing/renaming existing fields is breaking.
 */
export interface ChartStateSnapshot {
  saved_at_unix_ms: number;
  chart_state: ChartStateContract;
}

export interface ChartStateContract {
  viewport: ViewportSnapshot;
  panes: PanesSnapshot;
  appearance: AppearanceSnapshot;
  drawings: DrawingSnapshot[];
  object_tree: ObjectTreeState;
  selection?: SelectionSnapshot | null;
}

export interface ViewportSnapshot {
  world_start_x: number;
  world_end_x: number;
  y_zoom_factor?: number | null;
  y_pan_offset?: number | null;
}

export interface PanesSnapshot {
  order: string[];
  panes: PaneSnapshot[];
}

export interface PaneSnapshot {
  id: string;
  visible: boolean;
  weight: number;
  collapsed: boolean;
  y_axis_visible: boolean;
  min_height_px?: number | null;
  max_height_px?: number | null;
}

export interface AppearanceSnapshot {
  theme: string;
  config: Record<string, unknown>;
}

export interface DrawingSnapshot {
  id: number;
  kind: string;
  geometry: Record<string, unknown>;
  style: Record<string, unknown>;
  layer_id: string;
  group_id?: string | null;
  visible: boolean;
  locked: boolean;
}

export interface SelectionSnapshot {
  selected_drawing_id?: number | null;
  tool_mode?: string | null;
  cursor_mode?: string | null;
}

export interface RestoreChartStateOptions {
  appearance?: boolean;
  panes?: boolean;
  viewport?: boolean;
  drawings?: boolean;
  selection?: boolean;
}

export type CursorMode = "crosshair" | "dot" | "normal";

export interface WasmChartLike {
  // Group A: Data + Viewport
  resize(width: number, height: number): void;
  draw(): void;
  set_ohlcv_json(json: string): void;
  append_ohlcv_json?(json: string): void;
  append_ohlcv_batch_json?(json: string): void;

  // Group B: Navigation
  pan_pixels(dx: number): void;
  pan_pixels_2d?(dx: number, dy: number, anchorY: number): void;
  zoom_at_x(x: number, zoomFactor: number): void;
  zoom_y_axis_at?(y: number, zoomFactor: number): void;
  reset_y_axis_zoom?(paneId: string): void;
  set_crosshair_at?(x: number, y: number): void;
  clear_crosshair?(): void;
  set_price_axis_mode?(mode: string): void;
  price_axis_mode?(): string;

  // Group C: Appearance
  set_theme?(theme: string): void;
  set_appearance_config?(json: string): void;
  appearance_config?(): string;
  set_candle_style?(style: "solid" | "hollow" | "bars" | "volume" | string): void;
  candle_style?(): string;
  set_cursor_mode?(mode: string): void;
  cursor_mode?(): string;

  // Group D: Drawings
  set_drawing_tool_mode?(mode: string): void;
  drawing_tool_mode?(): string;
  drawing_pointer_down?(x: number, y: number): boolean;
  drawing_pointer_move?(x: number, y: number): boolean;
  drawing_pointer_up?(x: number, y: number): boolean;
  drawing_cursor_hint?(x: number, y: number): string;
  cancel_drawing_interaction?(): void;
  select_drawing_at?(x: number, y: number): number | undefined;
  selected_drawing_id?(): number | undefined;
  select_drawing_by_id?(drawingId: number | bigint): boolean;
  clear_selected_drawing?(): void;
  delete_selected_drawing?(): boolean;
  drawing_config?(drawingId: number | bigint): string;
  set_drawing_config?(drawingId: number | bigint, json: string): void;
  selected_drawing_config?(): string;
  selected_text_caret_bounds?(): string;

  set_drawing_visible?(drawingId: number | bigint, visible: boolean): boolean;
  remove_drawing?(drawingId: number | bigint): boolean;
  clear_drawings?(): void;
  hit_test_drawings_json?(x: number, y: number, mode: string): string;
  hit_test_drawings_with_tolerance_json?(
    x: number,
    y: number,
    mode: string,
    hoverTolerancePx: number,
    selectTolerancePx: number,
    dragTolerancePx: number
  ): string;

  // Group H: Built-in indicators (generic API only)
  clear_indicator_overlays?(): void;
  indicator_catalog_json?(): string;
  add_indicator_json?(indicatorId: string, paramsJson: string): void;

  // Group F: Panes + Series
  set_pane_weight?(paneId: string, ratio: number): void;
  set_pane_weights_json?(json: string): void;
  set_chart_pane_viewports_json?(json: string): void;
  chart_pane_viewports_json?(): string;
  set_pane_chart_pane_map_json?(json: string): void;
  pane_chart_pane_map_json?(): string;
  set_readout_source_label?(label: string): void;
  source_readout_hit_test?(x: number, y: number): boolean;
  readout_snapshot_json?(): string;
  reset_pane_weights?(): void;
  set_pane_visible?(paneId: string, visible: boolean): void;
  register_pane?(paneId: string): void;
  unregister_pane?(paneId: string): void;
  registered_panes_json?(): string;
  set_pane_collapsed?(paneId: string, collapsed: boolean): void;
  set_pane_y_axis_visible?(paneId: string, visible: boolean): void;
  set_pane_height_constraints?(paneId: string, minHeightPx: number, maxHeightPx: number): void;
  move_pane_up?(paneId: string): boolean;
  move_pane_down?(paneId: string): boolean;
  set_pane_order_json?(json: string): void;
  pane_state_json?(): string;
  restore_pane_state_json?(json: string): void;
  reset_pane_layout_state?(): void;
  pane_layouts_json?(): string;
  set_series_visible?(seriesId: string, visible: boolean): void;
  series_style_snapshot_json?(): string;
  series_style_override_json?(seriesId: string): string;
  set_series_style_override_json?(seriesId: string, json: string): void;
  clear_series_style_override?(seriesId: string): void;
  all_series_style_overrides_json?(): string;
  replace_series_style_overrides_json?(json: string): void;
  patch_series_style_overrides_json?(json: string): void;
  delete_series?(seriesId: string): void;
  restore_series?(seriesId: string): void;
  select_series_at?(x: number, y: number): string | undefined;
  selected_series_id?(): string | undefined;
  clear_selected_series?(): void;
  delete_selected_series?(): boolean;

  // Group E: Layers + Groups
  create_drawing_layer?(id: string, name: string): void;
  delete_drawing_layer?(id: string): void;
  update_drawing_layer?(id: string, json: string): void;
  create_drawing_group?(id: string, name: string, layer_id: string, parent_group_id: string | null): void;
  delete_drawing_group?(id: string): void;
  update_drawing_group?(id: string, json: string): void;
  set_drawing_layer?(drawingId: number, layerId: string): boolean;
  set_drawing_group?(drawingId: number, groupId: string): boolean;
  set_drawing_group_visible?(groupId: string, visible: boolean): void;
  set_drawing_layer_visible?(layerId: string, visible: boolean): void;
  set_drawing_layer_order_json?(json: string): void;
  drawing_layer_order_json?(): string;
  move_drawings_to_group?(idsJson: string, groupId: string | null): void;
  move_drawings_to_layer?(idsJson: string, layerId: string): void;
  delete_drawings?(idsJson: string): void;

  // Group G: Tree Query
  object_tree_state_json?(): string;

  // Group I: Persistence
  chart_state_snapshot_json?(): string;
  restore_chart_state_json?(json: string): void;
  restore_chart_state_partial_json?(json: string, optionsJson: string): void;

  // Group J: Multi-Symbol Compare
  register_compare_series?(symbol: string, name: string, color: string): string;
  remove_compare_series?(id: string): boolean;
  set_compare_series_visible?(id: string, visible: boolean): boolean;
  set_compare_series_ohlcv_json?(seriesId: string, json: string): void;

  // Group K: Events + Replay
  set_events_json?(json: string): void;
  clear_events?(): void;
  select_event_at?(x: number, y: number): string | undefined;
  selected_event_json?(): string;
  replay_play?(): void;
  replay_pause?(): void;
  replay_stop?(): void;
  replay_step_bar?(): number | undefined;
  replay_step_event?(): number | undefined;
  replay_seek_ts?(ts: number): void;
  replay_tick?(): number | undefined;
  replay_state_json?(): string;
}

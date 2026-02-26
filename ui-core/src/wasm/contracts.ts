export interface Candle {
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
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

export type CursorMode = "crosshair" | "dot" | "normal";

export interface WasmChartLike {
  resize(width: number, height: number): void;
  draw(): void;
  set_ohlcv_json(json: string): void;
  append_ohlcv_json?(json: string): void;
  pan_pixels(dx: number): void;
  pan_pixels_2d?(dx: number, dy: number, anchorY: number): void;
  zoom_at_x(x: number, zoomFactor: number): void;
  zoom_y_axis_at?(y: number, zoomFactor: number): void;
  reset_y_axis_zoom?(paneId: string): void;
  set_theme?(theme: string): void;
  set_appearance_config?(json: string): void;
  appearance_config?(): string;
  set_candle_style?(style: "solid" | "hollow" | "bars" | "volume" | string): void;
  candle_style?(): string;
  set_crosshair_at?(x: number, y: number): void;
  clear_crosshair?(): void;
  set_cursor_mode?(mode: string): void;
  cursor_mode?(): string;
  clear_drawings?(): void;
  set_drawing_tool_mode?(mode: string): void;
  drawing_tool_mode?(): string;
  drawing_pointer_down?(x: number, y: number): boolean;
  drawing_pointer_move?(x: number, y: number): boolean;
  drawing_pointer_up?(x: number, y: number): boolean;
  drawing_cursor_hint?(x: number, y: number): string;
  cancel_drawing_interaction?(): void;
  select_drawing_at?(x: number, y: number): number | undefined;
  selected_drawing_id?(): number | undefined;
  clear_selected_drawing?(): void;
  delete_selected_drawing?(): boolean;
  drawing_config?(drawingId: number | bigint): string;
  set_drawing_config?(drawingId: number | bigint, json: string): void;
  selected_drawing_config?(): string;
  selected_text_caret_bounds?(): string;
  add_sma_overlay?(period: number): void;
  add_bbands_overlay?(period: number, stdMult: number): void;
  add_rsi_pane_indicator?(period: number): void;
  add_momentum_histogram_overlay?(): void;
  clear_indicator_overlays?(): void;
  set_pane_weight?(paneId: string, ratio: number): void;
  set_pane_weights_json?(json: string): void;
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
  object_tree_state_json?(): string;
  set_series_visible?(seriesId: string, visible: boolean): void;
  delete_series?(seriesId: string): void;
  restore_series?(seriesId: string): void;
  select_series_at?(x: number, y: number): string | undefined;
  selected_series_id?(): string | undefined;
  clear_selected_series?(): void;
  delete_selected_series?(): boolean;
  set_drawing_visible?(drawingId: number | bigint, visible: boolean): boolean;
  remove_drawing?(drawingId: number | bigint): boolean;
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
}

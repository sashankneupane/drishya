import type { DrawingToolId } from "./drawingTool.js";
import type { ChartAppearanceConfig, DrawingConfig, WasmChartLike } from "../../wasm/contracts.js";
import type { WorkspaceController } from "../controllers/WorkspaceController.js";
import type { ReplayController } from "../replay/ReplayController.js";
import type { ChartPaneRuntime } from "./runtimeTypes.js";

export type WorkspaceTheme = "dark" | "light";

export interface WorkspaceToolDef {
  id: string;
  hotkey: string;
  title: string;
  /**
   * When present the tool acts as a group button; children are the actual
   * selectable tools.  Only one child is active at a time.
   */
  children?: readonly WorkspaceToolDef[];
}

export interface CreateChartWorkspaceOptions {
  host: HTMLElement;
  createWasmChart: (canvasId: string, width: number, height: number) => WasmChartLike;
  initialTheme?: WorkspaceTheme;
  initialTool?: DrawingToolId;
  injectStyles?: boolean;
  /** Consumer-owned persistence lifecycle. Chart SDK emits serialized snapshots only. */
  persistence?: {
    initialState?: unknown;
    onStateChange?: (next: unknown) => void;
    debounceMs?: number;
  };
  marketControls?: {
    /**
     * Called when a specific chart pane source is changed via pane UI.
     * Downstream apps can use this to load pane-scoped OHLCV feeds.
     */
    onChartPaneSourceChange?: (
      chartPaneId: WorkspaceChartPaneId,
      next: { symbol: string; timeframe?: string }
    ) => void | Promise<void>;
    symbols: readonly string[];
    timeframes: readonly string[];
    selectedSymbol?: string;
    selectedTimeframe?: string;
    onSymbolChange?: (symbol: string) => void | Promise<void>;
    onTimeframeChange?: (timeframe: string) => void | Promise<void>;
    onCompareSymbol?: (symbol: string) => void | Promise<void>;
  };
}

/** Workspace appearance config state (mirrors wasm). */
export interface WorkspaceAppearanceState {
  config: ChartAppearanceConfig;
}

/** Selected drawing config state (shown in floating panel when a drawing is selected). */
export interface SelectedDrawingConfigState {
  drawingId: number;
  config: DrawingConfig;
}

export interface ChartWorkspaceHandle {
  root: HTMLDivElement;
  strip: HTMLElement;
  tree: HTMLElement;
  controller: WorkspaceController;
  replay: ReplayController;
  draw: () => void;
  resize: () => void;
  setTool: (toolId: DrawingToolId) => void;
  clearDrawings: () => void;
  toggleTheme: () => WorkspaceTheme;
  refreshObjectTree: () => void;
  listCharts: () => WorkspaceChartPaneId[];
  getChart: (chartPaneId: WorkspaceChartPaneId) => ChartPaneRuntime | null;
  getActiveChart: () => ChartPaneRuntime | null;
  applyAppearanceConfig?: (config: ChartAppearanceConfig) => void;
  getAppearanceConfig?: () => ChartAppearanceConfig | null;
  destroy: () => void;
}

/**
 * @deprecated Use `PaneId` from `state/schema.ts` for canonical persisted state.
 */
export type WorkspacePaneId = string;
export type WorkspaceChartPaneId = string;
/**
 * @deprecated Use `WorkspaceLayoutNode` from `state/schema.ts` for canonical persisted state.
 */
export type WorkspaceChartSplitDirection = "horizontal" | "vertical";
/**
 * @deprecated Use `TileId` from `state/schema.ts` for canonical persisted state.
 */
export type WorkspaceTileId = string;
/**
 * @deprecated Use `TileId` from `state/schema.ts` for canonical persisted state.
 */
export type WorkspaceChartTileId = string;
/**
 * @deprecated Use `TabId` from `state/schema.ts` for canonical persisted state.
 */
export type WorkspaceChartTabId = string;

/**
 * @deprecated Use `WorkspaceLayoutNode` from `state/schema.ts` for canonical persisted state.
 */
export type WorkspaceChartSplitNode =
  | {
      type: "leaf";
      chartPaneId: WorkspaceChartPaneId;
    }
  | {
      type: "split";
      direction: WorkspaceChartSplitDirection;
      ratio: number;
      first: WorkspaceChartSplitNode;
      second: WorkspaceChartSplitNode;
    };

export type WorkspacePaneKind = "price" | "chart" | "indicator" | "custom";

export interface WorkspacePaneSpec {
  id: WorkspacePaneId;
  kind: WorkspacePaneKind;
  title?: string;
  /** Indicator panes are owned by a chart/price pane for object-tree grouping. */
  parentChartPaneId?: WorkspacePaneId;
  minHeight?: number; // Minimum height in pixels
}

export interface WorkspacePaneLayoutState {
  order: WorkspacePaneId[];
  ratios: Record<WorkspacePaneId, number>; // 0.0 to 1.0, should sum to 1.0
  visibility: Record<WorkspacePaneId, boolean>; // true if visible
  collapsed: Record<WorkspacePaneId, boolean>; // true if collapsed to titlebar
  panes: Record<WorkspacePaneId, WorkspacePaneSpec>;
}

export interface WorkspaceChartPaneSpec {
  id: WorkspaceChartPaneId;
  title: string;
  visible: boolean;
}

export type WorkspaceTileKind = "chart" | "objects";

export interface WorkspaceTileSpec {
  id: WorkspaceTileId;
  kind: WorkspaceTileKind;
  title: string;
  widthRatio: number;
  chartTileId?: WorkspaceChartTileId;
}

export interface WorkspaceChartTabSpec {
  id: WorkspaceChartTabId;
  title: string;
  chartPaneId: WorkspaceChartPaneId;
}

export interface WorkspaceChartTileSpec {
  id: WorkspaceChartTileId;
  tabs: WorkspaceChartTabSpec[];
  activeTabId: WorkspaceChartTabId;
}

export interface WorkspaceCrosshairReadout {
  paneId: string;
  value: number;
}

export interface WorkspaceCrosshairState {
  x: number;
  index: number | null;
  timestamp: number | null;
  readouts: WorkspaceCrosshairReadout[];
}

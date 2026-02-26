import type { DrawingToolId } from "../toolbar/model.js";
import type { DrishyaChartClient } from "../wasm/client.js";
import type { ChartAppearanceConfig, DrawingConfig, WasmChartLike } from "../wasm/contracts.js";
import type { WorkspaceController } from "./WorkspaceController.js";
import type { ReplayController } from "./replay/ReplayController.js";

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
  /** When set, workspace state (theme, appearance, pane layout, candle style, UI state) is saved to localStorage and restored on load */
  persistKey?: string;
  marketControls?: {
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
  canvas: HTMLCanvasElement;
  chart: DrishyaChartClient;
  rawChart: WasmChartLike;
  controller: WorkspaceController;
  replay: ReplayController;
  draw: () => void;
  resize: () => void;
  setTool: (toolId: DrawingToolId) => void;
  clearDrawings: () => void;
  toggleTheme: () => WorkspaceTheme;
  refreshObjectTree: () => void;
  applyAppearanceConfig?: (config: ChartAppearanceConfig) => void;
  getAppearanceConfig?: () => ChartAppearanceConfig | null;
  destroy: () => void;
}

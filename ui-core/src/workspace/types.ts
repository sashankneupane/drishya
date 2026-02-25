import type { DrawingToolId } from "../toolbar/model";
import type { DrishyaChartClient } from "../wasm/client";
import type { WasmChartLike } from "../wasm/contracts";

export type WorkspaceTheme = "dark" | "light";

export interface WorkspaceToolDef {
  id: DrawingToolId;
  hotkey: string;
  title: string;
}

export interface CreateChartWorkspaceOptions {
  host: HTMLElement;
  createWasmChart: (canvasId: string, width: number, height: number) => WasmChartLike;
  initialTheme?: WorkspaceTheme;
  initialTool?: DrawingToolId;
}

export interface ChartWorkspaceHandle {
  root: HTMLDivElement;
  strip: HTMLElement;
  tree: HTMLElement;
  canvas: HTMLCanvasElement;
  chart: DrishyaChartClient;
  rawChart: WasmChartLike;
  draw: () => void;
  resize: () => void;
  setTool: (toolId: DrawingToolId) => void;
  clearDrawings: () => void;
  toggleTheme: () => WorkspaceTheme;
  refreshObjectTree: () => void;
  destroy: () => void;
}


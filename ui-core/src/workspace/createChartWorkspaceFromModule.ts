import type { WasmChartLike } from "../wasm/contracts.js";
import { createChartWorkspace } from "./createChartWorkspace.js";
import type {
  ChartWorkspaceHandle,
  CreateChartWorkspaceOptions,
  WorkspaceTheme,
} from "./types";
import type { DrawingToolId } from "../toolbar/model.js";

export interface DrishyaWasmModule {
  default?: () => Promise<unknown> | unknown;
  WasmChart: new (canvasId: string, width: number, height: number) => WasmChartLike;
}

export interface CreateChartWorkspaceFromModuleOptions {
  host: HTMLElement;
  loadWasmModule: () => Promise<DrishyaWasmModule>;
  initialTheme?: WorkspaceTheme;
  initialTool?: DrawingToolId;
  injectStyles?: boolean;
  marketControls?: CreateChartWorkspaceOptions["marketControls"];
}

export async function createChartWorkspaceFromModule(
  options: CreateChartWorkspaceFromModuleOptions,
): Promise<ChartWorkspaceHandle> {
  const wasmModule = await options.loadWasmModule();

  if (typeof wasmModule.default === "function") {
    await wasmModule.default();
  }

  const createWasmChart: CreateChartWorkspaceOptions["createWasmChart"] = (
    canvasId,
    width,
    height,
  ) => new wasmModule.WasmChart(canvasId, width, height);

  return createChartWorkspace({
    host: options.host,
    createWasmChart,
    initialTheme: options.initialTheme,
    initialTool: options.initialTool,
    injectStyles: options.injectStyles,
    marketControls: options.marketControls,
  });
}

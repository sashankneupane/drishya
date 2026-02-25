import type { WasmChartLike } from "../wasm/contracts";
import { createChartWorkspace } from "./createChartWorkspace";
import type {
  ChartWorkspaceHandle,
  CreateChartWorkspaceOptions,
  WorkspaceTheme,
} from "./types";
import type { DrawingToolId } from "../toolbar/model";

export interface DrishyaWasmModule {
  default?: () => Promise<unknown> | unknown;
  WasmChart: new (canvasId: string, width: number, height: number) => WasmChartLike;
}

export interface CreateChartWorkspaceFromModuleOptions {
  host: HTMLElement;
  loadWasmModule: () => Promise<DrishyaWasmModule>;
  initialTheme?: WorkspaceTheme;
  initialTool?: DrawingToolId;
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
  });
}

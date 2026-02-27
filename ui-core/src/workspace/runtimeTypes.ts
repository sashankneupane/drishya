import type { DrishyaChartClient } from "../wasm/client.js";
import type { WasmChartLike } from "../wasm/contracts.js";

export interface ChartPaneRuntime {
  paneId: string;
  container: HTMLDivElement;
  canvas: HTMLCanvasElement;
  rawChart: WasmChartLike;
  chart: DrishyaChartClient;
  draw: () => void;
  resize: (width: number, height: number) => void;
  unbindInteractions?: () => void;
}

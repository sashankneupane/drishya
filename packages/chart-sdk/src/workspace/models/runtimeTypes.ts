import type { DrishyaChartClient } from "../../wasm/client.js";
import type { WasmChartLike } from "../../wasm/contracts.js";
import type { LayoutRect } from "../../layout/splitTree.js";

export interface ChartPaneRuntime {
  runtimeKey?: string;
  chartTileId?: string;
  chartTabId?: string;
  paneId: string;
  container: HTMLDivElement;
  canvas: HTMLCanvasElement;
  viewport?: LayoutRect;
  rawChart: WasmChartLike;
  chart: DrishyaChartClient;
  draw: () => void;
  resize: (width: number, height: number) => void;
  unbindInteractions?: () => void;
}

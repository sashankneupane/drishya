import type { DrishyaChartClient } from "../../wasm/client.js";
import type { WorkspaceController } from "../controllers/WorkspaceController.js";

interface TopStripOptions {
  chart: DrishyaChartClient;
  controller: WorkspaceController;
  symbols: readonly string[];
  timeframes: readonly string[];
  selectedSymbol?: string;
  selectedTimeframe?: string;
  onSymbolChange?: (symbol: string) => void | Promise<void>;
  onTimeframeChange?: (timeframe: string) => void | Promise<void>;
  onCompareSymbol?: (symbol: string) => void | Promise<void>;
  onMutate?: () => void;
  getAppearanceConfig?: () => { background: string; candle_up: string; candle_down: string } | null;
  getCandleStyle?: () => "solid" | "hollow" | "bars" | "volume" | null;
  applyCandleStyle?: (style: "solid" | "hollow" | "bars" | "volume") => void;
  applyAppearanceConfig?: (config: { background: string; candle_up: string; candle_down: string }) => void;
  onAddChartTile?: () => void;
}

export interface TopStripHandle {
  root: HTMLElement;
  destroy: () => void;
}

export function createTopStrip(_options: TopStripOptions): TopStripHandle {
  const root = document.createElement("div");
  root.className = "hidden";

  return { root, destroy: () => { } };
}

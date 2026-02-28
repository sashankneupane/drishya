import { makeSvgIcon } from "./icons.js";
import { createConfigModal } from "./ConfigModal.js";
import type { DrishyaChartClient } from "../wasm/client.js";
import type { WorkspaceController } from "./WorkspaceController.js";

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

const BTN_MINIMAL = "h-8 flex items-center justify-center px-3 text-[11px] font-medium text-zinc-500 hover:text-zinc-100 hover:bg-zinc-900/50 transition-all cursor-pointer border-none outline-none bg-transparent select-none whitespace-nowrap";

export function createTopStrip(options: TopStripOptions): TopStripHandle {
  const root = document.createElement("div");
  root.className = "w-full h-top-strip bg-workspace-bg flex items-center justify-between border-b border-workspace-border z-40 shrink-0 select-none";
  const leftSide = document.createElement("div");
  leftSide.className = "flex items-center h-full";
  const rightSide = document.createElement("div");
  rightSide.className = "flex items-center h-full";

  const addTileBtn = document.createElement("button");
  addTileBtn.className = BTN_MINIMAL;
  addTileBtn.draggable = true;
  addTileBtn.appendChild(makeSvgIcon("plus", "h-3.5 w-3.5 mr-1.5"));
  const addTileLabel = document.createElement("span");
  addTileLabel.textContent = "Chart Tile";
  addTileBtn.appendChild(addTileLabel);
  addTileBtn.onclick = () => options.onAddChartTile?.();
  addTileBtn.ondragstart = (event) => {
    event.dataTransfer?.setData("application/x-drishya-add-chart-tile", "1");
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "copyMove";
    }
  };
  leftSide.appendChild(addTileBtn);

  const configBtn = document.createElement("button");
  configBtn.className = BTN_MINIMAL;
  configBtn.appendChild(makeSvgIcon("settings", "h-3.5 w-3.5 mr-1.5"));
  const configLabel = document.createElement("span");
  configLabel.textContent = "Settings";
  configBtn.appendChild(configLabel);
  configBtn.onclick = () => {
    const current = options.getAppearanceConfig?.() ?? {
      background: "#030712",
      candle_up: "#22c55e",
      candle_down: "#ef4444"
    };
    createConfigModal({
      initialConfig: current,
      initialCandleStyle: options.getCandleStyle?.() ?? "solid",
      onApply: (cfg, candleStyle) => {
        options.applyAppearanceConfig?.(cfg);
        options.applyCandleStyle?.(candleStyle);
        options.onMutate?.();
      },
      onClose: () => { }
    });
  };
  rightSide.appendChild(configBtn);

  root.append(leftSide, rightSide);

  return { root, destroy: () => { } };
}

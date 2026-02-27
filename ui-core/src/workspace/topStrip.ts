import { makeSvgIcon } from "./icons.js";
import { createSymbolSearchModal } from "./SymbolSearchModal.js";
import { createIndicatorModal } from "./IndicatorModal.js";
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
  onCandleTypeChange?: (type: "solid" | "hollow" | "bars" | "volume") => void;
  onLayout: () => void;
  onMutate?: () => void;
  getAppearanceConfig?: () => { background: string; candle_up: string; candle_down: string } | null;
  applyAppearanceConfig?: (config: { background: string; candle_up: string; candle_down: string }) => void;
}

export interface TopStripHandle {
  root: HTMLElement;
  destroy: () => void;
}

const BTN_MINIMAL = "h-8 flex items-center justify-center px-3 text-[11px] font-medium text-zinc-500 hover:text-zinc-100 hover:bg-zinc-900/50 transition-all cursor-pointer border-none outline-none bg-transparent select-none whitespace-nowrap";
const BTN_ACTIVE = "text-zinc-100 bg-zinc-800/40";

export function createTopStrip(options: TopStripOptions): TopStripHandle {
  const { controller } = options;
  const root = document.createElement("div");
  root.className = "w-full h-top-strip bg-workspace-bg flex items-center justify-between border-b border-workspace-border z-40 shrink-0 select-none";

  const leftSide = document.createElement("div");
  leftSide.className = "flex items-center h-full";

  const rightSide = document.createElement("div");
  rightSide.className = "flex items-center h-full";

  // State
  let selectedSymbol = options.selectedSymbol;
  let selectedTimeframe = options.selectedTimeframe;
  let activePopup: HTMLElement | null = null;

  const closePopup = () => {
    if (activePopup) {
      activePopup.remove();
      activePopup = null;
    }
  };

  const createDropdown = (owner: HTMLElement, items: { label: string, value: string }[], onSelect: (val: string) => void) => {
    closePopup();
    const dropdown = document.createElement("div");
    dropdown.className = "fixed bg-zinc-950 border border-workspace-border py-1 shadow-2xl z-50 flex flex-col min-w-[100px] animate-in fade-in zoom-in-95 duration-100";

    const rect = owner.getBoundingClientRect();
    dropdown.style.top = `${rect.bottom}px`;
    dropdown.style.left = `${rect.left}px`;

    items.forEach(item => {
      const btn = document.createElement("button");
      btn.className = "px-4 py-2 text-left text-[11px] text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors border-none outline-none bg-transparent cursor-pointer";
      btn.textContent = item.label;
      btn.onclick = () => {
        onSelect(item.value);
        closePopup();
      };
      dropdown.appendChild(btn);
    });

    document.body.appendChild(dropdown);
    activePopup = dropdown;
  };

  // 1. Symbol Button
  const symbolBtn = document.createElement("button");
  symbolBtn.className = BTN_MINIMAL;
  const updateSymbol = () => {
    symbolBtn.textContent = selectedSymbol || "Symbol";
  };
  updateSymbol();
  symbolBtn.onclick = (e) => {
    e.stopPropagation();
    createSymbolSearchModal({
      symbols: options.symbols || [],
      onSelect: (val) => {
        selectedSymbol = val;
        updateSymbol();
        options.onSymbolChange?.(val);
      },
      onClose: () => { }
    });
  };
  leftSide.appendChild(symbolBtn);

  // 2. Timeframe Button
  const tfBtn = document.createElement("button");
  tfBtn.className = BTN_MINIMAL;
  const updateTf = () => {
    tfBtn.textContent = selectedTimeframe || "TF";
  };
  updateTf();
  tfBtn.onclick = (e) => {
    e.stopPropagation();
    createDropdown(tfBtn, options.timeframes.map(t => ({ label: t, value: t })), (val) => {
      selectedTimeframe = val;
      updateTf();
      options.onTimeframeChange?.(val);
    });
  };
  leftSide.appendChild(tfBtn);

  // 3. Compare Button
  const compareBtn = document.createElement("button");
  compareBtn.className = BTN_MINIMAL;
  compareBtn.appendChild(makeSvgIcon("plus", "h-3.5 w-3.5 mr-1.5"));
  const compareLabel = document.createElement("span");
  compareLabel.textContent = "Compare";
  compareBtn.appendChild(compareLabel);
  compareBtn.onclick = (e) => {
    e.stopPropagation();
    createSymbolSearchModal({
      symbols: options.symbols || [],
      onSelect: (val) => {
        options.onCompareSymbol?.(val);
      },
      onClose: () => { }
    });
  };
  leftSide.appendChild(compareBtn);
  // 3. Candle Selector
  const candleBtn = document.createElement("button");
  candleBtn.className = BTN_MINIMAL;
  candleBtn.appendChild(makeSvgIcon("rectangle-filled", "h-3.5 w-3.5"));
  candleBtn.onclick = (e) => {
    e.stopPropagation();
    const types: { label: string, value: any }[] = [
      { label: "Solid Candles", value: "solid" },
      { label: "Hollow Candles", value: "hollow" },
      { label: "OHLC Bars", value: "bars" },
      { label: "Volume Candles", value: "volume" }
    ];
    createDropdown(candleBtn, types, (val) => {
      options.onCandleTypeChange?.(val as any);
      candleBtn.innerHTML = "";
      candleBtn.appendChild(makeSvgIcon(val === "bars" ? "bars" : (val === "volume" ? "volume-candles" : "rectangle-filled"), "h-3.5 w-3.5"));
    });
  };
  leftSide.appendChild(candleBtn);

  // 4. Axis Mode Selector
  const axisBtn = document.createElement("button");
  axisBtn.className = BTN_MINIMAL;
  const updateAxisLabel = () => {
    const mode = controller.getState().priceAxisMode;
    axisBtn.textContent = mode.charAt(0).toUpperCase() + mode.slice(1);
  };
  updateAxisLabel();
  axisBtn.onclick = (e) => {
    e.stopPropagation();
    const modes: { label: string, value: "linear" | "log" | "percent" }[] = [
      { label: "Linear", value: "linear" },
      { label: "Log", value: "log" },
      { label: "Percent", value: "percent" }
    ];
    createDropdown(axisBtn, modes, (val) => {
      controller.setPriceAxisMode(val as any);
      updateAxisLabel();
    });
  };
  leftSide.appendChild(axisBtn);

  // Config (appearance)
  const configBtn = document.createElement("button");
  configBtn.className = BTN_MINIMAL;
  configBtn.appendChild(makeSvgIcon("settings", "h-3.5 w-3.5 mr-1.5"));
  const configLabel = document.createElement("span");
  configLabel.textContent = "Config";
  configBtn.appendChild(configLabel);
  configBtn.onclick = () => {
    const current = options.getAppearanceConfig?.() ?? {
      background: "#030712",
      candle_up: "#22c55e",
      candle_down: "#ef4444"
    };
    createConfigModal({
      initialConfig: current,
      onApply: (cfg) => {
        options.applyAppearanceConfig?.(cfg);
        options.onMutate?.();
      },
      onClose: () => { }
    });
  };
  leftSide.appendChild(configBtn);

  // Indicators
  const indBtn = document.createElement("button");
  indBtn.className = BTN_MINIMAL;
  indBtn.textContent = "Indicators";
  indBtn.onclick = () => {
    createIndicatorModal({
      chart: options.chart,
      controller: options.controller,
      onApply: options.onMutate,
      onClose: () => { }
    });
  };
  leftSide.appendChild(indBtn);

  // Add Pane Button
  const addPaneBtn = document.createElement("button");
  addPaneBtn.className = BTN_MINIMAL;
  addPaneBtn.appendChild(makeSvgIcon("plus", "h-3.5 w-3.5 mr-1.5"));
  const addPaneLabel = document.createElement("span");
  addPaneLabel.textContent = "Pane";
  addPaneBtn.appendChild(addPaneLabel);
  addPaneBtn.onclick = () => {
    controller.addChartTile();
    options.onMutate?.();
  };
  leftSide.appendChild(addPaneBtn);

  // Right Side - Objects Toggle
  const replayGroup = document.createElement("div");
  replayGroup.className = "flex items-center h-full border-r border-workspace-border px-1.5 gap-0.5";

  const mkReplayBtn = (icon: string, title: string, onClick: () => void) => {
    const btn = document.createElement("button");
    btn.className = "h-7 w-7 inline-flex items-center justify-center rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900/70 transition-all border-none outline-none bg-transparent cursor-pointer";
    btn.title = title;
    btn.setAttribute("aria-label", title);
    btn.appendChild(makeSvgIcon(icon, "h-3.5 w-3.5"));
    btn.onclick = onClick;
    return btn;
  };

  const replayApi = controller.replay();
  const playBtn = mkReplayBtn("play", "Play Replay", () => replayApi.play());
  const pauseBtn = mkReplayBtn("pause", "Pause Replay", () => replayApi.pause());
  const stopBtn = mkReplayBtn("stop", "Stop Replay", () => replayApi.stop());
  const stepBarBtn = mkReplayBtn("step-forward", "Step Bar", () => replayApi.stepBar());
  const stepEventBtn = mkReplayBtn("skip-forward", "Step Event", () => replayApi.stepEvent());

  replayGroup.append(playBtn, pauseBtn, stopBtn, stepBarBtn, stepEventBtn);
  rightSide.appendChild(replayGroup);

  const objectsBtn = document.createElement("button");
  objectsBtn.className = BTN_MINIMAL;
  objectsBtn.appendChild(makeSvgIcon("eye", "h-3.5 w-3.5 mr-2"));
  const objLabel = document.createElement("span");
  objLabel.textContent = "Objects";
  objectsBtn.appendChild(objLabel);

  objectsBtn.onclick = () => {
    const currentState = controller.getState().isObjectTreeOpen;
    controller.setObjectTreeOpen(!currentState);
  };
  rightSide.appendChild(objectsBtn);

  root.append(leftSide, rightSide);

  const unsubscribe = controller.subscribe((state) => {
    const paneSource = state.chartPaneSources[state.activeChartPaneId];
    const nextSymbol = paneSource?.symbol ?? options.selectedSymbol;
    const nextTimeframe = paneSource?.timeframe ?? options.selectedTimeframe;
    if (nextSymbol !== selectedSymbol) {
      selectedSymbol = nextSymbol;
      updateSymbol();
    }
    if (nextTimeframe !== selectedTimeframe) {
      selectedTimeframe = nextTimeframe;
      updateTf();
    }
    if (state.isObjectTreeOpen) {
      objectsBtn.classList.add("text-zinc-100", "bg-zinc-900");
    } else {
      objectsBtn.classList.remove("text-zinc-100", "bg-zinc-900");
    }
    updateAxisLabel();
    if (state.replay.playing) {
      playBtn.classList.add(BTN_ACTIVE);
      pauseBtn.classList.remove(BTN_ACTIVE);
    } else {
      playBtn.classList.remove(BTN_ACTIVE);
      pauseBtn.classList.add(BTN_ACTIVE);
    }
  });

  const globalClick = () => closePopup();
  window.addEventListener("click", globalClick);

  return {
    root,
    destroy: () => {
      unsubscribe();
      window.removeEventListener("click", globalClick);
      closePopup();
    }
  };
}

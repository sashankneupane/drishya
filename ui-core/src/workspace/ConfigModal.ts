import { makeSvgIcon } from "./icons.js";
import { DEFAULT_APPEARANCE_CONFIG } from "./constants.js";
import type { ChartAppearanceConfig } from "../wasm/contracts.js";

export interface ConfigModalOptions {
  initialConfig: ChartAppearanceConfig;
  initialCandleStyle?: "solid" | "hollow" | "bars" | "volume";
  onApply: (config: ChartAppearanceConfig, candleStyle: "solid" | "hollow" | "bars" | "volume") => void;
  onClose: () => void;
}

/** Normalize value for native color picker (requires #rrggbb). */
function toHexColor(s: string): string {
  const t = s.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(t)) return t;
  if (/^#[0-9a-fA-F]{3}$/.test(t)) {
    const r = t[1] + t[1], g = t[2] + t[2], b = t[3] + t[3];
    return `#${r}${g}${b}`;
  }
  return "#000000";
}

function createColorField(
  label: string,
  value: string,
  onChange: (v: string) => void
): HTMLElement {
  const row = document.createElement("div");
  row.className = "flex items-center gap-3 py-2";
  row.dataset.colorField = "true";

  const lbl = document.createElement("label");
  lbl.className = "text-xs text-zinc-500 w-24 shrink-0";
  lbl.textContent = label;

  const textInput = document.createElement("input");
  textInput.type = "text";
  textInput.value = value;
  textInput.className = "flex-1 h-8 px-3 bg-zinc-900 border border-workspace-border rounded text-sm text-zinc-100 outline-none focus:border-zinc-600";
  textInput.placeholder = "#000000";

  const colorPicker = document.createElement("input");
  colorPicker.type = "color";
  colorPicker.value = toHexColor(value);
  colorPicker.className = "w-8 h-8 rounded border border-workspace-border shrink-0 cursor-pointer p-0 bg-transparent [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded [&::-webkit-color-swatch]:border-none";

  const syncFromText = () => {
    const v = textInput.value.trim() || "#000000";
    onChange(v);
    const hex = toHexColor(v);
    if (colorPicker.value !== hex) colorPicker.value = hex;
  };
  const syncFromPicker = () => {
    const v = colorPicker.value;
    textInput.value = v;
    onChange(v);
  };

  textInput.addEventListener("input", syncFromText);
  colorPicker.addEventListener("input", syncFromPicker);
  syncFromText();

  row.append(lbl, textInput, colorPicker);
  return row;
}

export function createConfigModal(options: ConfigModalOptions): void {
  let config: ChartAppearanceConfig = { ...options.initialConfig };
  let candleStyle: "solid" | "hollow" | "bars" | "volume" = options.initialCandleStyle ?? "solid";

  const backdrop = document.createElement("div");
  backdrop.className = "fixed inset-0 bg-black/40 z-[100] flex items-center justify-center animate-in fade-in duration-200";

  const modal = document.createElement("div");
  modal.className = "w-[360px] bg-zinc-950 border border-workspace-border flex flex-col shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden";

  const header = document.createElement("div");
  header.className = "p-4 border-b border-workspace-border flex items-center justify-between bg-zinc-900/20";

  const title = document.createElement("span");
  title.className = "text-sm font-semibold text-zinc-100";
  title.textContent = "Chart appearance";

  const closeBtn = document.createElement("button");
  closeBtn.className = "p-1 text-zinc-500 hover:text-white transition-colors border-none outline-none bg-transparent cursor-pointer";
  closeBtn.appendChild(makeSvgIcon("close", "h-4 w-4"));
  closeBtn.onclick = () => destroy();

  header.append(title, closeBtn);

  const body = document.createElement("div");
  body.className = "p-4 flex flex-col gap-1";

  body.appendChild(
    createColorField("Background", config.background, (v) => {
      config = { ...config, background: v };
    })
  );
  body.appendChild(
    createColorField("Candle up", config.candle_up, (v) => {
      config = { ...config, candle_up: v };
    })
  );
  body.appendChild(
    createColorField("Candle down", config.candle_down, (v) => {
      config = { ...config, candle_down: v };
    })
  );

  const candleRow = document.createElement("div");
  candleRow.className = "flex items-center gap-3 py-2";
  const candleLbl = document.createElement("label");
  candleLbl.className = "text-xs text-zinc-500 w-24 shrink-0";
  candleLbl.textContent = "Candle mode";
  const candleSelect = document.createElement("select");
  candleSelect.className = "flex-1 h-8 px-3 bg-zinc-900 border border-workspace-border rounded text-sm text-zinc-100 outline-none focus:border-zinc-600";
  [
    { label: "Solid", value: "solid" },
    { label: "Hollow", value: "hollow" },
    { label: "OHLC Bars", value: "bars" },
    { label: "Volume", value: "volume" }
  ].forEach((opt) => {
    const el = document.createElement("option");
    el.value = opt.value;
    el.textContent = opt.label;
    candleSelect.appendChild(el);
  });
  candleSelect.value = candleStyle;
  candleSelect.onchange = () => {
    candleStyle = candleSelect.value as typeof candleStyle;
  };
  candleRow.append(candleLbl, candleSelect);
  body.appendChild(candleRow);

  const footer = document.createElement("div");
  footer.className = "p-4 border-t border-workspace-border flex items-center justify-end gap-2 bg-zinc-900/20";

  const resetBtn = document.createElement("button");
  resetBtn.className = "h-8 px-3 text-xs font-medium text-zinc-500 hover:text-zinc-100 transition-colors border border-workspace-border rounded hover:bg-zinc-900";
  resetBtn.textContent = "Reset defaults";
  resetBtn.onclick = () => {
    config = { ...DEFAULT_APPEARANCE_CONFIG };
    const keys: (keyof ChartAppearanceConfig)[] = ["background", "candle_up", "candle_down"];
    body.querySelectorAll<HTMLDivElement>("[data-color-field]").forEach((row, i) => {
      const textInp = row.querySelector<HTMLInputElement>('input[type="text"]');
      const colorInp = row.querySelector<HTMLInputElement>('input[type="color"]');
      const v = config[keys[i]];
      if (textInp) textInp.value = v;
      if (colorInp) colorInp.value = toHexColor(v);
    });
  };

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "h-8 px-3 text-xs font-medium text-zinc-500 hover:text-zinc-100 transition-colors border border-workspace-border rounded hover:bg-zinc-900";
  cancelBtn.textContent = "Cancel";
  cancelBtn.onclick = () => destroy();

  const applyBtn = document.createElement("button");
  applyBtn.className = "h-8 px-4 text-xs font-medium text-white bg-zinc-700 hover:bg-zinc-600 rounded transition-colors";
  applyBtn.textContent = "Apply";
  applyBtn.onclick = () => {
    options.onApply(config, candleStyle);
    destroy();
  };

  footer.append(resetBtn, cancelBtn, applyBtn);

  modal.append(header, body, footer);
  backdrop.appendChild(modal);

  const destroy = () => {
    backdrop.remove();
    options.onClose();
  };

  backdrop.onclick = (e) => {
    if (e.target === backdrop) destroy();
  };

  document.body.appendChild(backdrop);
}

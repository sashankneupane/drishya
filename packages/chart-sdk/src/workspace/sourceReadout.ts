import type { ChartAppearanceConfig } from "../wasm/contracts.js";

interface OhlcvLike {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export function createOhlcvReadoutElement(
  ohlc: OhlcvLike,
  appearance: ChartAppearanceConfig
): HTMLSpanElement {
  const fmt = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : "--");
  const delta = ohlc.close - ohlc.open;
  const values = document.createElement("span");
  values.style.fontSize = "13px";
  values.style.fontWeight = "600";
  values.style.whiteSpace = "nowrap";
  const dim = "#a1a1aa";
  const valueColor = delta >= 0 ? appearance.candle_up : appearance.candle_down;
  const seg = (label: string, value: string) => {
    const wrap = document.createElement("span");
    wrap.style.marginRight = "8px";
    const l = document.createElement("span");
    l.style.color = dim;
    l.textContent = `${label} `;
    const v = document.createElement("span");
    v.style.color = valueColor;
    v.textContent = value;
    wrap.append(l, v);
    return wrap;
  };
  values.append(
    seg("O", fmt(ohlc.open)),
    seg("H", fmt(ohlc.high)),
    seg("L", fmt(ohlc.low)),
    seg("C", fmt(ohlc.close)),
    seg("V", fmt(ohlc.volume))
  );
  const deltaEl = document.createElement("span");
  deltaEl.style.color = valueColor;
  deltaEl.textContent = `${delta >= 0 ? "+" : ""}${fmt(delta)}`;
  values.appendChild(deltaEl);
  return values;
}


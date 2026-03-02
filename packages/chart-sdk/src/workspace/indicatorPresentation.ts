export function indicatorLabel(indicatorId: string): string {
  const labels: Record<string, string> = {
    sma: "SMA",
    ema: "EMA",
    bb: "BB",
    rsi: "RSI",
    macd: "MACD",
    atr: "ATR",
    stoch: "STOCH",
    obv: "OBV",
    vwap: "VWAP",
    adx: "ADX",
    mom: "MOM",
  };
  return labels[indicatorId] ?? indicatorId.toUpperCase();
}

export function indicatorReadoutColor(seriesId: string): string {
  const id = seriesId.toLowerCase();
  if (id.startsWith("ema") || id.startsWith("sma") || id.startsWith("vwap")) return "#f59e0b";
  if (id.startsWith("bb") || id.startsWith("bbands")) return "#a3e635";
  if (id.startsWith("rsi")) return "#22d3ee";
  if (id.startsWith("macd")) return "#38bdf8";
  if (id.startsWith("atr")) return "#f97316";
  if (id.startsWith("stoch")) return "#c084fc";
  if (id.startsWith("obv")) return "#eab308";
  if (id.startsWith("adx")) return "#fb7185";
  if (id.startsWith("mom")) return "#f43f5e";
  return "#d4d4d8";
}


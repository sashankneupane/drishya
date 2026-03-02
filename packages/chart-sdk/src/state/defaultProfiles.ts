import type { IndicatorStyleSlotState } from "./schema.js";

export type ExplicitIndicatorValue = string | number | boolean;

const CANONICAL_DEFAULT_PROFILES: Record<string, Record<string, ExplicitIndicatorValue>> = {
  sma: { source: "close", period: 14 },
  ema: { source: "close", period: 14 },
  rsi: { source: "close", period: 14 },
  atr: { period: 14 },
  adx: { period: 14 },
  bb: { source: "close", period: 20, std_mult: 2 },
  macd: { source: "close", fast_period: 12, slow_period: 26, signal_period: 9 },
  stoch: { k_period: 14, d_period: 3, smooth: 3 },
};

const STYLE_DEFAULTS_BY_KIND: Record<IndicatorStyleSlotState["kind"], Omit<IndicatorStyleSlotState, "kind">> = {
  stroke: {
    color: "#60a5fa",
    width: 2,
    opacity: 1,
    pattern: "solid",
  },
  fill: {
    color: "#60a5fa",
    opacity: 0.2,
  },
  histogram: {
    color: "#60a5fa",
    widthFactor: 0.8,
    opacity: 1,
    positiveColor: "#22c55e",
    negativeColor: "#ef4444",
  },
  markers: {
    color: "#f59e0b",
    size: 6,
    opacity: 1,
  },
};

export const DEFAULT_INDICATOR_PARAM_PROFILE = CANONICAL_DEFAULT_PROFILES;
export const DEFAULT_INDICATOR_STYLE_BY_KIND = STYLE_DEFAULTS_BY_KIND;

export const defaultProfileForIndicator = (canonicalIndicatorId: string): Record<string, ExplicitIndicatorValue> => ({
  ...(CANONICAL_DEFAULT_PROFILES[canonicalIndicatorId] ?? {}),
});

export const inferDefaultFromParamShape = (name: string, kind: string): ExplicitIndicatorValue => {
  const key = name.toLowerCase();
  const normalizedKind = kind.toLowerCase();
  if (key === "source") return "close";
  if (key.includes("fast")) return 12;
  if (key.includes("slow")) return 26;
  if (key.includes("signal")) return 9;
  if (key.includes("std")) return 2;
  if (normalizedKind === "int" || normalizedKind === "integer") return 14;
  if (normalizedKind === "float" || normalizedKind === "number") return 2;
  if (normalizedKind === "bool" || normalizedKind === "boolean") return false;
  return "";
};

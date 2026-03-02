export type IndicatorParamMap = Record<string, unknown>;

export const canonicalIndicatorId = (rawId: string): string => {
  const id = (rawId || "").toLowerCase().trim();
  if (!id) return id;
  if (id === "bbands") return "bb";
  if (id.startsWith("macd")) return "macd";
  if (id.startsWith("stoch")) return "stoch";
  if (id === "plus-di" || id === "minus-di") return "adx";
  return id;
};

export const parseIndicatorParamsFromSeriesId = (
  indicatorId: string,
  seriesId?: string
): Record<string, string | number | boolean> => {
  const rawSeriesId = String(seriesId ?? "").trim();
  const encodedIdx = rawSeriesId.indexOf("::");
  if (encodedIdx >= 0) {
    const encoded = rawSeriesId.slice(encodedIdx + 2).trim();
    if (encoded && /^[a-z0-9_-]{6,}$/i.test(encoded)) {
      return { __instance: encoded };
    }
    if (encoded && encoded.length % 2 === 0 && /^[0-9a-f]+$/i.test(encoded)) {
      try {
        let json = "";
        for (let i = 0; i < encoded.length; i += 2) {
          json += String.fromCharCode(Number.parseInt(encoded.slice(i, i + 2), 16));
        }
        const parsed = JSON.parse(json);
        if (parsed && typeof parsed === "object") {
          return parsed as Record<string, string | number | boolean>;
        }
      } catch {
        // fall back to legacy parse
      }
    }
  }
  const parts = rawSeriesId.split(":");
  const base = canonicalIndicatorId(indicatorId);
  switch (base) {
    case "sma":
    case "ema":
    case "rsi":
    case "atr":
    case "adx":
      return { period: Number(parts[1] ?? 14) };
    case "bb":
      return { period: Number(parts[1] ?? 20), std_mult: Number(parts[2] ?? 2) };
    case "macd":
      return {
        fast_period: Number(parts[1] ?? 12),
        slow_period: Number(parts[2] ?? 26),
        signal_period: Number(parts[3] ?? 9),
      };
    case "stoch":
      return {
        k_period: Number(parts[1] ?? 14),
        d_period: Number(parts[2] ?? 3),
        smooth: Number(parts[3] ?? 3),
      };
    default:
      return {};
  }
};

export const indicatorInstanceFromSeriesId = (seriesId?: string): string | null => {
  const parsed = parseIndicatorParamsFromSeriesId("", seriesId);
  return typeof parsed.__instance === "string" && parsed.__instance.trim()
    ? parsed.__instance
    : null;
};

export const isSeriesInIndicatorFamily = (indicatorId: string, seriesId: string): boolean => {
  const base = canonicalIndicatorId(indicatorId);
  const lower = seriesId.toLowerCase();
  if (base === "bb") return lower.startsWith("bbands:");
  if (base === "stoch") return lower.startsWith("stoch-k:") || lower.startsWith("stoch-d:");
  if (base === "macd") {
    return lower.startsWith("macd:") || lower.startsWith("macd-signal:") || lower.startsWith("macd-hist:");
  }
  if (base === "adx") {
    return lower.startsWith("adx:") || lower.startsWith("plus-di:") || lower.startsWith("minus-di:");
  }
  return lower === base || lower.startsWith(`${base}:`);
};

export const isSameIndicatorInstance = (
  indicatorId: string,
  targetSeriesId: string,
  candidateSeriesId: string
): boolean => {
  const base = canonicalIndicatorId(indicatorId);
  if (!isSeriesInIndicatorFamily(base, candidateSeriesId)) return false;
  if (!isSeriesInIndicatorFamily(base, targetSeriesId)) return false;
  const targetParams = parseIndicatorParamsFromSeriesId(base, targetSeriesId);
  const candidateParams = parseIndicatorParamsFromSeriesId(base, candidateSeriesId);
  return JSON.stringify(targetParams) === JSON.stringify(candidateParams);
};

export const normalizeIndicatorIds = (ids: readonly string[]): string[] => {
  const out: string[] = [];
  for (const id of ids) {
    if (typeof id !== "string") continue;
    const trimmed = id.trim();
    if (!trimmed) continue;
    out.push(trimmed);
  }
  return out;
};

const randomAlphaNum = (length: number): string => {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)] ?? "x";
  }
  return out;
};

const nextIndicatorInstanceId = (indicatorId: string): string => {
  const base = canonicalIndicatorId(indicatorId) || "ind";
  return `${base}-${randomAlphaNum(8)}`;
};

export const withInstanceParam = (
  indicatorId: string,
  params: IndicatorParamMap
): IndicatorParamMap => {
  if (typeof params.__instance === "string" && params.__instance.trim()) return { ...params };
  return { ...params, __instance: nextIndicatorInstanceId(indicatorId) };
};

export const encodeIndicatorToken = (indicatorId: string, params: IndicatorParamMap): string =>
  `${canonicalIndicatorId(indicatorId)}::${encodeURIComponent(
    JSON.stringify(withInstanceParam(indicatorId, params ?? {}))
  )}`;

export const decodeIndicatorToken = (
  token: string
): { indicatorId: string; params: IndicatorParamMap } => {
  const raw = String(token || "").trim();
  const sep = raw.indexOf("::");
  if (sep < 0) return { indicatorId: canonicalIndicatorId(raw), params: {} };
  const indicatorId = canonicalIndicatorId(raw.slice(0, sep));
  const encoded = raw.slice(sep + 2);
  try {
    const parsed = JSON.parse(decodeURIComponent(encoded));
    if (parsed && typeof parsed === "object") {
      return { indicatorId, params: parsed as IndicatorParamMap };
    }
  } catch {
    // no-op
  }
  return { indicatorId, params: {} };
};

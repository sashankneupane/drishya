import type { DrishyaChartClient } from "../wasm/client.js";
import {
  canonicalIndicatorId,
  decodeIndicatorToken,
  encodeIndicatorToken,
  indicatorInstanceFromSeriesId,
  isSameIndicatorInstance,
  isSeriesInIndicatorFamily,
  parseIndicatorParamsFromSeriesId,
  withInstanceParam,
} from "./indicatorIdentity.js";

export type IndicatorTokenStore = Map<string, string[]>;

export const defaultIndicatorParams = (
  targetChart: DrishyaChartClient,
  id: string
): Record<string, unknown> => {
  const canonical = canonicalIndicatorId(id);
  const catalog = targetChart.indicatorCatalog();
  const meta = catalog.find((i) => canonicalIndicatorId(i.id) === canonical) ?? null;
  const out: Record<string, unknown> = {};
  for (const p of meta?.params ?? []) {
    const kind = String(p.kind || "").toLowerCase();
    const name = p.name.toLowerCase();
    if (name === "source") out[p.name] = "close";
    else if (name.includes("fast")) out[p.name] = 12;
    else if (name.includes("slow")) out[p.name] = 26;
    else if (name.includes("signal")) out[p.name] = 9;
    else if (name.includes("std")) out[p.name] = 2.0;
    else if (kind === "int" || kind === "integer") out[p.name] = 14;
    else if (kind === "float" || kind === "number") out[p.name] = 2.0;
    else if (kind === "bool" || kind === "boolean") out[p.name] = false;
  }
  return out;
};

export const applyIndicatorParams = (
  targetChart: DrishyaChartClient,
  indicatorId: string,
  params: Record<string, string | number | boolean>,
  targetSeriesId?: string
): boolean => {
  const intParam = (value: unknown, fallback: number, min = 1): number => {
    const n = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.round(n));
  };
  const floatParam = (value: unknown, fallback: number, min = 0): number => {
    const n = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, n);
  };

  const id = canonicalIndicatorId(indicatorId);
  const seriesInScope = (): string[] =>
    targetChart
      .objectTreeState()
      .series
      .filter((s) => {
        if (s.deleted) return false;
        if (targetSeriesId) return isSameIndicatorInstance(id, targetSeriesId, s.id);
        return isSeriesInIndicatorFamily(id, s.id);
      })
      .map((s) => s.id);
  const seriesInFamily = (): string[] =>
    targetChart
      .objectTreeState()
      .series
      .filter((s) => !s.deleted && isSeriesInIndicatorFamily(id, s.id))
      .map((s) => s.id);

  const beforeIds = seriesInScope();
  const beforeFamilyIds = seriesInFamily();
  const merged: Record<string, unknown> = { ...defaultIndicatorParams(targetChart, id) };
  for (const [key, raw] of Object.entries(params)) {
    const lk = key.toLowerCase();
    if (lk.includes("std")) merged[key] = floatParam(raw, Number(merged[key] ?? 2.0), 0.01);
    else if (
      lk.includes("period") ||
      lk === "k" ||
      lk === "d" ||
      lk === "smooth" ||
      lk === "fast" ||
      lk === "slow" ||
      lk === "signal"
    ) {
      merged[key] = intParam(raw, Number(merged[key] ?? 14), 1);
    } else {
      merged[key] = raw;
    }
  }
  try {
    targetChart.addIndicator(id, merged);
  } catch {
    return false;
  }

  const afterFamilyIds = seriesInFamily();
  const addedIds = afterFamilyIds.filter((sid) => !beforeFamilyIds.includes(sid));
  if (addedIds.length === 0) {
    return false;
  }

  for (const oldId of beforeIds) {
    if (!addedIds.includes(oldId)) {
      targetChart.deleteSeries(oldId);
    }
  }
  return true;
};

export const findTokenParamsForSeriesId = (
  chartTileIndicatorState: IndicatorTokenStore,
  chartTileId: string | undefined,
  indicatorId: string,
  seriesId?: string
): Record<string, unknown> => {
  if (!chartTileId || !seriesId) return {};
  const targetInstance = indicatorInstanceFromSeriesId(seriesId);
  const current = chartTileIndicatorState.get(chartTileId) ?? [];
  if (targetInstance) {
    const byInstance = current.find((token) => {
      const decoded = decodeIndicatorToken(token);
      return (
        decoded.indicatorId === canonicalIndicatorId(indicatorId) &&
        typeof decoded.params?.__instance === "string" &&
        decoded.params.__instance === targetInstance
      );
    });
    if (byInstance) return decodeIndicatorToken(byInstance).params ?? {};
  }
  const parsed = parseIndicatorParamsFromSeriesId(indicatorId, seriesId);
  const fallback = current.find((token) => {
    const decoded = decodeIndicatorToken(token);
    return (
      decoded.indicatorId === canonicalIndicatorId(indicatorId) &&
      JSON.stringify(decoded.params ?? {}) === JSON.stringify(parsed ?? {})
    );
  });
  return fallback ? decodeIndicatorToken(fallback).params ?? {} : {};
};

export const periodPresetForDuplicate = (n: number): number => {
  const presets = [20, 50, 100, 200, 400];
  return presets[Math.min(n, presets.length - 1)];
};

export const applyIndicatorSetToChart = (
  targetChart: DrishyaChartClient,
  indicatorIds: readonly string[]
) => {
  targetChart.clearIndicatorOverlays();
  for (const token of indicatorIds) {
    const decoded = decodeIndicatorToken(token);
    const merged = withInstanceParam(decoded.indicatorId, {
      ...defaultIndicatorParams(targetChart, decoded.indicatorId),
      ...(decoded.params ?? {}),
    });
    targetChart.addIndicator(decoded.indicatorId, merged);
  }
};

export const defaultIndicatorToken = (
  targetChart: DrishyaChartClient,
  indicatorId: string,
  duplicateCount: number
): string => {
  const base = canonicalIndicatorId(indicatorId);
  const nextParams = defaultIndicatorParams(targetChart, base);
  if (typeof nextParams.period === "number") {
    nextParams.period = periodPresetForDuplicate(duplicateCount);
  }
  return encodeIndicatorToken(base, nextParams);
};

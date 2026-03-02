import type { Candle, ChartStateSnapshot } from "../../wasm/contracts.js";

const TS_ANCHORS_KEY = "__drishya_ts_anchors_v1";

type PathSegment = string | number;

interface TimestampAnchor {
  path: PathSegment[];
  ts: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const cloneJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const inferredTimeStepSeconds = (candles: readonly Candle[]): number => {
  for (let i = candles.length - 1; i > 0; i -= 1) {
    const delta = (candles[i]?.ts ?? 0) - (candles[i - 1]?.ts ?? 0);
    if (delta > 0) return delta;
  }
  return 60;
};

const indexToTimestamp = (index: number, candles: readonly Candle[]): number | null => {
  if (!candles.length || !Number.isFinite(index)) return null;
  const idx = Math.round(index);
  const first = candles[0];
  const last = candles[candles.length - 1];
  if (!first || !last) return null;
  if (idx <= 0) return first.ts;
  const lastIdx = candles.length - 1;
  if (idx <= lastIdx) return candles[idx]?.ts ?? null;
  const step = inferredTimeStepSeconds(candles);
  const futureSteps = idx - lastIdx;
  return last.ts + futureSteps * step;
};

const nearestIndexForTimestamp = (ts: number, candles: readonly Candle[]): number | null => {
  if (!candles.length || !Number.isFinite(ts)) return null;
  const first = candles[0];
  const last = candles[candles.length - 1];
  if (!first || !last) return null;
  if (ts <= first.ts) return 0;
  if (ts >= last.ts) {
    const step = inferredTimeStepSeconds(candles);
    if (step <= 0) return candles.length - 1;
    const offsetSteps = Math.round((ts - last.ts) / step);
    return Math.max(candles.length - 1, candles.length - 1 + offsetSteps);
  }

  let low = 0;
  let high = candles.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const midTs = candles[mid]?.ts ?? 0;
    if (midTs === ts) return mid;
    if (midTs < ts) low = mid + 1;
    else high = mid - 1;
  }
  const insert = low;
  if (insert <= 0) return 0;
  if (insert >= candles.length) return candles.length - 1;
  const leftTs = candles[insert - 1]?.ts ?? 0;
  const rightTs = candles[insert]?.ts ?? 0;
  return Math.abs(ts - leftTs) <= Math.abs(rightTs - ts) ? insert - 1 : insert;
};

const isIndexKey = (key: string): boolean => key === "index" || key.endsWith("_index");

interface IndexedPathValue {
  path: PathSegment[];
  value: number;
}

const collectIndexPaths = (
  value: unknown,
  path: PathSegment[] = [],
  out: IndexedPathValue[] = []
): IndexedPathValue[] => {
  if (Array.isArray(value)) {
    value.forEach((item, i) => {
      collectIndexPaths(item, [...path, i], out);
    });
    return out;
  }
  if (!isRecord(value)) return out;
  for (const [key, nested] of Object.entries(value)) {
    if (key === TS_ANCHORS_KEY) continue;
    const nextPath = [...path, key];
    if (isIndexKey(key) && typeof nested === "number" && Number.isFinite(nested)) {
      out.push({ path: nextPath, value: nested });
      continue;
    }
    collectIndexPaths(nested, nextPath, out);
  }
  return out;
};

const setPathValue = (root: unknown, path: readonly PathSegment[], value: number): void => {
  if (!path.length) return;
  let cursor: unknown = root;
  for (let i = 0; i < path.length - 1; i += 1) {
    const part = path[i]!;
    if (typeof part === "number") {
      if (!Array.isArray(cursor) || part < 0 || part >= cursor.length) return;
      cursor = cursor[part];
      continue;
    }
    if (!isRecord(cursor)) return;
    cursor = cursor[part];
  }
  const leaf = path[path.length - 1]!;
  if (typeof leaf === "number") {
    if (!Array.isArray(cursor) || leaf < 0 || leaf >= cursor.length) return;
    cursor[leaf] = value;
    return;
  }
  if (!isRecord(cursor)) return;
  cursor[leaf] = value;
};

const readTimestampAnchors = (geometry: unknown): TimestampAnchor[] => {
  if (!isRecord(geometry)) return [];
  const raw = geometry[TS_ANCHORS_KEY];
  if (!Array.isArray(raw)) return [];
  const out: TimestampAnchor[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const path = item.path;
    const ts = item.ts;
    if (!Array.isArray(path) || typeof ts !== "number" || !Number.isFinite(ts)) continue;
    const validPath = path.every((part) => typeof part === "string" || Number.isInteger(part));
    if (!validPath) continue;
    out.push({ path: path as PathSegment[], ts });
  }
  return out;
};

const writeTimestampAnchors = (geometry: unknown, anchors: readonly TimestampAnchor[]): void => {
  if (!isRecord(geometry)) return;
  if (!anchors.length) {
    delete geometry[TS_ANCHORS_KEY];
    return;
  }
  geometry[TS_ANCHORS_KEY] = anchors.map((anchor) => ({
    path: [...anchor.path],
    ts: anchor.ts,
  }));
};

export const candlesSignature = (candles: readonly Candle[] | null | undefined): string => {
  const first = candles?.[0]?.ts ?? "na";
  const last = candles && candles.length ? candles[candles.length - 1]?.ts ?? "na" : "na";
  const len = candles?.length ?? 0;
  return `${len}:${first}:${last}`;
};

export const drawingSignature = (snapshot: ChartStateSnapshot): string => {
  const drawings = (snapshot.chart_state.drawings ?? []).map((drawing) => {
    const geometry = cloneJson(drawing.geometry ?? {});
    if (isRecord(geometry)) {
      delete geometry[TS_ANCHORS_KEY];
    }
    return {
      id: drawing.id,
      kind: drawing.kind,
      geometry,
      style: drawing.style,
      layer_id: drawing.layer_id,
      group_id: drawing.group_id ?? null,
      visible: drawing.visible,
      locked: drawing.locked,
    };
  });
  return JSON.stringify(drawings);
};

export const annotateSnapshotWithTimestampAnchors = (
  snapshot: ChartStateSnapshot,
  candles: readonly Candle[] | null | undefined
): ChartStateSnapshot => {
  if (!candles?.length) return cloneJson(snapshot);
  const next = cloneJson(snapshot);
  for (const drawing of next.chart_state.drawings ?? []) {
    const geometry = drawing.geometry;
    const indexPaths = collectIndexPaths(geometry);
    if (!indexPaths.length) continue;
    const anchors: TimestampAnchor[] = [];
    for (const entry of indexPaths) {
      const ts = indexToTimestamp(entry.value, candles);
      if (ts === null) continue;
      anchors.push({ path: entry.path, ts });
    }
    writeTimestampAnchors(geometry, anchors);
  }
  return next;
};

export const remapSnapshotToCandles = (args: {
  snapshot: ChartStateSnapshot;
  sourceCandles?: readonly Candle[] | null;
  targetCandles?: readonly Candle[] | null;
}): ChartStateSnapshot => {
  const next = cloneJson(args.snapshot);
  const sourceCandles = args.sourceCandles ?? null;
  const targetCandles = args.targetCandles ?? null;
  if (!targetCandles?.length) return next;

  for (const drawing of next.chart_state.drawings ?? []) {
    const geometry = drawing.geometry;
    const timestampAnchors = readTimestampAnchors(geometry);
    if (timestampAnchors.length) {
      for (const anchor of timestampAnchors) {
        const mapped = nearestIndexForTimestamp(anchor.ts, targetCandles);
        if (mapped === null) continue;
        setPathValue(geometry, anchor.path, mapped);
      }
      continue;
    }

    if (!sourceCandles?.length) continue;
    const indexPaths = collectIndexPaths(geometry);
    for (const entry of indexPaths) {
      const ts = indexToTimestamp(entry.value, sourceCandles);
      if (ts === null) continue;
      const mapped = nearestIndexForTimestamp(ts, targetCandles);
      if (mapped === null) continue;
      setPathValue(geometry, entry.path, mapped);
    }
  }
  return next;
};

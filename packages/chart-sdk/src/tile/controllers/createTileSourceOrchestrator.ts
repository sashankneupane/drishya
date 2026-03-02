import type { Candle } from "../../wasm/contracts.js";
import type { WorkspaceController } from "../../workspace/controllers/WorkspaceController.js";

interface TileSourceOrchestratorOptions {
  controller: WorkspaceController;
  getRuntime: (paneId: string) => { chart: { setCandles: (candles: Candle[]) => void; appendCandle: (candle: Candle) => void } } | null;
  symbols?: readonly string[];
  timeframes?: readonly string[];
  selectedSymbol?: string;
  selectedTimeframe?: string;
  dataFeed?: {
    loadSnapshot: (source: { symbol: string; timeframe: string }) => Promise<Candle[]>;
    subscribe: (
      source: { symbol: string; timeframe: string },
      onCandle: (candle: Candle) => void
    ) => void | (() => void) | Promise<void | (() => void)>;
    sourceKey?: (source: { symbol: string; timeframe: string }) => string;
  };
  onDataMutated?: () => void;
}

interface SourceEntry {
  key: string;
  source: { symbol: string; timeframe: string };
  candles: Candle[];
  paneIds: Set<string>;
  unsubscribe: (() => void) | null;
}

export interface TileSourceOrchestrator {
  sync: () => void;
  bindPaneRuntime: (paneId: string) => void;
  getSourceLabel: (paneId: string) => string;
  dispose: () => void;
}

export function createTileSourceOrchestrator(options: TileSourceOrchestratorOptions): TileSourceOrchestrator {
  const paneSourceKeyByPaneId = new Map<string, string>();
  const sourceEntryByKey = new Map<string, SourceEntry>();

  const resolvePaneSource = (
    paneId: string
  ): { symbol: string; timeframe: string } | null => {
    const state = options.controller.getState();
    const raw = state.chartPaneSources[paneId] ?? {};
    const symbol = raw.symbol ?? options.selectedSymbol ?? options.symbols?.[0];
    const timeframe = raw.timeframe ?? options.selectedTimeframe ?? options.timeframes?.[0];
    if (!symbol || !timeframe) return null;
    return { symbol, timeframe };
  };

  const resolveSourceKey = (source: { symbol: string; timeframe: string }): string => {
    const key = options.dataFeed?.sourceKey?.(source);
    if (typeof key === "string" && key.trim()) return key.trim();
    return `${source.symbol}::${source.timeframe}`;
  };

  const upsertCandleInStore = (candles: Candle[], candle: Candle): void => {
    const last = candles[candles.length - 1];
    if (!last) {
      candles.push(candle);
      return;
    }
    if (candle.ts === last.ts) {
      candles[candles.length - 1] = candle;
      return;
    }
    if (candle.ts > last.ts) {
      candles.push(candle);
      return;
    }
    const idx = candles.findIndex((item) => item.ts === candle.ts);
    if (idx >= 0) candles[idx] = candle;
  };

  const applySnapshotToSource = (entry: SourceEntry): void => {
    for (const paneId of entry.paneIds) {
      const runtime = options.getRuntime(paneId);
      runtime?.chart.setCandles(entry.candles);
    }
  };

  const appendToSource = (entry: SourceEntry, candle: Candle): void => {
    for (const paneId of entry.paneIds) {
      const runtime = options.getRuntime(paneId);
      runtime?.chart.appendCandle(candle);
    }
  };

  const ensureSourceData = async (entry: SourceEntry): Promise<void> => {
    if (!options.dataFeed) return;
    const snapshot = await options.dataFeed.loadSnapshot(entry.source);
    const current = sourceEntryByKey.get(entry.key);
    if (!current) return;
    current.candles = Array.isArray(snapshot) ? snapshot : [];
    applySnapshotToSource(current);
    if (current.unsubscribe) return;
    const maybeUnsubscribe = await options.dataFeed.subscribe(current.source, (candle) => {
      const target = sourceEntryByKey.get(entry.key);
      if (!target) return;
      upsertCandleInStore(target.candles, candle);
      appendToSource(target, candle);
      options.onDataMutated?.();
    });
    if (typeof maybeUnsubscribe === "function") {
      current.unsubscribe = maybeUnsubscribe;
    }
  };

  const bindPaneToSource = (paneId: string): void => {
    const source = resolvePaneSource(paneId);
    const previousKey = paneSourceKeyByPaneId.get(paneId);
    if (!source) {
      if (!previousKey) return;
      paneSourceKeyByPaneId.delete(paneId);
      const prev = sourceEntryByKey.get(previousKey);
      prev?.paneIds.delete(paneId);
      if (prev && prev.paneIds.size === 0) {
        prev.unsubscribe?.();
        sourceEntryByKey.delete(previousKey);
      }
      return;
    }

    const key = resolveSourceKey(source);
    if (previousKey && previousKey !== key) {
      const prev = sourceEntryByKey.get(previousKey);
      prev?.paneIds.delete(paneId);
      if (prev && prev.paneIds.size === 0) {
        prev.unsubscribe?.();
        sourceEntryByKey.delete(previousKey);
      }
    }
    paneSourceKeyByPaneId.set(paneId, key);
    let entry = sourceEntryByKey.get(key);
    if (!entry) {
      entry = { key, source, candles: [], paneIds: new Set<string>(), unsubscribe: null };
      sourceEntryByKey.set(key, entry);
    }
    entry.paneIds.add(paneId);
    if (entry.candles.length > 0) {
      options.getRuntime(paneId)?.chart.setCandles(entry.candles);
    }
    void ensureSourceData(entry);
  };

  const sync = () => {
    const paneIds = Object.keys(options.controller.getState().chartPanes);
    const active = new Set(paneIds);
    for (const paneId of paneIds) bindPaneToSource(paneId);
    for (const [paneId, key] of [...paneSourceKeyByPaneId.entries()]) {
      if (active.has(paneId)) continue;
      paneSourceKeyByPaneId.delete(paneId);
      const entry = sourceEntryByKey.get(key);
      entry?.paneIds.delete(paneId);
      if (entry && entry.paneIds.size === 0) {
        entry.unsubscribe?.();
        sourceEntryByKey.delete(key);
      }
    }
  };

  const bindPaneRuntime = (paneId: string) => {
    const key = paneSourceKeyByPaneId.get(paneId);
    if (!key) return;
    const entry = sourceEntryByKey.get(key);
    if (!entry || entry.candles.length === 0) return;
    options.getRuntime(paneId)?.chart.setCandles(entry.candles);
  };

  const getSourceLabel = (paneId: string): string => {
    const source = resolvePaneSource(paneId);
    if (!source) return "";
    return `${source.symbol} · ${source.timeframe}`;
  };

  const dispose = () => {
    for (const entry of sourceEntryByKey.values()) {
      entry.unsubscribe?.();
    }
    sourceEntryByKey.clear();
    paneSourceKeyByPaneId.clear();
  };

  return { sync, bindPaneRuntime, getSourceLabel, dispose };
}

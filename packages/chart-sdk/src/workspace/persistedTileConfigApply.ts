import type { SeriesStyleOverride } from "../wasm/contracts.js";
import type { WorkspaceController } from "./WorkspaceController.js";
import {
  normalizePersistedChartTileConfig,
  type PersistedChartTileStoredShape,
} from "./persistenceHelpers.js";

interface PersistedTileConfigApplyOptions {
  persistedChartTiles: Record<string, PersistedChartTileStoredShape>;
  chartTileTreeOpen: Map<string, boolean>;
  chartTileIndicatorState: Map<string, string[]>;
  controller: WorkspaceController;
  selectedTimeframe?: string;
  availableTimeframes?: readonly string[];
  restoredPaneStatesByPane: Record<string, string | null>;
  restoredIndicatorStyleOverridesByPane: Record<
    string,
    Record<string, SeriesStyleOverride>
  >;
  getRuntimeChartByPaneId: (paneId: string) => { setSeriesStyleOverride: (seriesId: string, style: SeriesStyleOverride) => void } | null;
}

export function applyPersistedTileConfigs(options: PersistedTileConfigApplyOptions): void {
  for (const [chartTileId, tile] of Object.entries(options.persistedChartTiles)) {
    const tileCfg = normalizePersistedChartTileConfig(tile.config);
    options.chartTileTreeOpen.set(chartTileId, tileCfg.treeOpen === true);
    options.chartTileIndicatorState.set(chartTileId, tileCfg.indicators ?? []);
    for (const [paneId, source] of Object.entries(tileCfg.paneSourcesByPane ?? {})) {
      options.controller.setChartPaneSource(paneId, {
        symbol: source?.symbol,
        timeframe:
          source?.timeframe ??
          options.selectedTimeframe ??
          options.availableTimeframes?.[0],
      });
    }
    for (const [paneId, paneState] of Object.entries(tileCfg.paneStateByPane ?? {})) {
      options.restoredPaneStatesByPane[paneId] = paneState ?? null;
    }
    for (const [paneId, styleMap] of Object.entries(
      tileCfg.indicatorStyleOverridesByPane ?? {}
    )) {
      options.restoredIndicatorStyleOverridesByPane[paneId] = styleMap ?? {};
      const runtime = options.getRuntimeChartByPaneId(paneId);
      if (runtime) {
        for (const [seriesId, style] of Object.entries(styleMap ?? {})) {
          runtime.setSeriesStyleOverride(seriesId, style);
        }
      }
    }
  }
}


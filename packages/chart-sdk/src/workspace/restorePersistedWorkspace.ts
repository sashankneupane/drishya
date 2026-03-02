import {
  buildChartLayoutTree,
  deriveActivePaneIdFromPersistedTiles,
  deriveChartPanesFromPersistedTiles,
  normalizePersistedChartTiles,
  type PersistedChartTileStoredShape,
} from "./persistenceHelpers.js";
import { applyPersistedTileConfigs } from "./persistedTileConfigApply.js";
import type { WorkspaceController } from "./WorkspaceController.js";
import type { SeriesStyleOverride } from "../wasm/contracts.js";

interface RestoredWorkspaceShape {
  theme?: "dark" | "light";
  cursorMode?: string;
  isObjectTreeOpen?: boolean;
  objectTreeWidth?: number;
  isLeftStripOpen?: boolean;
  priceAxisMode?: "linear" | "log" | "percent";
  workspaceTiles?: Record<string, { id: string; kind: "chart" | "objects"; title: string; widthRatio: number; chartTileId?: string }>;
  workspaceTileOrder?: string[];
  chartTiles?: Record<string, PersistedChartTileStoredShape>;
  activeChartTileId?: string;
  paneLayout?: unknown;
  appearance?: { background: string; candle_up: string; candle_down: string };
  candleStyle?: string;
}

interface RestorePersistedWorkspaceOptions {
  persistKey: string | null;
  controller: WorkspaceController;
  selectedTimeframe?: string;
  availableTimeframes?: readonly string[];
  chartTileTreeOpen: Map<string, boolean>;
  restoredPaneStatesByPane: Record<string, string | null>;
  restoredIndicatorStyleOverridesByPane: Record<string, Record<string, SeriesStyleOverride>>;
  getRuntimeChartByPaneId: (paneId: string) => { chart: { setTheme: (theme: "dark" | "light") => void; setSeriesStyleOverride: (seriesId: string, style: SeriesStyleOverride) => void } } | null;
  getPrimaryChart: () => { setCursorMode: (mode: string) => void; setPriceAxisMode: (mode: "linear" | "log" | "percent") => void; setCandleStyle: (style: "solid" | "hollow" | "bars" | "volume") => void } | null;
  applyAppearance: (config: { background: string; candle_up: string; candle_down: string }) => void;
}

export function restorePersistedWorkspace(
  options: RestorePersistedWorkspaceOptions
): { restoredObjectTreeWidth: number | null } {
  if (!options.persistKey || typeof localStorage === "undefined") {
    return { restoredObjectTreeWidth: null };
  }

  let restoredObjectTreeWidth: number | null = null;
  try {
    const raw = localStorage.getItem(options.persistKey);
    if (!raw) return { restoredObjectTreeWidth: null };
    const saved = JSON.parse(raw) as RestoredWorkspaceShape;
    if (saved.theme) {
      options.controller.setTheme(saved.theme);
      for (const paneId of Object.keys(options.controller.getState().chartPanes)) {
        options.getRuntimeChartByPaneId(paneId)?.chart.setTheme(saved.theme);
      }
    }
    if (saved.cursorMode) {
      options.controller.setCursorMode(saved.cursorMode as "crosshair" | "dot" | "normal");
      options.getPrimaryChart()?.setCursorMode(saved.cursorMode);
    }
    if (saved.isObjectTreeOpen !== undefined) options.controller.setObjectTreeOpen(saved.isObjectTreeOpen);
    if (typeof saved.objectTreeWidth === "number" && Number.isFinite(saved.objectTreeWidth)) {
      restoredObjectTreeWidth = saved.objectTreeWidth;
    }
    if (saved.isLeftStripOpen !== undefined) options.controller.setLeftStripOpen(saved.isLeftStripOpen);
    if (saved.priceAxisMode) {
      options.controller.setPriceAxisMode(saved.priceAxisMode);
      options.getPrimaryChart()?.setPriceAxisMode(saved.priceAxisMode);
    }
    if (saved.paneLayout) {
      options.controller.loadPaneLayout(saved.paneLayout as any);
    }
    const persistedChartTiles = normalizePersistedChartTiles(saved.chartTiles);
    if (
      saved.workspaceTiles &&
      saved.workspaceTileOrder &&
      Object.keys(persistedChartTiles).length > 0
    ) {
      const derivedChartPanes = deriveChartPanesFromPersistedTiles(persistedChartTiles);
      const derivedActivePaneId = deriveActivePaneIdFromPersistedTiles(
        persistedChartTiles,
        saved.activeChartTileId
      );
      options.controller.loadChartLayout(
        derivedChartPanes,
        buildChartLayoutTree(Object.keys(derivedChartPanes)),
        derivedActivePaneId
      );
      const runtimeChartTiles = Object.fromEntries(
        Object.entries(persistedChartTiles).map(([id, tile]) => [
          id,
          {
            id: tile.id,
            tabs: tile.tabs,
            activeTabId: tile.activeTabId,
            indicatorTokens: tile.config?.indicators ?? [],
          },
        ])
      );
      options.controller.loadWorkspaceTiles?.(
        saved.workspaceTiles as any,
        saved.workspaceTileOrder,
        runtimeChartTiles as any,
        saved.activeChartTileId
      );
    }
    applyPersistedTileConfigs({
      persistedChartTiles,
      chartTileTreeOpen: options.chartTileTreeOpen,
      controller: options.controller,
      selectedTimeframe: options.selectedTimeframe,
      availableTimeframes: options.availableTimeframes,
      restoredPaneStatesByPane: options.restoredPaneStatesByPane,
      restoredIndicatorStyleOverridesByPane: options.restoredIndicatorStyleOverridesByPane,
      getRuntimeChartByPaneId: (paneId) => options.getRuntimeChartByPaneId(paneId)?.chart ?? null,
    });

    if (saved.appearance) options.applyAppearance(saved.appearance);
    const validStyle = saved.candleStyle as "solid" | "hollow" | "bars" | "volume" | undefined;
    if (validStyle && ["solid", "hollow", "bars", "volume"].includes(validStyle)) {
      options.getPrimaryChart()?.setCandleStyle(validStyle);
    }
  } catch {
    // ignore corrupt or incompatible persisted data
  }

  return { restoredObjectTreeWidth };
}


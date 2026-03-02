import {
  buildChartLayoutTree,
  deriveActivePaneIdFromPersistedTiles,
  deriveChartPanesFromPersistedTiles,
  normalizePersistedChartTiles,
  type PersistedChartTileStoredShape,
} from "./persistenceHelpers.js";
import { applyPersistedTileConfigs } from "./persistedTileConfigApply.js";
import type { WorkspaceController } from "../controllers/WorkspaceController.js";
import type { SeriesStyleOverride } from "../../wasm/contracts.js";
import type { ChartStateSnapshot } from "../../wasm/contracts.js";
import type { WorkspaceLayoutNode } from "../../state/schema.js";
import {
  flattenOwnershipDocumentForLegacyRuntime,
  type WorkspaceOwnershipDocument,
} from "./workspaceOwnershipDocument.js";

interface RestoredWorkspaceShape {
  version?: number;
  theme?: "dark" | "light";
  cursorMode?: string;
  isObjectTreeOpen?: boolean;
  objectTreeWidth?: number;
  isLeftStripOpen?: boolean;
  priceAxisMode?: "linear" | "log" | "percent";
  document?: WorkspaceOwnershipDocument;
  workspaceTiles?: Record<string, { id: string; kind: "chart" | "objects"; title: string; widthRatio: number; chartTileId?: string }>;
  workspaceTileOrder?: string[];
  workspaceLayoutTree?: WorkspaceLayoutNode;
  chartTiles?: Record<string, PersistedChartTileStoredShape>;
  drawingsByAsset?: Record<string, ChartStateSnapshot>;
  activeChartTileId?: string;
  paneLayout?: unknown;
  appearance?: { background: string; candle_up: string; candle_down: string };
  candleStyle?: string;
}

function deriveWorkspaceTilesFromPersistedState(
  saved: RestoredWorkspaceShape,
  persistedChartTiles: Record<string, PersistedChartTileStoredShape>
): {
  workspaceTiles: Record<string, { id: string; kind: "chart" | "objects"; title: string; widthRatio: number; chartTileId?: string }>;
  workspaceTileOrder: string[];
  activeWorkspaceTileId: string | undefined;
  workspaceLayoutTree: WorkspaceLayoutNode | undefined;
} {
  const chartTileIds = Object.keys(persistedChartTiles);
  const oldWorkspaceTiles = saved.workspaceTiles ?? {};
  const oldChartTileByChartTileId = new Map<
    string,
    { workspaceTileId: string; widthRatio: number; title: string }
  >();
  for (const [workspaceTileId, tile] of Object.entries(oldWorkspaceTiles)) {
    if (tile.kind === "chart" && tile.chartTileId) {
      oldChartTileByChartTileId.set(tile.chartTileId, {
        workspaceTileId,
        widthRatio: tile.widthRatio,
        title: tile.title,
      });
    }
  }

  const workspaceTiles: Record<string, { id: string; kind: "chart" | "objects"; title: string; widthRatio: number; chartTileId?: string }> = {};
  const workspaceTileOrder: string[] = [];
  const defaultChartWidth = chartTileIds.length > 0 ? 1 / chartTileIds.length : 1;
  let activeWorkspaceTileId: string | undefined;
  const generatedWorkspaceTileByChartTileId = new Map<string, string>();
  const generatedWorkspaceTileByLegacyWorkspaceTileId = new Map<string, string>();

  chartTileIds.forEach((chartTileId, index) => {
    const workspaceTileId = `tile-chart-${index + 1}`;
    const old = oldChartTileByChartTileId.get(chartTileId);
    const chartTile = persistedChartTiles[chartTileId];
    workspaceTiles[workspaceTileId] = {
      id: workspaceTileId,
      kind: "chart",
      title: old?.title ?? chartTile.tabs.find((tab) => tab.id === chartTile.activeTabId)?.title ?? "Chart",
      widthRatio: old?.widthRatio ?? defaultChartWidth,
      chartTileId,
    };
    generatedWorkspaceTileByChartTileId.set(chartTileId, workspaceTileId);
    if (old?.workspaceTileId) {
      generatedWorkspaceTileByLegacyWorkspaceTileId.set(old.workspaceTileId, workspaceTileId);
    }
    if (saved.activeChartTileId === chartTileId) {
      activeWorkspaceTileId = workspaceTileId;
    }
  });

  const collectLayoutLeafIds = (node: WorkspaceLayoutNode): string[] => {
    if (node.type === "leaf") return [node.tileId];
    return [...collectLayoutLeafIds(node.first), ...collectLayoutLeafIds(node.second)];
  };
  const mapLayoutTreeTileIds = (node: WorkspaceLayoutNode): WorkspaceLayoutNode => {
    if (node.type === "leaf") {
      return {
        type: "leaf",
        tileId: generatedWorkspaceTileByLegacyWorkspaceTileId.get(node.tileId) ?? node.tileId,
      };
    }
    return {
      ...node,
      first: mapLayoutTreeTileIds(node.first),
      second: mapLayoutTreeTileIds(node.second),
    };
  };
  const mappedWorkspaceLayoutTree = saved.workspaceLayoutTree
    ? mapLayoutTreeTileIds(saved.workspaceLayoutTree)
    : undefined;

  if (mappedWorkspaceLayoutTree) {
    const treeOrder = collectLayoutLeafIds(mappedWorkspaceLayoutTree)
      .filter((tileId) => !!workspaceTiles[tileId])
      .filter((tileId): tileId is string => typeof tileId === "string");
    workspaceTileOrder.push(...treeOrder);
  }
  for (const generatedTileId of generatedWorkspaceTileByChartTileId.values()) {
    if (!workspaceTileOrder.includes(generatedTileId)) {
      workspaceTileOrder.push(generatedTileId);
    }
  }

  const existingObjectTile = Object.values(oldWorkspaceTiles).find((tile) => tile.kind === "objects");
  const objectsTileId = existingObjectTile?.id ?? "tile-objects";
  workspaceTiles[objectsTileId] = {
    id: objectsTileId,
    kind: "objects",
    title: existingObjectTile?.title ?? "Objects",
    widthRatio: existingObjectTile?.widthRatio ?? 0,
  };
  if (!workspaceTileOrder.includes(objectsTileId)) {
    workspaceTileOrder.push(objectsTileId);
  }

  return {
    workspaceTiles,
    workspaceTileOrder,
    activeWorkspaceTileId,
    workspaceLayoutTree: mappedWorkspaceLayoutTree,
  };
}

interface RestorePersistedWorkspaceOptions {
  persistedState?: unknown;
  controller: WorkspaceController;
  selectedTimeframe?: string;
  availableTimeframes?: readonly string[];
  chartTileTreeOpen: Map<string, boolean>;
  restoredPaneStatesByPane: Record<string, string | null>;
  restoredIndicatorStyleOverridesByPane: Record<string, Record<string, SeriesStyleOverride>>;
  getRuntimeChartByPaneId: (paneId: string) => { chart: { setTheme: (theme: "dark" | "light") => void; setSeriesStyleOverride: (seriesId: string, style: SeriesStyleOverride) => void } } | null;
  getPrimaryChart: () => { setCursorMode: (mode: string) => void; setPriceAxisMode: (mode: "linear" | "log" | "percent") => void; setCandleStyle: (style: "solid" | "hollow" | "bars" | "volume") => void } | null;
  applyAppearance: (config: { background: string; candle_up: string; candle_down: string }) => void;
  setDrawingsByAsset: (next: Record<string, ChartStateSnapshot>) => void;
}

export function restorePersistedWorkspace(
  options: RestorePersistedWorkspaceOptions
): {
  restoredObjectTreeWidth: number | null;
  restoredWorkspaceLayoutTree: WorkspaceLayoutNode | null;
} {
  if (!options.persistedState || typeof options.persistedState !== "object") {
    return { restoredObjectTreeWidth: null, restoredWorkspaceLayoutTree: null };
  }

  let restoredObjectTreeWidth: number | null = null;
  let restoredWorkspaceLayoutTree: WorkspaceLayoutNode | null = null;
  try {
    const saved = options.persistedState as RestoredWorkspaceShape;
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
    options.setDrawingsByAsset(saved.drawingsByAsset ?? {});
    const persistedChartTiles = normalizePersistedChartTiles(saved.document?.tileSessions ?? saved.chartTiles);
    if (Object.keys(persistedChartTiles).length > 0) {
      const activeChartTileId = saved.document?.workspace.activeChartTileId ?? saved.activeChartTileId;
      const derivedChartPanes = deriveChartPanesFromPersistedTiles(persistedChartTiles);
      const derivedActivePaneId = deriveActivePaneIdFromPersistedTiles(
        persistedChartTiles,
        activeChartTileId
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
          },
        ])
      );
      const derivedWorkspace = saved.document
        ? flattenOwnershipDocumentForLegacyRuntime(saved.document)
        : deriveWorkspaceTilesFromPersistedState(saved, persistedChartTiles);
      options.controller.loadWorkspaceTiles?.(
        derivedWorkspace.workspaceTiles as any,
        derivedWorkspace.workspaceTileOrder,
        runtimeChartTiles as any,
        derivedWorkspace.activeWorkspaceTileId
      );
      restoredWorkspaceLayoutTree =
        derivedWorkspace.workspaceLayoutTree ??
        saved.document?.workspace.workspaceLayoutTree ??
        saved.workspaceLayoutTree ??
        null;
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

  return { restoredObjectTreeWidth, restoredWorkspaceLayoutTree };
}


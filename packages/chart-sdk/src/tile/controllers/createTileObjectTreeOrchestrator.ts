import type { WorkspaceController } from "../../workspace/controllers/WorkspaceController.js";
import type { DrishyaChartClient } from "../../wasm/client.js";
import type { ObjectTreePanelHandle } from "../../workspace/views/objectTreePanel.js";
import type { WorkspaceIntentController } from "../../workspace/controllers/workspaceIntentController.js";
import { createTileObjectTreeHandle } from "../../workspace/views/objectTreeHandleFactory.js";

interface CreateTileObjectTreeOrchestratorOptions {
  controller: WorkspaceController;
  symbols: readonly string[];
  workspaceIntents: WorkspaceIntentController;
  getChartForTile: (chartTileId: string) => DrishyaChartClient | null;
  onPaneSourceChange: (paneId: string, symbol: string) => Promise<void>;
  onIndicatorConfig: (target: { paneId?: string; seriesId?: string; indicatorId?: string }, chart: DrishyaChartClient | null) => void;
  onDrawingConfig: (drawingId: number, chart: DrishyaChartClient | null) => void;
  onLayoutInvalidated: () => void;
  onMutate: () => void;
  minWidth?: number;
  maxWidth?: number;
  defaultWidth?: number;
}

export interface TileObjectTreeOrchestrator {
  ensureHandleForTile: (chartTileId: string) => ObjectTreePanelHandle;
  isOpen: (chartTileId: string) => boolean;
  toggle: (chartTileId: string) => void;
  getOpenStateMap: () => Map<string, boolean>;
  setWidth: (width: number) => void;
  getWidth: () => number;
  getActiveRoot: (activeChartTileId: string) => HTMLElement;
  refreshActive: (activeChartTileId: string) => void;
  refreshOpenTrees: () => void;
  destroy: () => void;
}

export function createTileObjectTreeOrchestrator(
  options: CreateTileObjectTreeOrchestratorOptions
): TileObjectTreeOrchestrator {
  const chartTileTreeOpen = new Map<string, boolean>();
  const treeHandleByChartTileId = new Map<string, ObjectTreePanelHandle>();
  const minWidth = options.minWidth ?? 300;
  const maxWidth = options.maxWidth ?? 760;
  let objectTreeWidth = options.defaultWidth ?? 360;

  const applyWidthToHandles = () => {
    for (const handle of treeHandleByChartTileId.values()) {
      handle.root.style.width = "100%";
      handle.root.style.minWidth = "0";
    }
  };

  const setWidth = (width: number) => {
    objectTreeWidth = Math.max(minWidth, Math.min(maxWidth, Math.floor(width)));
    applyWidthToHandles();
  };

  const ensureHandleForTile = (chartTileId: string): ObjectTreePanelHandle => {
    const existing = treeHandleByChartTileId.get(chartTileId);
    if (existing) return existing;
    const handle = createTileObjectTreeHandle({
      chartTileId,
      controller: options.controller,
      chartTileTreeOpen,
      getChartForTile: options.getChartForTile,
      symbols: options.symbols,
      onPaneSourceChange: options.onPaneSourceChange,
      onIndicatorConfig: options.onIndicatorConfig,
      onDrawingConfig: options.onDrawingConfig,
      workspaceIntents: options.workspaceIntents,
      onSetOpen: () => options.onLayoutInvalidated(),
      onMutate: options.onMutate,
    });
    treeHandleByChartTileId.set(chartTileId, handle);
    applyWidthToHandles();
    return handle;
  };

  const isOpen = (chartTileId: string): boolean => chartTileTreeOpen.get(chartTileId) === true;

  const toggle = (chartTileId: string): void => {
    chartTileTreeOpen.set(chartTileId, !isOpen(chartTileId));
    options.onLayoutInvalidated();
  };

  const getActiveRoot = (activeChartTileId: string): HTMLElement =>
    treeHandleByChartTileId.get(activeChartTileId)?.root ?? document.createElement("div");

  const refreshActive = (activeChartTileId: string): void => {
    treeHandleByChartTileId.get(activeChartTileId)?.refresh();
  };

  const refreshOpenTrees = (): void => {
    for (const [chartTileId, handle] of treeHandleByChartTileId.entries()) {
      if (isOpen(chartTileId)) handle.refresh();
    }
  };

  const destroy = (): void => {
    for (const handle of treeHandleByChartTileId.values()) {
      handle.destroy();
    }
    treeHandleByChartTileId.clear();
    chartTileTreeOpen.clear();
  };

  return {
    ensureHandleForTile,
    isOpen,
    toggle,
    getOpenStateMap: () => chartTileTreeOpen,
    setWidth,
    getWidth: () => objectTreeWidth,
    getActiveRoot,
    refreshActive,
    refreshOpenTrees,
    destroy,
  };
}

import { createObjectTreePanel, type ObjectTreePanelHandle } from "./objectTreePanel.js";
import type { WorkspaceController } from "../controllers/WorkspaceController.js";
import type { DrishyaChartClient } from "../../wasm/client.js";
import type { WorkspaceIntentController } from "../controllers/workspaceIntentController.js";

interface CreateTileObjectTreeHandleOptions {
  chartTileId: string;
  controller: WorkspaceController;
  chartTileTreeOpen: Map<string, boolean>;
  getChartForTile: (chartTileId: string) => DrishyaChartClient | null;
  symbols: readonly string[];
  onPaneSourceChange: (paneId: string, symbol: string) => Promise<void>;
  onIndicatorConfig: (target: { paneId?: string; seriesId?: string; indicatorId?: string }, chart: DrishyaChartClient | null) => void;
  onDrawingConfig: (drawingId: number, chart: DrishyaChartClient | null) => void;
  workspaceIntents: WorkspaceIntentController;
  onSetOpen: (open: boolean) => void;
  onMutate: () => void;
}

export function createTileObjectTreeHandle(
  options: CreateTileObjectTreeHandleOptions
): ObjectTreePanelHandle {
  const getActiveChart = () => options.getChartForTile(options.chartTileId);
  return createObjectTreePanel({
    getChart: getActiveChart,
    getIsOpen: () => options.chartTileTreeOpen.get(options.chartTileId) === true,
    onSetOpen: (open) => {
      options.chartTileTreeOpen.set(options.chartTileId, open);
      options.onSetOpen(open);
    },
    onActivatePane: (paneId) => {
      options.workspaceIntents.setActivePane(paneId);
    },
    controller: options.controller,
    symbols: options.symbols,
    onPaneSourceChange: options.onPaneSourceChange,
    onIndicatorConfig: (target) => {
      options.onIndicatorConfig(target, getActiveChart());
    },
    onDrawingConfig: ({ drawingId }) => {
      options.onDrawingConfig(drawingId, getActiveChart());
    },
    onToggleVisibility: ({ kind, id, visible }) => {
      const chart = getActiveChart();
      if (!chart) return;
      options.workspaceIntents.toggleVisibility(chart, kind, id, visible);
    },
    onToggleLock: ({ kind, id, locked }) => {
      const chart = getActiveChart();
      if (!chart) return;
      options.workspaceIntents.toggleLock(chart, kind, id, locked);
    },
    onDelete: ({ kind, id, paneKind }) => {
      const chart = getActiveChart();
      if (!chart) return;
      options.workspaceIntents.deleteNodeInTile(options.chartTileId, chart, kind, id, paneKind);
    },
    onMovePane: ({ paneId, direction }) => {
      options.workspaceIntents.movePaneInTile(options.chartTileId, paneId, direction);
    },
    onMutate: options.onMutate,
  });
}


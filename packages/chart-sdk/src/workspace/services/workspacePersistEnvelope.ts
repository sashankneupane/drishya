import type { WorkspaceState } from "../controllers/WorkspaceController.js";
import type { ChartAppearanceConfig } from "../../wasm/contracts.js";
import type { PersistedChartTileStoredShape } from "./persistenceHelpers.js";
import type { ChartStateSnapshot } from "../../wasm/contracts.js";

export interface WorkspacePersistenceEnvelope {
  theme: WorkspaceState["theme"];
  cursorMode: WorkspaceState["cursorMode"];
  isObjectTreeOpen: WorkspaceState["isObjectTreeOpen"];
  objectTreeWidth: number;
  isLeftStripOpen: WorkspaceState["isLeftStripOpen"];
  priceAxisMode: WorkspaceState["priceAxisMode"];
  candleStyle?: string;
  appearance?: ChartAppearanceConfig;
  workspaceTiles: WorkspaceState["workspaceTiles"];
  workspaceTileOrder: WorkspaceState["workspaceTileOrder"];
  chartTiles: Record<string, PersistedChartTileStoredShape>;
  drawingsByAsset: Record<string, ChartStateSnapshot>;
  activeChartTileId: WorkspaceState["activeChartTileId"];
  paneLayout: WorkspaceState["paneLayout"];
}

interface WorkspacePersistenceEnvelopeOptions {
  state: WorkspaceState;
  objectTreeWidth: number;
  candleStyle?: string | null;
  appearance?: ChartAppearanceConfig | null;
  chartTiles: Record<string, PersistedChartTileStoredShape>;
  drawingsByAsset?: Record<string, ChartStateSnapshot>;
}

export function serializeWorkspacePersistenceEnvelope(
  options: WorkspacePersistenceEnvelopeOptions
): WorkspacePersistenceEnvelope {
  return {
    theme: options.state.theme,
    cursorMode: options.state.cursorMode,
    isObjectTreeOpen: options.state.isObjectTreeOpen,
    objectTreeWidth: options.objectTreeWidth,
    isLeftStripOpen: options.state.isLeftStripOpen,
    priceAxisMode: options.state.priceAxisMode,
    candleStyle: options.candleStyle ?? undefined,
    appearance: options.appearance ?? undefined,
    workspaceTiles: options.state.workspaceTiles,
    workspaceTileOrder: options.state.workspaceTileOrder,
    chartTiles: options.chartTiles,
    drawingsByAsset: options.drawingsByAsset ?? {},
    activeChartTileId: options.state.activeChartTileId,
    paneLayout: options.state.paneLayout,
  };
}

export function deserializeWorkspacePersistenceEnvelope(
  value: unknown
): WorkspacePersistenceEnvelope | null {
  if (!value || typeof value !== "object") return null;
  return value as WorkspacePersistenceEnvelope;
}

// Backward-compatible alias while consumers migrate.
export const buildPersistedWorkspaceEnvelope = serializeWorkspacePersistenceEnvelope;


import type { WorkspaceState } from "../controllers/WorkspaceController.js";
import type { ChartAppearanceConfig } from "../../wasm/contracts.js";
import type { PersistedChartTileStoredShape } from "./persistenceHelpers.js";
import type { ChartStateSnapshot } from "../../wasm/contracts.js";
import type { WorkspaceLayoutNode } from "../../state/schema.js";
import {
  buildWorkspaceOwnershipDocument,
  type WorkspaceOwnershipDocument,
} from "./workspaceOwnershipDocument.js";

export interface WorkspacePersistenceEnvelope {
  version: 2;
  theme: WorkspaceState["theme"];
  cursorMode: WorkspaceState["cursorMode"];
  isObjectTreeOpen: WorkspaceState["isObjectTreeOpen"];
  objectTreeWidth: number;
  isLeftStripOpen: WorkspaceState["isLeftStripOpen"];
  priceAxisMode: WorkspaceState["priceAxisMode"];
  paneLayout: WorkspaceState["paneLayout"];
  workspaceLayoutTree?: WorkspaceLayoutNode;
  candleStyle?: string;
  appearance?: ChartAppearanceConfig;
  document: WorkspaceOwnershipDocument;
  drawingsByAsset: Record<string, ChartStateSnapshot>;
}

interface WorkspacePersistenceEnvelopeOptions {
  state: WorkspaceState;
  objectTreeWidth: number;
  candleStyle?: string | null;
  appearance?: ChartAppearanceConfig | null;
  chartTiles: Record<string, PersistedChartTileStoredShape>;
  drawingsByAsset?: Record<string, ChartStateSnapshot>;
  workspaceLayoutTree?: WorkspaceLayoutNode;
  chartTileIndicatorTokens?: Record<string, string[]>;
}

export function serializeWorkspacePersistenceEnvelope(
  options: WorkspacePersistenceEnvelopeOptions
): WorkspacePersistenceEnvelope {
  return {
    version: 2,
    theme: options.state.theme,
    cursorMode: options.state.cursorMode,
    isObjectTreeOpen: options.state.isObjectTreeOpen,
    objectTreeWidth: options.objectTreeWidth,
    isLeftStripOpen: options.state.isLeftStripOpen,
    priceAxisMode: options.state.priceAxisMode,
    paneLayout: options.state.paneLayout,
    workspaceLayoutTree: options.workspaceLayoutTree,
    candleStyle: options.candleStyle ?? undefined,
    appearance: options.appearance ?? undefined,
    document: buildWorkspaceOwnershipDocument({
      state: options.state,
      chartTiles: options.chartTiles,
      workspaceLayoutTree: options.workspaceLayoutTree,
      chartTileIndicatorTokens: options.chartTileIndicatorTokens,
    }),
    drawingsByAsset: options.drawingsByAsset ?? {},
  };
}

export function deserializeWorkspacePersistenceEnvelope(
  value: unknown
): WorkspacePersistenceEnvelope | null {
  if (!value || typeof value !== "object") return null;
  return value as WorkspacePersistenceEnvelope;
}

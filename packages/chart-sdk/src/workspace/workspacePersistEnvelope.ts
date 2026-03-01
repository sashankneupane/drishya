import type { WorkspaceState } from "./WorkspaceController.js";
import type { ChartAppearanceConfig } from "../wasm/contracts.js";
import type { PersistedChartTileStoredShape } from "./persistenceHelpers.js";

interface PersistedWorkspaceEnvelopeOptions {
  state: WorkspaceState;
  objectTreeWidth: number;
  candleStyle?: string | null;
  appearance?: ChartAppearanceConfig | null;
  chartTiles: Record<string, PersistedChartTileStoredShape>;
}

export function buildPersistedWorkspaceEnvelope(
  options: PersistedWorkspaceEnvelopeOptions
): Record<string, unknown> {
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
    activeChartTileId: options.state.activeChartTileId,
    paneLayout: options.state.paneLayout,
  };
}


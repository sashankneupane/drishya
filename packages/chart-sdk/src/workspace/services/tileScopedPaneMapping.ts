import type { PaneLayout } from "../../wasm/contracts.js";
import { PRICE_PANE_ID } from "../models/constants.js";
import { canonicalRuntimePaneId } from "../models/paneSpec.js";
import type { WorkspacePaneLayoutState } from "../models/types.js";

export interface TileScopedPaneMapping {
  runtimeRootPaneId: string | null;
  statePaneIdByRuntimePaneId: Map<string, string>;
}

export function buildTileScopedPaneMapping(
  paneLayout: WorkspacePaneLayoutState,
  runtimePanes: readonly PaneLayout[],
  ownerChartPaneId?: string
): TileScopedPaneMapping {
  const owner = ownerChartPaneId ?? PRICE_PANE_ID;
  const stateIndicatorPaneIds = paneLayout.order.filter((id) => {
    const spec = paneLayout.panes[id];
    if (spec?.kind !== "indicator") return false;
    return spec.parentChartPaneId === owner || spec.parentChartPaneId === PRICE_PANE_ID;
  });
  const runtimeRootPaneId =
    runtimePanes.find((pane) => canonicalRuntimePaneId(pane.id) === PRICE_PANE_ID)?.id ??
    runtimePanes[0]?.id ??
    null;
  const statePaneIdByRuntimePaneId = new Map<string, string>();
  let runtimeIndicatorIndex = 0;
  for (const pane of runtimePanes) {
    if (runtimeRootPaneId && pane.id === runtimeRootPaneId) {
      statePaneIdByRuntimePaneId.set(
        pane.id,
        paneLayout.panes[PRICE_PANE_ID] ? PRICE_PANE_ID : canonicalRuntimePaneId(pane.id)
      );
      continue;
    }
    const mappedIndicatorPaneId =
      stateIndicatorPaneIds[runtimeIndicatorIndex] ?? canonicalRuntimePaneId(pane.id);
    statePaneIdByRuntimePaneId.set(pane.id, mappedIndicatorPaneId);
    runtimeIndicatorIndex += 1;
  }
  return {
    runtimeRootPaneId,
    statePaneIdByRuntimePaneId,
  };
}

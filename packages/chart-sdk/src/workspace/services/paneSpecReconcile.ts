import type { DrishyaChartClient } from "../../wasm/client.js";
import type { WorkspaceController } from "../controllers/WorkspaceController.js";
import { buildPaneSpecForRuntime, canonicalRuntimePaneId } from "../models/paneSpec.js";
import { PRICE_PANE_ID } from "../models/constants.js";

interface ReconcilePaneSpecsForRuntimeOptions {
  ownerChartPaneId: string;
  chart: DrishyaChartClient;
  controller: WorkspaceController;
}

export function reconcilePaneSpecsForRuntime({
  ownerChartPaneId,
  chart,
  controller,
}: ReconcilePaneSpecsForRuntimeOptions): void {
  const runtimePanes = chart.paneLayouts();
  if (!runtimePanes.length) return;
  const runtimeOrder = runtimePanes.map((pane) => pane.id);
  const runtimeRootPaneId =
    runtimePanes.find((pane) => canonicalRuntimePaneId(pane.id) === "price")?.id ??
    runtimePanes[0]?.id;
  const state = controller.getState();
  const tileOwnedIndicatorPaneIds = state.paneLayout.order.filter((id) => {
    const spec = state.paneLayout.panes[id];
    if (spec?.kind !== "indicator") return false;
    return spec.parentChartPaneId === ownerChartPaneId || spec.parentChartPaneId === PRICE_PANE_ID;
  });
  let indicatorPanesToRegister = Math.max(
    0,
    runtimePanes.filter((pane) => pane.id !== runtimeRootPaneId).length -
      tileOwnedIndicatorPaneIds.length
  );

  for (const pane of runtimePanes) {
    const paneId = canonicalRuntimePaneId(pane.id);
    if (state.paneLayout.panes[paneId]) continue;
    if (pane.id !== runtimeRootPaneId) {
      if (indicatorPanesToRegister <= 0) continue;
      indicatorPanesToRegister -= 1;
    }
    const spec = buildPaneSpecForRuntime(pane.id, state.paneLayout, runtimeOrder);
    if (spec.kind === "indicator") {
      spec.parentChartPaneId = ownerChartPaneId;
    }
    controller.registerPane(spec);
  }
}

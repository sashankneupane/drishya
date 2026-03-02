import type { DrishyaChartClient } from "../../wasm/client.js";
import type { WorkspaceController } from "../controllers/WorkspaceController.js";
import { buildPaneSpecForRuntime, canonicalRuntimePaneId } from "../models/paneSpec.js";

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
  const state = controller.getState();
  for (const pane of runtimePanes) {
    const paneId = canonicalRuntimePaneId(pane.id);
    if (state.paneLayout.panes[paneId]) continue;
    const spec = buildPaneSpecForRuntime(pane.id, state.paneLayout, runtimeOrder);
    if (spec.kind === "indicator" && !spec.parentChartPaneId) {
      spec.parentChartPaneId = ownerChartPaneId;
    }
    controller.registerPane(spec);
  }
}


import type { ChartStateSnapshot } from "../../wasm/contracts.js";
import type { WorkspaceController } from "../controllers/WorkspaceController.js";
import type { ChartPaneRuntime } from "../models/runtimeTypes.js";

interface ProjectAssetScopedDrawingsArgs {
  controller: WorkspaceController;
  chartRuntimes: Map<string, ChartPaneRuntime>;
  snapshotsByAsset: Map<string, ChartStateSnapshot>;
  signatureByAsset: Map<string, string>;
}

const normalizeAssetId = (raw: string | undefined): string =>
  typeof raw === "string" ? raw.trim().toUpperCase() : "";

const drawingSignature = (snapshot: ChartStateSnapshot): string =>
  JSON.stringify(snapshot.chart_state.drawings ?? []);

export function projectAssetScopedDrawings(args: ProjectAssetScopedDrawingsArgs): void {
  const state = args.controller.getState();
  const paneIdsByAsset = new Map<string, string[]>();
  for (const paneId of Object.keys(state.chartPanes)) {
    const assetId = normalizeAssetId(state.chartPaneSources[paneId]?.symbol);
    if (!assetId) continue;
    const arr = paneIdsByAsset.get(assetId) ?? [];
    arr.push(paneId);
    paneIdsByAsset.set(assetId, arr);
  }

  for (const [assetId, paneIds] of paneIdsByAsset) {
    const runtimePaneIds = paneIds.filter((paneId) => args.chartRuntimes.has(paneId));
    if (runtimePaneIds.length === 0) continue;
    const activePaneId = state.activeChartPaneId;
    const preferredSourcePaneId = runtimePaneIds.includes(activePaneId) ? activePaneId : runtimePaneIds[0]!;
    const sourceRuntime = args.chartRuntimes.get(preferredSourcePaneId);
    if (!sourceRuntime) continue;

    let snapshot: ChartStateSnapshot;
    try {
      snapshot = sourceRuntime.chart.exportChartState();
    } catch {
      continue;
    }

    args.snapshotsByAsset.set(assetId, snapshot);
    const signature = drawingSignature(snapshot);
    const previous = args.signatureByAsset.get(assetId);
    if (previous === signature) continue;
    args.signatureByAsset.set(assetId, signature);

    for (const paneId of runtimePaneIds) {
      if (paneId === preferredSourcePaneId) continue;
      const targetRuntime = args.chartRuntimes.get(paneId);
      if (!targetRuntime) continue;
      targetRuntime.chart.importChartStatePartial(snapshot, {
        drawings: true,
      });
      targetRuntime.chart.draw();
    }
  }
}

export function restoreAssetScopedDrawings(args: {
  controller: WorkspaceController;
  chartRuntimes: Map<string, ChartPaneRuntime>;
  snapshotsByAsset: Map<string, ChartStateSnapshot>;
  signatureByAsset: Map<string, string>;
}): void {
  const state = args.controller.getState();
  for (const [assetId, snapshot] of args.snapshotsByAsset) {
    const signature = drawingSignature(snapshot);
    args.signatureByAsset.set(assetId, signature);
    for (const paneId of Object.keys(state.chartPanes)) {
      if (normalizeAssetId(state.chartPaneSources[paneId]?.symbol) !== assetId) continue;
      const runtime = args.chartRuntimes.get(paneId);
      if (!runtime) continue;
      runtime.chart.importChartStatePartial(snapshot, {
        drawings: true,
      });
      runtime.chart.draw();
    }
  }
}

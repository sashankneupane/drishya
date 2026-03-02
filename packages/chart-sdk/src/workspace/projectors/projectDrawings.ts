import type { Candle, ChartStateSnapshot } from "../../wasm/contracts.js";
import type { WorkspaceController } from "../controllers/WorkspaceController.js";
import type { ChartPaneRuntime } from "../models/runtimeTypes.js";
import {
  annotateSnapshotWithTimestampAnchors,
  candlesSignature,
  drawingSignature,
  remapSnapshotToCandles,
} from "../services/drawingAnchors.js";

interface ProjectAssetScopedDrawingsArgs {
  controller: WorkspaceController;
  chartRuntimes: Map<string, ChartPaneRuntime>;
  snapshotsByAsset: Map<string, ChartStateSnapshot>;
  signatureByAsset: Map<string, string>;
  appliedSignatureByPane: Map<string, string>;
  getCandlesForPane: (paneId: string) => readonly Candle[] | null;
}

const normalizeAssetId = (raw: string | undefined): string =>
  typeof raw === "string" ? raw.trim().toUpperCase() : "";

export function projectAssetScopedDrawings(args: ProjectAssetScopedDrawingsArgs): void {
  const state = args.controller.getState();
  for (const paneId of [...args.appliedSignatureByPane.keys()]) {
    if (!state.chartPanes[paneId]) {
      args.appliedSignatureByPane.delete(paneId);
    }
  }
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
    const sourceCandles = args.getCandlesForPane(preferredSourcePaneId);

    let snapshot: ChartStateSnapshot;
    try {
      snapshot = sourceRuntime.chart.exportChartState();
    } catch {
      continue;
    }
    const sourceAnchoredSnapshot = annotateSnapshotWithTimestampAnchors(snapshot, sourceCandles);

    args.snapshotsByAsset.set(assetId, sourceAnchoredSnapshot);
    const signature = drawingSignature(sourceAnchoredSnapshot);
    const previous = args.signatureByAsset.get(assetId);
    if (previous !== signature) {
      args.signatureByAsset.set(assetId, signature);
    }

    for (const paneId of runtimePaneIds) {
      if (paneId === preferredSourcePaneId) continue;
      const targetRuntime = args.chartRuntimes.get(paneId);
      if (!targetRuntime) continue;
      const targetCandles = args.getCandlesForPane(paneId);
      const appliedKey = `${signature}|src:${candlesSignature(sourceCandles)}|dst:${candlesSignature(targetCandles)}`;
      if (args.appliedSignatureByPane.get(paneId) === appliedKey) continue;
      const remappedSnapshot = remapSnapshotToCandles({
        snapshot: sourceAnchoredSnapshot,
        sourceCandles,
        targetCandles,
      });
      targetRuntime.chart.importChartStatePartial(remappedSnapshot, {
        drawings: true,
      });
      targetRuntime.chart.draw();
      args.appliedSignatureByPane.set(paneId, appliedKey);
    }
  }
}

export function restoreAssetScopedDrawings(args: {
  controller: WorkspaceController;
  chartRuntimes: Map<string, ChartPaneRuntime>;
  snapshotsByAsset: Map<string, ChartStateSnapshot>;
  signatureByAsset: Map<string, string>;
  appliedSignatureByPane: Map<string, string>;
  getCandlesForPane: (paneId: string) => readonly Candle[] | null;
}): void {
  const state = args.controller.getState();
  for (const [assetId, snapshot] of args.snapshotsByAsset) {
    const signature = drawingSignature(snapshot);
    args.signatureByAsset.set(assetId, signature);
    for (const paneId of Object.keys(state.chartPanes)) {
      if (normalizeAssetId(state.chartPaneSources[paneId]?.symbol) !== assetId) continue;
      const runtime = args.chartRuntimes.get(paneId);
      if (!runtime) continue;
      const targetCandles = args.getCandlesForPane(paneId);
      const appliedKey = `${signature}|src:persisted|dst:${candlesSignature(targetCandles)}`;
      if (args.appliedSignatureByPane.get(paneId) === appliedKey) continue;
      const remappedSnapshot = remapSnapshotToCandles({
        snapshot,
        targetCandles,
      });
      runtime.chart.importChartStatePartial(remappedSnapshot, {
        drawings: true,
      });
      runtime.chart.draw();
      args.appliedSignatureByPane.set(paneId, appliedKey);
    }
  }
}

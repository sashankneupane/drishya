import { canonicalRuntimePaneId } from "./paneSpec.js";

export function buildChartRootPaneIdSet(chartPaneIds: string[]): Set<string> {
  return new Set(chartPaneIds.map((id) => canonicalRuntimePaneId(id)));
}


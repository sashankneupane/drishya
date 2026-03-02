import type { DrishyaChartClient } from "../../wasm/client.js";
import type { DiscoveredIndicator, StrictIndicatorStyleSlotConfig } from "../../wasm/contracts.js";
import { assertValidIndicatorPayloadAgainstCatalog } from "../../state/catalogValidation.js";
import { decodeIndicatorToken } from "../indicatorIdentity.js";
import type { WorkspaceController } from "../WorkspaceController.js";

interface ChartTileTabLike {
  chartPaneId: string;
}

interface ChartTileLike {
  tabs: ChartTileTabLike[];
}

interface ProjectTileIndicatorsOptions {
  chartTileId: string;
  chartTile: ChartTileLike | undefined;
  indicatorIds: string[];
  controller: WorkspaceController;
  getRuntime: (paneId: string) => { chart: DrishyaChartClient } | null;
  reconcilePaneSpecsForRuntime: (args: {
    ownerChartPaneId: string;
    chart: DrishyaChartClient;
    controller: WorkspaceController;
  }) => void;
}

const buildStyleSlotsFromCatalog = (
  metadata: DiscoveredIndicator
): Record<string, StrictIndicatorStyleSlotConfig> => {
  const styleSlots: Record<string, StrictIndicatorStyleSlotConfig> = {};
  for (const slot of metadata.visual.style_slots) {
    styleSlots[slot.slot] = {
      kind: slot.kind === "fill" ? "fill" : "stroke",
      color: slot.default.color,
      ...(typeof slot.default.width === "number" ? { width: slot.default.width } : {}),
      ...(typeof slot.default.opacity === "number" ? { opacity: slot.default.opacity } : {}),
      ...(slot.default.pattern ? { pattern: slot.default.pattern } : {}),
    };
  }
  return styleSlots;
};

export function projectTileIndicators(options: ProjectTileIndicatorsOptions): void {
  for (const tab of options.chartTile?.tabs ?? []) {
    const runtime = options.getRuntime(tab.chartPaneId);
    if (!runtime) continue;
    const catalog = runtime.chart.indicatorCatalog();
    runtime.chart.clearIndicatorOverlays();

    options.indicatorIds.forEach((token, indicatorIndex) => {
      const decoded = decodeIndicatorToken(token);
      const metadata = catalog.find(
        (item) => item.id.toLowerCase().trim() === decoded.indicatorId.toLowerCase().trim()
      );
      if (!metadata) {
        throw new Error(
          `Invalid indicator payload: workspace.tiles.${options.chartTileId}.tabs.${tab.chartPaneId}.indicators.${indicatorIndex}.indicatorId: Indicator '${decoded.indicatorId}' was not found in the runtime catalog.`
        );
      }
      const styleSlots = buildStyleSlotsFromCatalog(metadata);
      assertValidIndicatorPayloadAgainstCatalog({
        catalog,
        indicatorId: decoded.indicatorId,
        params: decoded.params ?? {},
        styleSlots,
        path: `workspace.tiles.${options.chartTileId}.tabs.${tab.chartPaneId}.indicators.${indicatorIndex}`,
      });
      runtime.chart.addIndicatorStrict(decoded.indicatorId, decoded.params ?? {}, styleSlots);
    });

    options.reconcilePaneSpecsForRuntime({
      ownerChartPaneId: tab.chartPaneId,
      chart: runtime.chart,
      controller: options.controller,
    });
  }
}

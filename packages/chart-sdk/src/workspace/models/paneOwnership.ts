export interface ChartTileTabsLike {
  tabs: Array<{ chartPaneId: string }>;
}

export function buildPaneToTileOwnershipMap(
  chartTiles: Record<string, ChartTileTabsLike>
): Map<string, string> {
  const paneToTileId = new Map<string, string>();
  for (const [chartTileId, chartTile] of Object.entries(chartTiles)) {
    for (const tab of chartTile.tabs) {
      paneToTileId.set(tab.chartPaneId, chartTileId);
    }
  }
  return paneToTileId;
}


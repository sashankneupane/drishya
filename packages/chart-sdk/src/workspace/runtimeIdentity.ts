interface ChartTabLike {
  id: string;
  chartPaneId: string;
}

interface ChartTileLike {
  tabs: ChartTabLike[];
}

export interface PaneRuntimeIdentity {
  chartTileId?: string;
  chartTabId?: string;
  runtimeKey: string;
}

export function resolvePaneRuntimeIdentity(
  paneId: string,
  chartTiles: Record<string, ChartTileLike>
): PaneRuntimeIdentity {
  for (const [candidateTileId, chartTile] of Object.entries(chartTiles)) {
    const tab = chartTile.tabs.find((candidate) => candidate.chartPaneId === paneId);
    if (!tab) continue;
    return {
      chartTileId: candidateTileId,
      chartTabId: tab.id,
      runtimeKey: `${candidateTileId}:${tab.id}`,
    };
  }
  return { runtimeKey: paneId };
}


export function toggleChartTileObjectTree(
  chartTileTreeOpen: Map<string, boolean>,
  chartTileId: string
): boolean {
  const open = chartTileTreeOpen.get(chartTileId) === true;
  const next = !open;
  chartTileTreeOpen.set(chartTileId, next);
  return next;
}


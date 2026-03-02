type ChartTileLike = {
  tabs: readonly { id: string }[];
  activeTabId: string;
};

export function getActiveTab<TTile extends ChartTileLike>(
  tile: TTile | null | undefined
): TTile["tabs"][number] | undefined {
  if (!tile) return undefined;
  return tile.tabs.find((tab) => tab.id === tile.activeTabId) ?? tile.tabs[0];
}

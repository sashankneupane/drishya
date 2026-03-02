interface PlaceNewChartTileAtPointerOptions {
  orderedChartTileIds: readonly string[];
  tileShellById: Map<string, HTMLDivElement>;
  clientX: number;
  newTileId: string;
  moveWorkspaceTile: (tileId: string, nextIndex: number) => void;
}

export function placeNewChartTileAtPointer(
  options: PlaceNewChartTileAtPointerOptions
): boolean {
  const ordered = [...options.orderedChartTileIds];
  if (!ordered.includes(options.newTileId)) return false;
  const centers = ordered.map((id) => {
    const el = options.tileShellById.get(id);
    const rect = el?.getBoundingClientRect();
    return rect ? rect.left + rect.width / 2 : Number.POSITIVE_INFINITY;
  });
  let targetIndex = ordered.length - 1;
  for (let i = 0; i < centers.length; i += 1) {
    if (options.clientX < centers[i]) {
      targetIndex = i;
      break;
    }
  }
  options.moveWorkspaceTile(options.newTileId, targetIndex);
  return true;
}


export interface ChartTabDragPayload {
  sourceChartTileId: string;
  tabId: string;
}

export function parseChartTabDragPayload(
  dataTransfer: DataTransfer | null
): ChartTabDragPayload | null {
  const raw = dataTransfer?.getData("application/x-drishya-tab");
  if (!raw) return null;
  try {
    const payload = JSON.parse(raw) as ChartTabDragPayload;
    if (!payload?.sourceChartTileId || !payload?.tabId) return null;
    return payload;
  } catch {
    return null;
  }
}


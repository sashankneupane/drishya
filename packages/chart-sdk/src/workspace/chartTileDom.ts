export interface ChartTileStageHost {
  stage: HTMLDivElement;
  chartLayer: HTMLDivElement;
}

export const createTileHeaderElement = (label: string): HTMLDivElement => {
  const header = document.createElement("div");
  header.className =
    "h-9 shrink-0 border-b border-zinc-800/80 bg-zinc-950/95 px-2 flex items-center gap-2 text-[10px] uppercase tracking-wider text-zinc-400 min-w-0";

  const grip = document.createElement("span");
  grip.textContent = "⋮⋮";
  grip.className = "cursor-grab select-none text-zinc-600";

  const title = document.createElement("span");
  title.textContent = label;
  title.className = "truncate";

  header.append(grip, title);
  return header;
};

export const createChartTabStripElement = (): HTMLDivElement => {
  const strip = document.createElement("div");
  strip.className = "flex-1 min-w-0 h-7 px-1 flex items-center gap-1 overflow-x-auto";
  return strip;
};

export const ensureChartTileStageHost = (
  chartTileId: string,
  hosts: Map<string, ChartTileStageHost>
): ChartTileStageHost => {
  const existing = hosts.get(chartTileId);
  if (existing) return existing;

  const stage = document.createElement("div");
  stage.className = "min-h-0 min-w-0 bg-chart-bg flex-shrink-0 relative overflow-hidden flex-1";

  const chartLayer = document.createElement("div");
  chartLayer.className = "absolute inset-0";
  stage.appendChild(chartLayer);

  const next = { stage, chartLayer };
  hosts.set(chartTileId, next);
  return next;
};

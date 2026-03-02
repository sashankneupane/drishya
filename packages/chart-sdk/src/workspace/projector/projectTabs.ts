type ChartTab = {
  id: string;
  title: string;
  chartPaneId: string;
};

type ChartTile = {
  tabs: ChartTab[];
  activeTabId: string;
};

interface ProjectChartTabsArgs {
  chartTileId: string;
  chartTile: ChartTile | undefined;
  tabStrip: HTMLDivElement;
  chartPaneSources: Record<string, { symbol?: string; timeframe?: string }>;
  parseChartTabDragPayload: (dataTransfer: DataTransfer | null) => {
    sourceChartTileId: string;
    tabId: string;
  } | null;
  onTabMove: (
    sourceChartTileId: string,
    tabId: string,
    targetChartTileId: string,
    targetIndex: number
  ) => void;
  onTabActivate: (tabId: string) => void;
  onCloseTabOrTile: (tabId: string) => void;
  appendActions?: (tabStrip: HTMLDivElement, chartTileId: string) => void;
}

const clearDropPreview = (element: HTMLElement): void => {
  element.style.boxShadow = "";
};

export function projectChartTabs(args: ProjectChartTabsArgs): void {
  const {
    chartTileId,
    chartTile,
    tabStrip,
    chartPaneSources,
    parseChartTabDragPayload,
    onTabMove,
    onTabActivate,
    onCloseTabOrTile,
    appendActions,
  } = args;

  tabStrip.innerHTML = "";
  clearDropPreview(tabStrip);
  tabStrip.ondragover = (event) => {
    event.preventDefault();
    tabStrip.style.boxShadow = "inset 0 0 0 1px rgba(161,161,170,0.45)";
  };
  tabStrip.ondragleave = () => clearDropPreview(tabStrip);
  tabStrip.ondrop = (event) => {
    event.preventDefault();
    clearDropPreview(tabStrip);
    const payload = parseChartTabDragPayload(event.dataTransfer);
    if (!payload) return;
    onTabMove(payload.sourceChartTileId, payload.tabId, chartTileId, Number.MAX_SAFE_INTEGER);
  };

  if (!chartTile) return;

  for (const tab of chartTile.tabs) {
    const active = tab.id === chartTile.activeTabId;
    const tabBtn = document.createElement("button");
    tabBtn.className = `h-7 px-3 rounded-none text-[11px] font-medium normal-case border-none transition-colors ${active ? "text-zinc-100 bg-zinc-800/40" : "text-zinc-500 bg-transparent hover:text-zinc-100 hover:bg-zinc-900/50"} cursor-pointer`;
    tabBtn.textContent = "";
    tabBtn.dataset.noTileDrag = "1";
    tabBtn.draggable = true;
    tabBtn.style.boxShadow = "";

    const tabLabel = document.createElement("span");
    const tabSource = chartPaneSources[tab.chartPaneId];
    tabLabel.textContent = tabSource?.symbol || tab.title;
    tabBtn.appendChild(tabLabel);

    const closeInline = document.createElement("button");
    closeInline.dataset.noTileDrag = "1";
    closeInline.className =
      "ml-2 h-4 w-4 inline-flex items-center justify-center rounded-none border-none bg-transparent text-zinc-500 hover:text-zinc-100 hover:bg-zinc-900/60 cursor-pointer";
    closeInline.textContent = "x";
    closeInline.title = chartTile.tabs.length > 1 ? "Close tab" : "Close chart tile";
    closeInline.onclick = (event) => {
      event.stopPropagation();
      event.preventDefault();
      onCloseTabOrTile(tab.id);
    };
    tabBtn.appendChild(closeInline);

    tabBtn.ondragstart = (event) => {
      event.dataTransfer?.setData(
        "application/x-drishya-tab",
        JSON.stringify({ sourceChartTileId: chartTileId, tabId: tab.id })
      );
      event.dataTransfer?.setData("text/plain", tab.id);
    };
    tabBtn.ondragover = (event) => {
      event.preventDefault();
      tabBtn.style.boxShadow = "inset 2px 0 0 rgba(161,161,170,0.7)";
    };
    tabBtn.ondragleave = () => {
      tabBtn.style.boxShadow = "";
    };
    tabBtn.ondrop = (event) => {
      event.preventDefault();
      tabBtn.style.boxShadow = "";
      const payload = parseChartTabDragPayload(event.dataTransfer);
      if (!payload) return;
      const targetIndex = chartTile.tabs.findIndex((candidate) => candidate.id === tab.id);
      onTabMove(payload.sourceChartTileId, payload.tabId, chartTileId, targetIndex);
    };
    tabBtn.onclick = () => onTabActivate(tab.id);
    tabStrip.appendChild(tabBtn);
  }

  appendActions?.(tabStrip, chartTileId);
}

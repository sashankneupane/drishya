import { getActiveTab } from "../services/chartTileSelection.js";
import type { WorkspaceLayoutNode } from "../../state/schema.js";
import { collectWorkspaceTileOrder } from "../services/workspaceTileOrder.js";

type WorkspaceTile = {
  id: string;
  kind: "chart" | "objects";
  title: string;
  chartTileId?: string;
};

type WorkspaceStateLike = {
  workspaceTileOrder: string[];
  workspaceTiles: Record<string, WorkspaceTile>;
  chartTiles: Record<string, { tabs: { id: string; chartPaneId: string }[]; activeTabId: string }>;
  workspaceLayoutTree?: WorkspaceLayoutNode;
};

export interface TileShellMaps {
  tileShellById: Map<string, HTMLDivElement>;
  tileHeaderById: Map<string, HTMLDivElement>;
  chartTileBodyByChartTileId: Map<string, HTMLDivElement>;
}

interface ProjectWorkspaceTilesArgs {
  state: WorkspaceStateLike;
  tilesRow: HTMLDivElement;
  maps: TileShellMaps;
  paneHostByPaneId: Map<string, { stage: HTMLDivElement; chartLayer: HTMLDivElement }>;
  createTileHeader: (title: string) => HTMLDivElement;
  attachTileHeaderDragReorder: (args: {
    header: HTMLDivElement;
    shell: HTMLDivElement;
    tileId: string;
  }) => void;
  ensureChartTabStrip: (chartTileId: string) => HTMLDivElement;
  renderChartTabs: (chartTileId: string) => void;
  ensureChartTileStage: (chartTileId: string) => { stage: HTMLDivElement; chartLayer: HTMLDivElement };
  ensureTreeHandleForTile: (chartTileId: string) => { root: HTMLElement };
  isChartTileTreeOpen: (chartTileId: string) => boolean;
  getRuntime: (paneId: string) => { container: HTMLDivElement } | null;
  onChartTileHeaderClick: (chartTileId: string) => void;
  parseChartTabDragPayload: (dataTransfer: DataTransfer | null) => {
    sourceChartTileId: string;
    tabId: string;
  } | null;
  moveChartTab: (
    sourceChartTileId: string,
    tabId: string,
    targetChartTileId: string,
    targetIndex: number
  ) => void;
  attachTileResizer: (args: {
    shell: HTMLDivElement;
    tileId: string;
    visibleChartOrder: string[];
  }) => void;
}

export function projectWorkspaceTiles(args: ProjectWorkspaceTilesArgs): void {
  const {
    state,
    tilesRow,
    maps,
    paneHostByPaneId,
    createTileHeader,
    attachTileHeaderDragReorder,
    ensureChartTabStrip,
    renderChartTabs,
    ensureChartTileStage,
    ensureTreeHandleForTile,
    isChartTileTreeOpen,
    getRuntime,
    onChartTileHeaderClick,
    parseChartTabDragPayload,
    moveChartTab,
    attachTileResizer,
  } = args;

  const order = collectWorkspaceTileOrder({
    layoutTree: state.workspaceLayoutTree,
    workspaceTileOrder: state.workspaceTileOrder,
    workspaceTiles: state.workspaceTiles,
  });
  const visibleChartOrder = order.filter((tileId) => state.workspaceTiles[tileId]?.kind === "chart");
  paneHostByPaneId.clear();

  const seen = new Set(order);
  for (const existing of Array.from(maps.tileShellById.keys())) {
    if (seen.has(existing)) continue;
    maps.tileShellById.get(existing)?.remove();
    maps.tileShellById.delete(existing);
    maps.tileHeaderById.delete(existing);
  }

  for (let index = 0; index < order.length; index += 1) {
    const tileId = order[index];
    const tile = state.workspaceTiles[tileId];
    if (!tile) continue;
    let shell = maps.tileShellById.get(tileId);
    if (!shell) {
      shell = document.createElement("div");
      shell.className = "h-full min-h-0 min-w-0 flex flex-col border-r border-zinc-900/80 bg-zinc-950/60";
      const header = createTileHeader(tile.title);
      maps.tileHeaderById.set(tileId, header);
      const body = document.createElement("div");
      body.className = "flex-1 min-h-0 min-w-0";
      shell.append(header, body);
      maps.tileShellById.set(tileId, shell);
    }
    const header = maps.tileHeaderById.get(tileId);
    if (!header) continue;
    header.onclick = () => {
      if (tile.kind === "chart" && tile.chartTileId) {
        onChartTileHeaderClick(tile.chartTileId);
      }
    };
    attachTileHeaderDragReorder({ header, shell, tileId });

    const body = shell.children[1] as HTMLDivElement;
    body.innerHTML = "";
    if (tile.kind === "chart" && tile.chartTileId) {
      const tabs = ensureChartTabStrip(tile.chartTileId);
      if (!header.contains(tabs)) {
        header.appendChild(tabs);
      }
      header.ondragover = (event) => {
        event.preventDefault();
        tabs.style.boxShadow = "inset 0 0 0 1px rgba(161,161,170,0.45)";
      };
      header.ondragleave = () => {
        tabs.style.boxShadow = "";
      };
      header.ondrop = (event) => {
        event.preventDefault();
        tabs.style.boxShadow = "";
        const payload = parseChartTabDragPayload(event.dataTransfer);
        if (!payload) return;
        moveChartTab(payload.sourceChartTileId, payload.tabId, tile.chartTileId!, Number.MAX_SAFE_INTEGER);
      };

      let tileBody = maps.chartTileBodyByChartTileId.get(tile.chartTileId);
      if (!tileBody) {
        tileBody = document.createElement("div");
        tileBody.className = "h-full w-full min-h-0 min-w-0 flex flex-col";
        maps.chartTileBodyByChartTileId.set(tile.chartTileId, tileBody);
      }
      while (tileBody.children.length > 0) {
        tileBody.removeChild(tileBody.lastChild!);
      }

      const stageHost = ensureChartTileStage(tile.chartTileId);
      const tileTree = ensureTreeHandleForTile(tile.chartTileId);
      const contentRow = document.createElement("div");
      contentRow.className = "flex-1 min-h-0 min-w-0 flex";
      stageHost.stage.classList.add("flex-1");
      contentRow.appendChild(stageHost.stage);
      if (isChartTileTreeOpen(tile.chartTileId)) {
        tileTree.root.style.display = "flex";
        tileTree.root.style.width = "320px";
        tileTree.root.style.minWidth = "280px";
        contentRow.appendChild(tileTree.root);
      } else {
        tileTree.root.style.display = "none";
      }
      tileBody.appendChild(contentRow);

      const chartTile = state.chartTiles[tile.chartTileId];
      const activeTab = getActiveTab(chartTile);
      if (activeTab) {
        paneHostByPaneId.set(activeTab.chartPaneId, stageHost);
        const runtime = getRuntime(activeTab.chartPaneId);
        if (runtime && runtime.container.parentElement !== stageHost.chartLayer) {
          runtime.container.parentElement?.removeChild(runtime.container);
          stageHost.chartLayer.appendChild(runtime.container);
        }
      }
      body.appendChild(tileBody);
      renderChartTabs(tile.chartTileId);
    } else {
      header.ondragover = null;
      header.ondragleave = null;
      header.ondrop = null;
    }

    if (tilesRow.children[index] !== shell) {
      if (index >= tilesRow.children.length) {
        tilesRow.appendChild(shell);
      } else {
        tilesRow.insertBefore(shell, tilesRow.children[index]);
      }
    }
    attachTileResizer({ shell, tileId, visibleChartOrder });
  }
}

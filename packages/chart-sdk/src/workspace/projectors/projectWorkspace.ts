import type { ChartPaneRuntime } from "../models/runtimeTypes.js";
import { projectPanes } from "./projectPanes.js";
import { projectWorkspaceTiles, type TileShellMaps } from "./projectTiles.js";
import type { WorkspaceLayoutNode } from "../../state/schema.js";

interface ProjectWorkspaceArgs {
  state: {
    workspaceTileOrder: string[];
    workspaceTiles: Record<string, { id: string; kind: "chart" | "objects"; title: string; chartTileId?: string }>;
    chartTiles: Record<string, { tabs: { id: string; chartPaneId: string }[]; activeTabId: string }>;
    chartPanes: Record<string, { visible: boolean }>;
    workspaceLayoutTree?: WorkspaceLayoutNode;
  };
  tilesRow: HTMLDivElement;
  maps: TileShellMaps;
  paneHostByPaneId: Map<string, { stage: HTMLDivElement; chartLayer: HTMLDivElement }>;
  chartRuntimes: Map<string, ChartPaneRuntime>;
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
  createRuntimeForPane: (paneId: string) => ChartPaneRuntime;
  ensureRuntimeInteractions: (runtime: ChartPaneRuntime) => void;
  afterProject?: () => void;
}

export function projectWorkspace(args: ProjectWorkspaceArgs): void {
  projectWorkspaceTiles({
    state: args.state,
    tilesRow: args.tilesRow,
    maps: args.maps,
    paneHostByPaneId: args.paneHostByPaneId,
    createTileHeader: args.createTileHeader,
    attachTileHeaderDragReorder: args.attachTileHeaderDragReorder,
    ensureChartTabStrip: args.ensureChartTabStrip,
    renderChartTabs: args.renderChartTabs,
    ensureChartTileStage: args.ensureChartTileStage,
    ensureTreeHandleForTile: args.ensureTreeHandleForTile,
    isChartTileTreeOpen: args.isChartTileTreeOpen,
    getRuntime: args.getRuntime,
    onChartTileHeaderClick: args.onChartTileHeaderClick,
    parseChartTabDragPayload: args.parseChartTabDragPayload,
    moveChartTab: args.moveChartTab,
    attachTileResizer: args.attachTileResizer,
  });

  projectPanes({
    state: args.state,
    paneHostByPaneId: args.paneHostByPaneId,
    chartRuntimes: args.chartRuntimes,
    createRuntimeForPane: args.createRuntimeForPane,
    ensureRuntimeInteractions: args.ensureRuntimeInteractions,
  });

  args.afterProject?.();
}

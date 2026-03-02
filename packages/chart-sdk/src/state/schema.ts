export type AssetId = string;
export type TileId = string;
export type TabId = string;
export type PaneId = string;
export type IndicatorInstanceId = string;
export type DrawingId = string;

export interface WorkspaceDocument {
  workspace: WorkspaceState;
}

export interface WorkspaceState {
  activeTileId: TileId | null;
  layoutTree: WorkspaceLayoutNode;
  tiles: Record<TileId, TileState>;
  drawingsByAsset: Record<AssetId, Record<DrawingId, DrawingState>>;
  ui: WorkspaceUiState;
}

export type WorkspaceLayoutNode =
  | {
      type: "leaf";
      tileId: TileId;
    }
  | {
      type: "split";
      id: string;
      direction: "row" | "column";
      ratio: number;
      first: WorkspaceLayoutNode;
      second: WorkspaceLayoutNode;
    };

export interface TileState {
  id: TileId;
  kind: "chart" | "objects";
  title: string;
  chart?: ChartTileState;
}

export interface ChartTileState {
  activeTabId: TabId;
  tabOrder: TabId[];
  tabs: Record<TabId, ChartTabState>;
  indicatorOrder: IndicatorInstanceId[];
  indicators: Record<IndicatorInstanceId, IndicatorInstanceState>;
  viewport: {
    priceAxisMode: "linear" | "log" | "percent";
    startTs?: number;
    endTs?: number;
  };
  paneOrder: PaneId[];
  panes: Record<PaneId, PaneState>;
}

export interface ChartTabState {
  id: TabId;
  title: string;
  source: {
    assetId: AssetId;
    timeframe: string;
  };
}

export interface PaneState {
  id: PaneId;
  kind: "price" | "indicator";
  title: string;
  visible: boolean;
  ratio: number;
  lockedHeight?: boolean;
}

export interface IndicatorInstanceState {
  id: IndicatorInstanceId;
  indicatorId: string;
  paneId: PaneId;
  visible: boolean;
  params: Record<string, string | number | boolean>;
  styleSlots: Record<string, IndicatorStyleSlotState>;
}

export interface IndicatorStyleSlotState {
  kind: "stroke" | "fill" | "histogram" | "markers";
  color: string;
  width?: number;
  opacity?: number;
  pattern?: "solid" | "dashed" | "dotted";
  positiveColor?: string;
  negativeColor?: string;
  widthFactor?: number;
  size?: number;
}

export interface DrawingState {
  id: DrawingId;
  assetId: AssetId;
  type: string;
  geometry: unknown;
  style: Record<string, unknown>;
  visible: boolean;
  locked: boolean;
  zIndex: number;
  createdAt: number;
  updatedAt: number;
}

export interface WorkspaceUiState {
  theme: "dark" | "light";
  activeTool: string;
  isObjectTreeOpen: boolean;
  isLeftStripOpen: boolean;
}

import type {
  AssetId,
  ChartTabState,
  DrawingId,
  DrawingState,
  IndicatorInstanceId,
  IndicatorInstanceState,
  PaneId,
  PaneState,
  TabId,
  TileId,
  WorkspaceLayoutNode,
  WorkspaceUiState,
} from "./schema.js";

export type WorkspaceIntent =
  | { type: "workspace/tile_added"; payload: { tileId: TileId; tile: import("./schema.js").TileState } }
  | { type: "workspace/tile_removed"; payload: { tileId: TileId } }
  | {
      type: "workspace/tile_split";
      payload: {
        splitNodeId: string;
        targetTileId: TileId;
        direction: "row" | "column";
        ratio: number;
        first: WorkspaceLayoutNode;
        second: WorkspaceLayoutNode;
      };
    }
  | {
      type: "workspace/tile_moved";
      payload: {
        activeTileId: TileId | null;
      };
    }
  | {
      type: "workspace/split_resized";
      payload: {
        splitNodeId: string;
        ratio: number;
      };
    }
  | {
      type: "workspace/tab_added";
      payload: {
        tileId: TileId;
        tab: ChartTabState;
        setActive?: boolean;
      };
    }
  | {
      type: "workspace/tab_removed";
      payload: {
        tileId: TileId;
        tabId: TabId;
      };
    }
  | {
      type: "workspace/tab_activated";
      payload: {
        tileId: TileId;
        tabId: TabId;
      };
    }
  | {
      type: "workspace/tab_source_set";
      payload: {
        tileId: TileId;
        tabId: TabId;
        source: {
          assetId: AssetId;
          timeframe: string;
        };
      };
    }
  | {
      type: "workspace/tile_viewport_set";
      payload: {
        tileId: TileId;
        viewport: {
          priceAxisMode: "linear" | "log" | "percent";
          startTs?: number;
          endTs?: number;
        };
      };
    }
  | {
      type: "workspace/pane_moved";
      payload: {
        tileId: TileId;
        paneId: PaneId;
        toIndex: number;
      };
    }
  | {
      type: "workspace/pane_removed";
      payload: {
        tileId: TileId;
        paneId: PaneId;
      };
    }
  | {
      type: "workspace/pane_ratio_set";
      payload: {
        tileId: TileId;
        paneId: PaneId;
        ratio: number;
      };
    }
  | {
      type: "workspace/indicator_added";
      payload: {
        tileId: TileId;
        indicator: IndicatorInstanceState;
      };
    }
  | {
      type: "workspace/indicator_updated";
      payload: {
        tileId: TileId;
        indicatorId: IndicatorInstanceId;
        patch: Partial<Omit<IndicatorInstanceState, "id">>;
      };
    }
  | {
      type: "workspace/indicator_removed";
      payload: {
        tileId: TileId;
        indicatorId: IndicatorInstanceId;
      };
    }
  | {
      type: "workspace/indicator_style_updated";
      payload: {
        tileId: TileId;
        indicatorId: IndicatorInstanceId;
        slotKey: string;
        patch: Partial<IndicatorInstanceState["styleSlots"][string]>;
      };
    }
  | {
      type: "workspace/drawing_added";
      payload: {
        drawing: DrawingState;
      };
    }
  | {
      type: "workspace/drawing_updated";
      payload: {
        assetId: AssetId;
        drawingId: DrawingId;
        patch: Partial<Omit<DrawingState, "id" | "assetId">>;
      };
    }
  | {
      type: "workspace/drawing_removed";
      payload: {
        assetId: AssetId;
        drawingId: DrawingId;
      };
    }
  | {
      type: "workspace/ui_updated";
      payload: {
        patch: Partial<WorkspaceUiState>;
      };
    }
  | {
      type: "workspace/pane_added";
      payload: {
        tileId: TileId;
        pane: PaneState;
        toIndex?: number;
      };
    };

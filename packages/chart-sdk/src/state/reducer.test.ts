import type { WorkspaceDocument } from "./schema.js";
import { reduceWorkspaceDocument } from "./reducer.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function createBaseDocument(): WorkspaceDocument {
  return {
    workspace: {
      activeTileId: "tile-a",
      layoutTree: {
        type: "leaf",
        tileId: "tile-a",
      },
      tiles: {
        "tile-a": {
          id: "tile-a",
          kind: "chart",
          title: "Main",
          chart: {
            activeTabId: "tab-1",
            tabOrder: ["tab-1"],
            tabs: {
              "tab-1": {
                id: "tab-1",
                title: "BTC",
                source: {
                  assetId: "BTCUSDT",
                  timeframe: "1h",
                },
              },
            },
            indicatorOrder: [],
            indicators: {},
            viewport: {
              priceAxisMode: "linear",
            },
            paneOrder: ["price"],
            panes: {
              price: {
                id: "price",
                kind: "price",
                title: "Price",
                visible: true,
                ratio: 1,
              },
            },
          },
        },
      },
      drawingsByAsset: {},
      ui: {
        theme: "dark",
        activeTool: "cursor",
        isObjectTreeOpen: true,
        isLeftStripOpen: true,
      },
    },
  };
}

function testSplitAndResize() {
  const initial = createBaseDocument();
  const withSecondTile = reduceWorkspaceDocument(initial, {
    type: "workspace/tile_added",
    payload: {
      tileId: "tile-b",
      tile: {
        id: "tile-b",
        kind: "chart",
        title: "Secondary",
        chart: {
          activeTabId: "tab-2",
          tabOrder: ["tab-2"],
          tabs: {
            "tab-2": {
              id: "tab-2",
              title: "ETH",
              source: { assetId: "ETHUSDT", timeframe: "4h" },
            },
          },
          indicatorOrder: [],
          indicators: {},
          viewport: { priceAxisMode: "linear" },
          paneOrder: ["price"],
          panes: {
            price: {
              id: "price",
              kind: "price",
              title: "Price",
              visible: true,
              ratio: 1,
            },
          },
        },
      },
    },
  });
  const split = reduceWorkspaceDocument(withSecondTile, {
    type: "workspace/tile_split",
    payload: {
      splitNodeId: "split-root",
      targetTileId: "tile-a",
      direction: "row",
      ratio: 0.5,
      first: { type: "leaf", tileId: "tile-a" },
      second: { type: "leaf", tileId: "tile-b" },
    },
  });
  const resized = reduceWorkspaceDocument(split, {
    type: "workspace/split_resized",
    payload: {
      splitNodeId: "split-root",
      ratio: 0.35,
    },
  });
  assert(resized.workspace.layoutTree.type === "split", "Expected split root layout node.");
  assert(resized.workspace.layoutTree.ratio === 0.35, "Expected split ratio to be updated.");
}

function testPaneMoveAndViewportScope() {
  let state = createBaseDocument();
  state = reduceWorkspaceDocument(state, {
    type: "workspace/pane_added",
    payload: {
      tileId: "tile-a",
      pane: {
        id: "rsi",
        kind: "indicator",
        title: "RSI",
        visible: true,
        ratio: 0.3,
      },
    },
  });
  state = reduceWorkspaceDocument(state, {
    type: "workspace/pane_moved",
    payload: {
      tileId: "tile-a",
      paneId: "rsi",
      toIndex: 0,
    },
  });
  assert(
    state.workspace.tiles["tile-a"]?.chart?.paneOrder.join(",") === "rsi,price",
    "Expected pane order move to be state-driven."
  );

  const beforeTabSource = state.workspace.tiles["tile-a"]?.chart?.tabs["tab-1"]?.source.assetId;
  state = reduceWorkspaceDocument(state, {
    type: "workspace/tile_viewport_set",
    payload: {
      tileId: "tile-a",
      viewport: {
        priceAxisMode: "log",
        startTs: 100,
        endTs: 200,
      },
    },
  });
  assert(
    state.workspace.tiles["tile-a"]?.chart?.viewport.priceAxisMode === "log",
    "Expected viewport to update on tile."
  );
  assert(
    state.workspace.tiles["tile-a"]?.chart?.tabs["tab-1"]?.source.assetId === beforeTabSource,
    "Viewport update must not mutate tab source."
  );
}

function testIndicatorCrud() {
  let state = createBaseDocument();
  state = reduceWorkspaceDocument(state, {
    type: "workspace/indicator_added",
    payload: {
      tileId: "tile-a",
      indicator: {
        id: "ind-rsi",
        indicatorId: "rsi",
        paneId: "price",
        visible: true,
        params: { length: 14 },
        styleSlots: {
          line: {
            kind: "stroke",
            color: "#ff0000",
            width: 2,
          },
        },
      },
    },
  });
  state = reduceWorkspaceDocument(state, {
    type: "workspace/indicator_updated",
    payload: {
      tileId: "tile-a",
      indicatorId: "ind-rsi",
      patch: {
        visible: false,
      },
    },
  });
  state = reduceWorkspaceDocument(state, {
    type: "workspace/indicator_removed",
    payload: {
      tileId: "tile-a",
      indicatorId: "ind-rsi",
    },
  });
  assert(
    state.workspace.tiles["tile-a"]?.chart?.indicatorOrder.length === 0,
    "Expected indicator to be removed from order."
  );
}

function testDrawingCrud() {
  let state = createBaseDocument();
  state = reduceWorkspaceDocument(state, {
    type: "workspace/drawing_added",
    payload: {
      drawing: {
        id: "draw-1",
        assetId: "BTCUSDT",
        type: "trendline",
        geometry: {},
        style: { color: "#fff" },
        visible: true,
        locked: false,
        zIndex: 1,
        createdAt: 1,
        updatedAt: 1,
      },
    },
  });
  state = reduceWorkspaceDocument(state, {
    type: "workspace/drawing_updated",
    payload: {
      assetId: "BTCUSDT",
      drawingId: "draw-1",
      patch: {
        visible: false,
        updatedAt: 2,
      },
    },
  });
  state = reduceWorkspaceDocument(state, {
    type: "workspace/drawing_removed",
    payload: {
      assetId: "BTCUSDT",
      drawingId: "draw-1",
    },
  });
  assert(
    typeof state.workspace.drawingsByAsset.BTCUSDT?.["draw-1"] === "undefined",
    "Expected drawing to be removed from asset bucket."
  );
}

testSplitAndResize();
testPaneMoveAndViewportScope();
testIndicatorCrud();
testDrawingCrud();

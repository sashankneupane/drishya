import type { WorkspaceDocument } from "./schema.js";
import { reduceWorkspaceDocument } from "./reducer.js";
import { validateWorkspaceDocument } from "./validator.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function createDocument(): WorkspaceDocument {
  return {
    workspace: {
      activeTileId: "tile-btc",
      layoutTree: {
        type: "split",
        id: "split-root",
        direction: "row",
        ratio: 0.5,
        first: { type: "leaf", tileId: "tile-btc" },
        second: { type: "leaf", tileId: "tile-eth" },
      },
      tiles: {
        "tile-btc": {
          id: "tile-btc",
          kind: "chart",
          title: "BTC",
          chart: {
            activeTabId: "tab-btc",
            tabOrder: ["tab-btc"],
            tabs: {
              "tab-btc": {
                id: "tab-btc",
                title: "BTCUSDT",
                source: { assetId: "BTCUSDT", timeframe: "1h" },
              },
            },
            indicatorOrder: [],
            indicators: {},
            viewport: { priceAxisMode: "linear" },
            paneOrder: ["price"],
            panes: {
              price: { id: "price", kind: "price", title: "Price", visible: true, ratio: 1 },
            },
          },
        },
        "tile-eth": {
          id: "tile-eth",
          kind: "chart",
          title: "ETH",
          chart: {
            activeTabId: "tab-eth",
            tabOrder: ["tab-eth"],
            tabs: {
              "tab-eth": {
                id: "tab-eth",
                title: "ETHUSDT",
                source: { assetId: "ETHUSDT", timeframe: "1h" },
              },
            },
            indicatorOrder: [],
            indicators: {},
            viewport: { priceAxisMode: "linear" },
            paneOrder: ["price"],
            panes: {
              price: { id: "price", kind: "price", title: "Price", visible: true, ratio: 1 },
            },
          },
        },
      },
      drawingsByAsset: {},
      ui: {
        theme: "dark",
        activeTool: "select",
        isObjectTreeOpen: false,
        isLeftStripOpen: true,
      },
    },
  };
}

function testDeterministicWorkspaceReconstruction() {
  let state = createDocument();
  state = reduceWorkspaceDocument(state, {
    type: "workspace/pane_added",
    payload: {
      tileId: "tile-btc",
      pane: { id: "rsi", kind: "indicator", title: "RSI", visible: true, ratio: 0.3 },
    },
  });
  state = reduceWorkspaceDocument(state, {
    type: "workspace/pane_moved",
    payload: { tileId: "tile-btc", paneId: "rsi", toIndex: 0 },
  });
  state = reduceWorkspaceDocument(state, {
    type: "workspace/drawing_added",
    payload: {
      drawing: {
        id: "draw-btc-1",
        assetId: "BTCUSDT",
        type: "hline",
        geometry: { price: 101 },
        style: { color: "#fff" },
        visible: true,
        locked: false,
        zIndex: 1,
        createdAt: 1,
        updatedAt: 1,
      },
    },
  });

  const serialized = JSON.stringify(state);
  const restored = JSON.parse(serialized) as WorkspaceDocument;
  const validation = validateWorkspaceDocument(restored);
  assert(validation.ok, `Restored workspace document should validate: ${JSON.stringify(validation.errors)}`);
  assert(
    restored.workspace.tiles["tile-btc"]?.chart?.paneOrder.join(",") === "rsi,price",
    "Pane order should round-trip deterministically."
  );
}

function testAssetScopedDrawingBucketsDoNotDrift() {
  let state = createDocument();
  state = reduceWorkspaceDocument(state, {
    type: "workspace/drawing_added",
    payload: {
      drawing: {
        id: "draw-btc",
        assetId: "BTCUSDT",
        type: "trendline",
        geometry: {},
        style: {},
        visible: true,
        locked: false,
        zIndex: 1,
        createdAt: 1,
        updatedAt: 1,
      },
    },
  });
  state = reduceWorkspaceDocument(state, {
    type: "workspace/drawing_added",
    payload: {
      drawing: {
        id: "draw-eth",
        assetId: "ETHUSDT",
        type: "trendline",
        geometry: {},
        style: {},
        visible: true,
        locked: false,
        zIndex: 1,
        createdAt: 1,
        updatedAt: 1,
      },
    },
  });
  state = reduceWorkspaceDocument(state, {
    type: "workspace/drawing_removed",
    payload: {
      assetId: "ETHUSDT",
      drawingId: "draw-eth",
    },
  });

  assert(!!state.workspace.drawingsByAsset.BTCUSDT?.["draw-btc"], "BTC drawing should remain in BTC bucket.");
  assert(
    typeof state.workspace.drawingsByAsset.ETHUSDT?.["draw-btc"] === "undefined",
    "BTC drawing must not leak into ETH bucket."
  );
  assert(
    typeof state.workspace.drawingsByAsset.ETHUSDT?.["draw-eth"] === "undefined",
    "ETH drawing should be removed from ETH bucket."
  );
}

testDeterministicWorkspaceReconstruction();
testAssetScopedDrawingBucketsDoNotDrift();

import type {
  ChartTileState,
  WorkspaceDocument,
  WorkspaceLayoutNode,
  WorkspaceState,
} from "./schema.js";
import type { WorkspaceIntent } from "./intents.js";
import { assertValidWorkspaceDocument } from "./validator.js";

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const moveItem = <T>(items: T[], fromIndex: number, toIndex: number): T[] => {
  if (fromIndex < 0 || fromIndex >= items.length) return items;
  const boundedTo = clamp(toIndex, 0, items.length - 1);
  if (fromIndex === boundedTo) return items;
  const next = [...items];
  const [item] = next.splice(fromIndex, 1);
  if (typeof item === "undefined") return items;
  next.splice(boundedTo, 0, item);
  return next;
};

const removeFromLayoutTree = (
  node: WorkspaceLayoutNode,
  tileId: string
): WorkspaceLayoutNode | null => {
  if (node.type === "leaf") {
    return node.tileId === tileId ? null : node;
  }
  const first = removeFromLayoutTree(node.first, tileId);
  const second = removeFromLayoutTree(node.second, tileId);
  if (!first && !second) return null;
  if (!first) return second;
  if (!second) return first;
  return { ...node, first, second };
};

const replaceSplitNode = (
  node: WorkspaceLayoutNode,
  splitNodeId: string,
  replacement: WorkspaceLayoutNode
): WorkspaceLayoutNode => {
  if (node.type === "leaf") return node;
  if (node.id === splitNodeId) return replacement;
  return {
    ...node,
    first: replaceSplitNode(node.first, splitNodeId, replacement),
    second: replaceSplitNode(node.second, splitNodeId, replacement),
  };
};

const replaceLeafTile = (
  node: WorkspaceLayoutNode,
  targetTileId: string,
  replacement: WorkspaceLayoutNode
): { node: WorkspaceLayoutNode; replaced: boolean } => {
  if (node.type === "leaf") {
    if (node.tileId !== targetTileId) {
      return { node, replaced: false };
    }
    return { node: replacement, replaced: true };
  }
  const first = replaceLeafTile(node.first, targetTileId, replacement);
  if (first.replaced) {
    return {
      node: {
        ...node,
        first: first.node,
      },
      replaced: true,
    };
  }
  const second = replaceLeafTile(node.second, targetTileId, replacement);
  if (second.replaced) {
    return {
      node: {
        ...node,
        second: second.node,
      },
      replaced: true,
    };
  }
  return { node, replaced: false };
};

const resizeSplitNode = (
  node: WorkspaceLayoutNode,
  splitNodeId: string,
  ratio: number
): WorkspaceLayoutNode => {
  if (node.type === "leaf") return node;
  if (node.id === splitNodeId) {
    return { ...node, ratio: clamp(ratio, 0.01, 0.99) };
  }
  return {
    ...node,
    first: resizeSplitNode(node.first, splitNodeId, ratio),
    second: resizeSplitNode(node.second, splitNodeId, ratio),
  };
};

const getChartTile = (state: WorkspaceState, tileId: string): ChartTileState => {
  const tile = state.tiles[tileId];
  if (!tile) throw new Error(`Unknown tile '${tileId}'.`);
  if (tile.kind !== "chart" || !tile.chart) throw new Error(`Tile '${tileId}' is not a chart tile.`);
  return tile.chart;
};

const updateChartTile = (
  state: WorkspaceState,
  tileId: string,
  updater: (chart: ChartTileState) => ChartTileState
): WorkspaceState => {
  const tile = state.tiles[tileId];
  if (!tile) throw new Error(`Unknown tile '${tileId}'.`);
  if (tile.kind !== "chart" || !tile.chart) throw new Error(`Tile '${tileId}' is not a chart tile.`);
  return {
    ...state,
    tiles: {
      ...state.tiles,
      [tileId]: {
        ...tile,
        chart: updater(tile.chart),
      },
    },
  };
};

export function reduceWorkspaceDocument(
  current: WorkspaceDocument,
  intent: WorkspaceIntent
): WorkspaceDocument {
  assertValidWorkspaceDocument(current);
  const state = current.workspace;

  const nextState = reduceWorkspaceState(state, intent);
  const nextDocument: WorkspaceDocument = {
    workspace: nextState,
  };
  assertValidWorkspaceDocument(nextDocument);
  return nextDocument;
}

export function reduceWorkspaceState(
  state: WorkspaceState,
  intent: WorkspaceIntent
): WorkspaceState {
  switch (intent.type) {
    case "workspace/tile_added": {
      const { tileId, tile } = intent.payload;
      if (state.tiles[tileId]) throw new Error(`Tile '${tileId}' already exists.`);
      const existingLeaf = state.layoutTree;
      const nextLayout: WorkspaceLayoutNode = {
        type: "split",
        id: `auto-split-${tileId}`,
        direction: "row",
        ratio: 0.5,
        first: existingLeaf,
        second: {
          type: "leaf",
          tileId,
        },
      };
      return {
        ...state,
        activeTileId: state.activeTileId ?? tileId,
        layoutTree: nextLayout,
        tiles: {
          ...state.tiles,
          [tileId]: tile,
        },
      };
    }
    case "workspace/tile_removed": {
      const { tileId } = intent.payload;
      if (!state.tiles[tileId]) return state;
      const { [tileId]: _removed, ...restTiles } = state.tiles;
      const nextLayout = removeFromLayoutTree(state.layoutTree, tileId);
      if (!nextLayout) throw new Error("Cannot remove the last remaining tile.");
      return {
        ...state,
        activeTileId: state.activeTileId === tileId ? null : state.activeTileId,
        tiles: restTiles,
        layoutTree: nextLayout,
      };
    }
    case "workspace/tile_split": {
      const { splitNodeId, targetTileId, direction, ratio, first, second } = intent.payload;
      const nextNode: WorkspaceLayoutNode = {
        type: "split",
        id: splitNodeId,
        direction,
        ratio: clamp(ratio, 0.01, 0.99),
        first,
        second,
      };
      const replacedByTarget = replaceLeafTile(state.layoutTree, targetTileId, nextNode);
      if (replacedByTarget.replaced) {
        return {
          ...state,
          layoutTree: replacedByTarget.node,
        };
      }
      return {
        ...state,
        layoutTree: replaceSplitNode(state.layoutTree, splitNodeId, nextNode),
      };
    }
    case "workspace/tile_moved": {
      return {
        ...state,
        activeTileId: intent.payload.activeTileId,
      };
    }
    case "workspace/split_resized": {
      const { splitNodeId, ratio } = intent.payload;
      return {
        ...state,
        layoutTree: resizeSplitNode(state.layoutTree, splitNodeId, ratio),
      };
    }
    case "workspace/tab_added": {
      const { tileId, tab, setActive } = intent.payload;
      return updateChartTile(state, tileId, (chart) => ({
        ...chart,
        tabOrder: [...chart.tabOrder, tab.id],
        tabs: {
          ...chart.tabs,
          [tab.id]: tab,
        },
        activeTabId: setActive ? tab.id : chart.activeTabId,
      }));
    }
    case "workspace/tab_removed": {
      const { tileId, tabId } = intent.payload;
      return updateChartTile(state, tileId, (chart) => {
        if (!chart.tabs[tabId]) return chart;
        const { [tabId]: _removed, ...tabs } = chart.tabs;
        const tabOrder = chart.tabOrder.filter((id) => id !== tabId);
        const activeTabId =
          chart.activeTabId === tabId ? (tabOrder.length > 0 ? tabOrder[0] : chart.activeTabId) : chart.activeTabId;
        return {
          ...chart,
          tabs,
          tabOrder,
          activeTabId,
        };
      });
    }
    case "workspace/tab_activated": {
      const { tileId, tabId } = intent.payload;
      return updateChartTile(state, tileId, (chart) => {
        if (!chart.tabs[tabId]) throw new Error(`Unknown tab '${tabId}' in tile '${tileId}'.`);
        return {
          ...chart,
          activeTabId: tabId,
        };
      });
    }
    case "workspace/tab_source_set": {
      const { tileId, tabId, source } = intent.payload;
      return updateChartTile(state, tileId, (chart) => {
        const tab = chart.tabs[tabId];
        if (!tab) throw new Error(`Unknown tab '${tabId}' in tile '${tileId}'.`);
        return {
          ...chart,
          tabs: {
            ...chart.tabs,
            [tabId]: {
              ...tab,
              source,
            },
          },
        };
      });
    }
    case "workspace/tile_viewport_set": {
      const { tileId, viewport } = intent.payload;
      return updateChartTile(state, tileId, (chart) => ({
        ...chart,
        viewport: {
          ...viewport,
        },
      }));
    }
    case "workspace/pane_added": {
      const { tileId, pane, toIndex } = intent.payload;
      return updateChartTile(state, tileId, (chart) => {
        const paneOrder = [...chart.paneOrder];
        const index = typeof toIndex === "number" ? clamp(toIndex, 0, paneOrder.length) : paneOrder.length;
        paneOrder.splice(index, 0, pane.id);
        return {
          ...chart,
          paneOrder,
          panes: {
            ...chart.panes,
            [pane.id]: pane,
          },
        };
      });
    }
    case "workspace/pane_moved": {
      const { tileId, paneId, toIndex } = intent.payload;
      return updateChartTile(state, tileId, (chart) => {
        const fromIndex = chart.paneOrder.indexOf(paneId);
        if (fromIndex < 0) throw new Error(`Unknown pane '${paneId}' in tile '${tileId}'.`);
        return {
          ...chart,
          paneOrder: moveItem(chart.paneOrder, fromIndex, toIndex),
        };
      });
    }
    case "workspace/pane_removed": {
      const { tileId, paneId } = intent.payload;
      return updateChartTile(state, tileId, (chart) => {
        if (!chart.panes[paneId]) return chart;
        const { [paneId]: _removedPane, ...panes } = chart.panes;
        const paneOrder = chart.paneOrder.filter((id) => id !== paneId);
        const indicatorOrder = chart.indicatorOrder.filter((indicatorId) => {
          const indicator = chart.indicators[indicatorId];
          return indicator?.paneId !== paneId;
        });
        const indicators = Object.fromEntries(
          Object.entries(chart.indicators).filter(([, indicator]) => indicator.paneId !== paneId)
        );
        return {
          ...chart,
          panes,
          paneOrder,
          indicatorOrder,
          indicators,
        };
      });
    }
    case "workspace/pane_ratio_set": {
      const { tileId, paneId, ratio } = intent.payload;
      return updateChartTile(state, tileId, (chart) => {
        const pane = chart.panes[paneId];
        if (!pane) throw new Error(`Unknown pane '${paneId}' in tile '${tileId}'.`);
        return {
          ...chart,
          panes: {
            ...chart.panes,
            [paneId]: {
              ...pane,
              ratio,
            },
          },
        };
      });
    }
    case "workspace/indicator_added": {
      const { tileId, indicator } = intent.payload;
      return updateChartTile(state, tileId, (chart) => {
        if (!chart.panes[indicator.paneId]) {
          throw new Error(`Unknown pane '${indicator.paneId}' for indicator '${indicator.id}'.`);
        }
        return {
          ...chart,
          indicatorOrder: [...chart.indicatorOrder, indicator.id],
          indicators: {
            ...chart.indicators,
            [indicator.id]: indicator,
          },
        };
      });
    }
    case "workspace/indicator_updated": {
      const { tileId, indicatorId, patch } = intent.payload;
      return updateChartTile(state, tileId, (chart) => {
        const currentIndicator = chart.indicators[indicatorId];
        if (!currentIndicator) throw new Error(`Unknown indicator '${indicatorId}' in tile '${tileId}'.`);
        const nextIndicator = {
          ...currentIndicator,
          ...patch,
        };
        if (!chart.panes[nextIndicator.paneId]) {
          throw new Error(`Unknown pane '${nextIndicator.paneId}' for indicator '${indicatorId}'.`);
        }
        return {
          ...chart,
          indicators: {
            ...chart.indicators,
            [indicatorId]: nextIndicator,
          },
        };
      });
    }
    case "workspace/indicator_removed": {
      const { tileId, indicatorId } = intent.payload;
      return updateChartTile(state, tileId, (chart) => {
        if (!chart.indicators[indicatorId]) return chart;
        const { [indicatorId]: _removedIndicator, ...indicators } = chart.indicators;
        return {
          ...chart,
          indicators,
          indicatorOrder: chart.indicatorOrder.filter((id) => id !== indicatorId),
        };
      });
    }
    case "workspace/indicator_style_updated": {
      const { tileId, indicatorId, slotKey, patch } = intent.payload;
      return updateChartTile(state, tileId, (chart) => {
        const indicator = chart.indicators[indicatorId];
        if (!indicator) throw new Error(`Unknown indicator '${indicatorId}' in tile '${tileId}'.`);
        return {
          ...chart,
          indicators: {
            ...chart.indicators,
            [indicatorId]: {
              ...indicator,
              styleSlots: {
                ...indicator.styleSlots,
                [slotKey]: {
                  ...indicator.styleSlots[slotKey],
                  ...patch,
                },
              },
            },
          },
        };
      });
    }
    case "workspace/drawing_added": {
      const { drawing } = intent.payload;
      const drawingsForAsset = state.drawingsByAsset[drawing.assetId] ?? {};
      return {
        ...state,
        drawingsByAsset: {
          ...state.drawingsByAsset,
          [drawing.assetId]: {
            ...drawingsForAsset,
            [drawing.id]: drawing,
          },
        },
      };
    }
    case "workspace/drawing_updated": {
      const { assetId, drawingId, patch } = intent.payload;
      const drawingsForAsset = state.drawingsByAsset[assetId];
      if (!drawingsForAsset || !drawingsForAsset[drawingId]) return state;
      const currentDrawing = drawingsForAsset[drawingId];
      return {
        ...state,
        drawingsByAsset: {
          ...state.drawingsByAsset,
          [assetId]: {
            ...drawingsForAsset,
            [drawingId]: {
              ...currentDrawing,
              ...patch,
            },
          },
        },
      };
    }
    case "workspace/drawing_removed": {
      const { assetId, drawingId } = intent.payload;
      const drawingsForAsset = state.drawingsByAsset[assetId];
      if (!drawingsForAsset || !drawingsForAsset[drawingId]) return state;
      const { [drawingId]: _removed, ...restDrawings } = drawingsForAsset;
      return {
        ...state,
        drawingsByAsset: {
          ...state.drawingsByAsset,
          [assetId]: restDrawings,
        },
      };
    }
    case "workspace/ui_updated": {
      return {
        ...state,
        ui: {
          ...state.ui,
          ...intent.payload.patch,
        },
      };
    }
    default: {
      const _exhaustive: never = intent;
      return state;
    }
  }
}

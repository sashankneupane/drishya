import { WorkspaceController } from "./WorkspaceController.js";
import { createWorkspaceIntentController } from "./workspaceIntentController.js";

type FakeSeries = {
  id: string;
  pane_id: string;
  deleted?: boolean;
};

class FakeChart {
  private panes: { id: string }[];
  private series: FakeSeries[];
  public paneOrderCalls: string[][] = [];

  constructor(panes: string[], series: FakeSeries[]) {
    this.panes = panes.map((id) => ({ id }));
    this.series = [...series];
  }

  paneLayouts() {
    return this.panes.map((pane) => ({ ...pane }));
  }

  setPaneOrder(order: string[]) {
    this.paneOrderCalls.push([...order]);
    const set = new Set(order);
    const rest = this.panes.map((p) => p.id).filter((id) => !set.has(id));
    this.panes = [...order.map((id) => ({ id })), ...rest.map((id) => ({ id }))];
  }

  objectTreeState() {
    return {
      panes: this.panes.map((pane) => ({ id: pane.id, visible: true })),
      series: this.series.map((item) => ({ ...item, deleted: item.deleted === true })),
      drawings: [],
      layers: [],
      groups: [],
    };
  }

  applyObjectTreeAction(action: { type: string; kind: string; id: string }) {
    if (action.type === "delete" && action.kind === "series") {
      this.series = this.series.map((item) =>
        item.id === action.id ? { ...item, deleted: true } : item
      );
    }
  }

  setDrawingConfig() {}
  updateLayer() {}
  updateGroup() {}
}

function testMovePaneInTileUsesControllerOrder() {
  const controller = new WorkspaceController({});
  controller.registerPane({ id: "rsi", kind: "indicator", title: "RSI", parentChartPaneId: "price" });
  controller.registerPane({ id: "macd", kind: "indicator", title: "MACD", parentChartPaneId: "price" });
  controller.setPaneOrder(["price", "rsi", "macd"]);

  const chart = new FakeChart(["price-pane", "rsi-pane", "macd-pane"], []);

  const intents = createWorkspaceIntentController({
    controller,
    getChartForTile: () => chart as any,
    getChartsForTile: () => [chart as any],
    applyIndicatorSetToTile: () => {},
    savePersistedState: () => {},
  });

  const moved = intents.movePaneInTile("chart-tile-1", "rsi", "up");
  if (!moved) throw new Error("Expected movePaneInTile to move RSI up");

  const order = controller.getState().paneLayout.order;
  if (order.join(",") !== "rsi,price,macd") {
    throw new Error(`Expected pane order rsi,price,macd but got ${order.join(",")}`);
  }
  const lastPaneOrder =
    chart.paneOrderCalls.length > 0
      ? chart.paneOrderCalls[chart.paneOrderCalls.length - 1]!
      : [];
  if (lastPaneOrder.join(",") !== "rsi-pane,price-pane,macd-pane") {
    throw new Error(`Expected runtime pane order rsi-pane,price-pane,macd-pane but got ${lastPaneOrder.join(",")}`);
  }
}

function testDeletePaneInTileRemovesPaneAndSeries() {
  const controller = new WorkspaceController({});
  controller.registerPane({ id: "rsi", kind: "indicator", title: "RSI", parentChartPaneId: "price" });
  controller.setPaneOrder(["price", "rsi"]);
  controller.setChartTileIndicatorTokens("chart-tile-1", ["rsi"]);

  const chart = new FakeChart(
    ["price-pane", "rsi-pane"],
    [
      { id: "rsi:line", pane_id: "rsi-pane" },
      { id: "candles", pane_id: "price-pane" },
    ]
  );
  let appliedCount = 0;

  const intents = createWorkspaceIntentController({
    controller,
    getChartForTile: () => chart as any,
    getChartsForTile: () => [chart as any],
    applyIndicatorSetToTile: () => {
      appliedCount += 1;
    },
    savePersistedState: () => {},
  });

  const deleted = intents.deletePaneInTile("chart-tile-1", "rsi", "indicator", chart as any);
  if (!deleted) throw new Error("Expected deletePaneInTile to return true");
  if (controller.getState().paneLayout.panes["rsi"]) {
    throw new Error("Expected RSI pane to be removed from controller pane layout");
  }
  if (appliedCount === 0) {
    throw new Error("Expected indicator set re-apply after pane deletion");
  }
}

function testRuntimePaneOrderMatchesControllerAfterSequentialMoves() {
  const controller = new WorkspaceController({});
  controller.registerPane({ id: "rsi", kind: "indicator", title: "RSI", parentChartPaneId: "price" });
  controller.registerPane({ id: "macd", kind: "indicator", title: "MACD", parentChartPaneId: "price" });
  controller.setPaneOrder(["price", "rsi", "macd"]);

  const chart = new FakeChart(["price-pane", "rsi-pane", "macd-pane"], []);
  const intents = createWorkspaceIntentController({
    controller,
    getChartForTile: () => chart as any,
    getChartsForTile: () => [chart as any],
    applyIndicatorSetToTile: () => {},
    savePersistedState: () => {},
  });

  const movedUp = intents.movePaneInTile("chart-tile-1", "macd", "up");
  if (!movedUp) throw new Error("Expected MACD pane move up to succeed");
  const movedUpAgain = intents.movePaneInTile("chart-tile-1", "macd", "up");
  if (!movedUpAgain) throw new Error("Expected MACD second move up to succeed");

  const controllerOrder = controller.getState().paneLayout.order.join(",");
  if (controllerOrder !== "macd,price,rsi") {
    throw new Error(`Expected controller pane order macd,price,rsi but got ${controllerOrder}`);
  }

  const runtimeOrder = chart.paneLayouts().map((pane) => pane.id).join(",");
  if (runtimeOrder !== "macd-pane,price-pane,rsi-pane") {
    throw new Error(`Expected runtime pane order macd-pane,price-pane,rsi-pane but got ${runtimeOrder}`);
  }
}

testMovePaneInTileUsesControllerOrder();
testDeletePaneInTileRemovesPaneAndSeries();
testRuntimePaneOrderMatchesControllerAfterSequentialMoves();

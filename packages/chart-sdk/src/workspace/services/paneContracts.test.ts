import { syncChartPaneContracts } from "./paneContracts.js";

class FakeChart {
  private readonly panes: Array<{ id: string; h: number }> = [];
  public paneOrderCalls: string[][] = [];
  public paneWeightCalls: Array<Record<string, number>> = [];

  constructor(paneIds: string[], paneHeights?: Record<string, number>) {
    this.panes = paneIds.map((id) => ({ id, h: paneHeights?.[id] ?? 100 }));
  }

  paneLayouts() {
    return this.panes.map((pane) => ({ ...pane }));
  }

  setPaneOrder(order: string[]) {
    this.paneOrderCalls.push([...order]);
  }

  setPaneWeights(weights: Record<string, number>) {
    this.paneWeightCalls.push({ ...weights });
  }

  setChartPaneViewports() {}
  setPaneChartPaneMap() {}
}

function testSyncChartPaneContractsUsesTileScopedRuntimePaneIds() {
  const chart = new FakeChart(["price", "rsi", "macd"], { price: 600, rsi: 250, macd: 150 });
  const chartRuntimes = new Map<string, { chart: FakeChart }>([["chart-2", { chart }]]);
  const paneHostByPaneId = new Map<string, { stage: { getBoundingClientRect: () => DOMRect } }>([
    [
      "chart-2",
      {
        stage: {
          getBoundingClientRect: () => ({ width: 1200, height: 800 } as DOMRect),
        },
      },
    ],
  ]);

  syncChartPaneContracts({
    state: {
      chartPanes: {
        "chart-2": { visible: true },
      },
      paneLayout: {
        order: ["price", "rsi", "macd"],
        ratios: { price: 0.6, rsi: 0.25, macd: 0.15 },
        visibility: { price: true, rsi: true, macd: true },
        collapsed: { price: false, rsi: false, macd: false },
        panes: {
          price: { id: "price", kind: "price", title: "Main" },
          // Intentionally parented elsewhere to prove runtime-pane-id scoping is used.
          rsi: { id: "rsi", kind: "indicator", title: "RSI", parentChartPaneId: "price" },
          macd: { id: "macd", kind: "indicator", title: "MACD", parentChartPaneId: "price" },
        },
      },
    },
    chartRuntimes: chartRuntimes as any,
    paneHostByPaneId: paneHostByPaneId as any,
  });

  const lastOrder = chart.paneOrderCalls[chart.paneOrderCalls.length - 1] ?? [];
  if (lastOrder.join(",") !== "price,rsi,macd") {
    throw new Error(`Expected runtime order price,rsi,macd but got ${lastOrder.join(",")}`);
  }

  const lastWeights = chart.paneWeightCalls[chart.paneWeightCalls.length - 1] ?? {};
  if (Math.abs((lastWeights.price ?? 0) - 0.6) > 0.0001) {
    throw new Error("Expected price weight to follow paneLayout.ratios.price");
  }
  if (Math.abs((lastWeights.rsi ?? 0) - 0.25) > 0.0001) {
    throw new Error("Expected RSI weight to follow paneLayout.ratios.rsi");
  }
  if (Math.abs((lastWeights.macd ?? 0) - 0.15) > 0.0001) {
    throw new Error("Expected MACD weight to follow paneLayout.ratios.macd");
  }
}

function testSyncChartPaneContractsFallsBackToRuntimeWeightsWhenRatioMissing() {
  const chart = new FakeChart(["price", "rsi"], { price: 700, rsi: 300 });
  const chartRuntimes = new Map<string, { chart: FakeChart }>([["chart-2", { chart }]]);
  const paneHostByPaneId = new Map<string, { stage: { getBoundingClientRect: () => DOMRect } }>([
    [
      "chart-2",
      {
        stage: {
          getBoundingClientRect: () => ({ width: 1200, height: 800 } as DOMRect),
        },
      },
    ],
  ]);

  syncChartPaneContracts({
    state: {
      chartPanes: {
        "chart-2": { visible: true },
      },
      paneLayout: {
        order: ["price", "rsi"],
        // Simulate partial/stale controller ratio map during tab transitions.
        ratios: { price: 0.7 },
        visibility: { price: true, rsi: true },
        collapsed: { price: false, rsi: false },
        panes: {
          price: { id: "price", kind: "price", title: "Main" },
          rsi: { id: "rsi", kind: "indicator", title: "RSI", parentChartPaneId: "price" },
        },
      },
    },
    chartRuntimes: chartRuntimes as any,
    paneHostByPaneId: paneHostByPaneId as any,
  });

  const lastWeights = chart.paneWeightCalls[chart.paneWeightCalls.length - 1] ?? {};
  const sum = (lastWeights.price ?? 0) + (lastWeights.rsi ?? 0);
  if (Math.abs(sum - 1.0) > 0.0001) {
    throw new Error(`Expected normalized pane weights sum of 1 but got ${sum}`);
  }
  if (!(lastWeights.price! > lastWeights.rsi!)) {
    throw new Error("Expected runtime height fallback to preserve relative pane size");
  }
}

function testSyncChartPaneContractsUsesDefaultIndicatorRatioWhenIndicatorRatioMissing() {
  const chart = new FakeChart(["price", "rsi"], { price: 500, rsi: 500 });
  const chartRuntimes = new Map<string, { chart: FakeChart }>([["chart-2", { chart }]]);
  const paneHostByPaneId = new Map<string, { stage: { getBoundingClientRect: () => DOMRect } }>([
    [
      "chart-2",
      {
        stage: {
          getBoundingClientRect: () => ({ width: 1200, height: 800 } as DOMRect),
        },
      },
    ],
  ]);

  syncChartPaneContracts({
    state: {
      chartPanes: {
        "chart-2": { visible: true },
      },
      paneLayout: {
        order: ["price", "rsi"],
        // Simulate first-frame before rsi ratio has been written to state.
        ratios: { price: 1.0 },
        visibility: { price: true, rsi: true },
        collapsed: { price: false, rsi: false },
        panes: {
          price: { id: "price", kind: "price", title: "Main" },
          rsi: { id: "rsi", kind: "indicator", title: "RSI", parentChartPaneId: "price" },
        },
      },
    },
    chartRuntimes: chartRuntimes as any,
    paneHostByPaneId: paneHostByPaneId as any,
  });

  const lastWeights = chart.paneWeightCalls[chart.paneWeightCalls.length - 1] ?? {};
  if (!(lastWeights.price! > lastWeights.rsi!)) {
    throw new Error("Expected default indicator ratio fallback to avoid equal 50/50 split");
  }
}

function testSyncChartPaneContractsMapsRuntimeIndicatorIdsByOrderWhenIdsDiffer() {
  const chart = new FakeChart(["price", "runtime-rsi", "runtime-macd"], {
    price: 500,
    "runtime-rsi": 250,
    "runtime-macd": 250,
  });
  const chartRuntimes = new Map<string, { chart: FakeChart }>([["chart-7", { chart }]]);
  const paneHostByPaneId = new Map<string, { stage: { getBoundingClientRect: () => DOMRect } }>([
    [
      "chart-7",
      {
        stage: {
          getBoundingClientRect: () => ({ width: 1200, height: 800 } as DOMRect),
        },
      },
    ],
  ]);

  syncChartPaneContracts({
    state: {
      chartPanes: {
        "chart-7": { visible: true },
      },
      paneLayout: {
        order: ["price", "rsi", "macd"],
        ratios: { price: 0.65, rsi: 0.2, macd: 0.15 },
        visibility: { price: true, rsi: true, macd: true },
        collapsed: { price: false, rsi: false, macd: false },
        panes: {
          price: { id: "price", kind: "price", title: "Main" },
          rsi: { id: "rsi", kind: "indicator", title: "RSI", parentChartPaneId: "price" },
          macd: { id: "macd", kind: "indicator", title: "MACD", parentChartPaneId: "price" },
        },
      },
    },
    chartRuntimes: chartRuntimes as any,
    paneHostByPaneId: paneHostByPaneId as any,
  });

  const lastWeights = chart.paneWeightCalls[chart.paneWeightCalls.length - 1] ?? {};
  if (Math.abs((lastWeights.price ?? 0) - 0.65) > 0.0001) {
    throw new Error("Expected price ratio to be preserved when runtime IDs differ");
  }
  if (Math.abs((lastWeights["runtime-rsi"] ?? 0) - 0.2) > 0.0001) {
    throw new Error("Expected first runtime indicator pane to map to first state indicator ratio");
  }
  if (Math.abs((lastWeights["runtime-macd"] ?? 0) - 0.15) > 0.0001) {
    throw new Error("Expected second runtime indicator pane to map to second state indicator ratio");
  }
}

function testSyncChartPaneContractsMultiTileScopedIndicatorPanes() {
  const tile1Chart = new FakeChart(["price", "rsi"], { price: 600, rsi: 200 });
  const tile2Chart = new FakeChart(["price", "macd"], { price: 600, macd: 200 });
  const chartRuntimes = new Map<string, { chart: FakeChart }>([
    ["price", { chart: tile1Chart }],
    ["chart-2", { chart: tile2Chart }],
  ]);
  const paneHostByPaneId = new Map<string, { stage: { getBoundingClientRect: () => DOMRect } }>([
    [
      "price",
      { stage: { getBoundingClientRect: () => ({ width: 600, height: 400 } as DOMRect) } },
    ],
    [
      "chart-2",
      { stage: { getBoundingClientRect: () => ({ width: 600, height: 400 } as DOMRect) } },
    ],
  ]);

  syncChartPaneContracts({
    state: {
      chartPanes: {
        price: { visible: true },
        "chart-2": { visible: true },
      },
      paneLayout: {
        order: ["price", "rsi", "macd"],
        ratios: { price: 0.7, rsi: 0.15, macd: 0.15 },
        visibility: { price: true, rsi: true, macd: true },
        collapsed: { price: false, rsi: false, macd: false },
        panes: {
          price: { id: "price", kind: "price", title: "Main" },
          rsi: { id: "rsi", kind: "indicator", title: "RSI", parentChartPaneId: "price" },
          macd: { id: "macd", kind: "indicator", title: "MACD", parentChartPaneId: "chart-2" },
        },
      },
    },
    chartRuntimes: chartRuntimes as any,
    paneHostByPaneId: paneHostByPaneId as any,
  });

  const tile1Weights = tile1Chart.paneWeightCalls[tile1Chart.paneWeightCalls.length - 1] ?? {};
  if (Math.abs((tile1Weights.rsi ?? 0) - 0.15 / (0.7 + 0.15)) > 0.01) {
    throw new Error(
      `Tile 1 RSI weight should use rsi ratio scoped to owner. Got rsi=${tile1Weights.rsi}`
    );
  }

  const tile2Weights = tile2Chart.paneWeightCalls[tile2Chart.paneWeightCalls.length - 1] ?? {};
  if (Math.abs((tile2Weights.macd ?? 0) - 0.15 / (0.7 + 0.15)) > 0.01) {
    throw new Error(
      `Tile 2 MACD weight should use macd ratio scoped to owner. Got macd=${tile2Weights.macd}`
    );
  }
}

testSyncChartPaneContractsUsesTileScopedRuntimePaneIds();
testSyncChartPaneContractsFallsBackToRuntimeWeightsWhenRatioMissing();
testSyncChartPaneContractsUsesDefaultIndicatorRatioWhenIndicatorRatioMissing();
testSyncChartPaneContractsMapsRuntimeIndicatorIdsByOrderWhenIdsDiffer();
testSyncChartPaneContractsMultiTileScopedIndicatorPanes();

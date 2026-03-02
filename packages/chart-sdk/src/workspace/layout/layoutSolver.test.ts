import { computeChartPaneRects } from "./computeChartPaneRects.js";
import { computeIndicatorRectsForChartPane } from "./computeIndicatorRects.js";
import type { WorkspacePaneLayoutState } from "../models/types.js";

function testLayoutSolvers() {
  const chartRects = computeChartPaneRects(
    {
      type: "split",
      direction: "vertical",
      ratio: 0.5,
      first: { type: "leaf", chartPaneId: "price" },
      second: { type: "leaf", chartPaneId: "chart-2" }
    },
    { x: 0, y: 0, w: 1000, h: 800 }
  );
  if (chartRects.length !== 2) throw new Error("Expected 2 chart pane rects");
  if (chartRects[0].rect.h + chartRects[1].rect.h !== 800) {
    throw new Error("Split should conserve full height");
  }

  const paneLayout: WorkspacePaneLayoutState = {
    order: ["price", "rsi", "macd"],
    ratios: { price: 0.6, rsi: 0.2, macd: 0.2 },
    visibility: { price: true, rsi: true, macd: true },
    collapsed: { price: false, rsi: false, macd: false },
    panes: {
      price: { id: "price", kind: "price", title: "Main Chart" },
      rsi: { id: "rsi", kind: "indicator", title: "RSI", parentChartPaneId: "price" },
      macd: { id: "macd", kind: "indicator", title: "MACD", parentChartPaneId: "price" }
    }
  };

  const indicatorRects = computeIndicatorRectsForChartPane(paneLayout, "price", {
    x: 0,
    y: 0,
    w: 1000,
    h: 400
  });

  if (indicatorRects.length !== 3) {
    throw new Error("Expected main pane plus indicator panes");
  }
}

testLayoutSolvers();

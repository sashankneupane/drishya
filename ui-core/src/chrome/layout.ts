import type { LayoutRect } from "../layout/splitTree";

export interface ChartChromeLayout {
  drawingStrip: LayoutRect;
  topStrip: LayoutRect;
  objectTree: LayoutRect;
  chartViewport: LayoutRect;
}

export interface ChromeMetrics {
  drawingStripWidth: number;
  topStripHeight: number;
  objectTreeWidth: number;
  objectTreeMargin: number;
}

export const DEFAULT_CHROME_METRICS: ChromeMetrics = {
  drawingStripWidth: 44,
  topStripHeight: 30,
  objectTreeWidth: 228,
  objectTreeMargin: 8
};

export function computeChartChromeLayout(
  host: LayoutRect,
  metrics: ChromeMetrics = DEFAULT_CHROME_METRICS
): ChartChromeLayout {
  const drawingStrip: LayoutRect = {
    x: host.x,
    y: host.y,
    w: metrics.drawingStripWidth,
    h: host.h
  };

  const objectTree: LayoutRect = {
    x: Math.max(host.x, host.x + host.w - metrics.objectTreeWidth),
    y: host.y + metrics.topStripHeight + metrics.objectTreeMargin,
    w: Math.min(metrics.objectTreeWidth, host.w),
    h: Math.max(0, host.h - metrics.topStripHeight - metrics.objectTreeMargin)
  };

  const topStrip: LayoutRect = {
    x: drawingStrip.x + drawingStrip.w,
    y: host.y,
    w: Math.max(0, objectTree.x - (drawingStrip.x + drawingStrip.w) - metrics.objectTreeMargin),
    h: metrics.topStripHeight
  };

  const chartViewport: LayoutRect = {
    x: topStrip.x,
    y: topStrip.y + topStrip.h,
    w: topStrip.w,
    h: Math.max(0, host.h - topStrip.h)
  };

  return {
    drawingStrip,
    topStrip,
    objectTree,
    chartViewport
  };
}

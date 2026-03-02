import type { LayoutRect } from "../layout/splitTree.js";

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

import type { WorkspacePaneLayoutState, WorkspacePaneId } from "../workspace/models/types.js";
import { MIN_PANE_HEIGHT_PX } from "../workspace/models/constants.js";

export interface ComputedPaneLayout {
  id: WorkspacePaneId;
  rect: LayoutRect;
}

export function computePaneLayouts(
  state: WorkspacePaneLayoutState,
  viewport: LayoutRect,
  paneGapPx: number = 4
): ComputedPaneLayout[] {
  const visibleIds = state.order.filter(id => state.visibility[id] && !state.collapsed[id]);
  if (visibleIds.length === 0) return [];

  const totalGap = paneGapPx * Math.max(0, visibleIds.length - 1);
  const availableH = Math.max(0, viewport.h - totalGap);

  // First pass: apply min heights
  let remainingH = availableH;
  let remainingRatio = 1.0;

  const paneHeights: Record<string, number> = {};
  for (const id of visibleIds) {
    const minH = state.panes[id]?.minHeight ?? MIN_PANE_HEIGHT_PX;
    const ratioH = (state.ratios[id] || 0) * availableH;
    if (ratioH < minH && remainingRatio > 0) {
      paneHeights[id] = minH;
      remainingH -= minH;
      remainingRatio -= (state.ratios[id] || 0);
    }
  }

  // Second pass: distribute remaining height proportionally
  let currentY = viewport.y;
  const result: ComputedPaneLayout[] = [];

  for (let i = 0; i < visibleIds.length; i++) {
    const id = visibleIds[i];
    let h = paneHeights[id];
    if (h === undefined) {
      const ratio = state.ratios[id] || 0;
      const normalizedRatio = remainingRatio > 0 ? ratio / remainingRatio : 0;
      h = normalizedRatio * remainingH;
    }

    // round to avoid blurry rendering
    h = Math.floor(h);

    // If last pane, fill the rest to ensure exact fit
    if (i === visibleIds.length - 1) {
      h = (viewport.y + viewport.h) - currentY;
    }

    result.push({
      id,
      rect: {
        x: viewport.x,
        y: currentY,
        w: viewport.w,
        h: h
      }
    });

    currentY += h + paneGapPx;
  }

  return result;
}

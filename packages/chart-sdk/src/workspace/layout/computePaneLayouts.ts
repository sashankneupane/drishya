import type { WorkspacePaneId, WorkspacePaneLayoutState } from "../models/types.js";
import { MIN_PANE_HEIGHT_PX } from "../models/constants.js";
import type { LayoutRect } from "./types.js";

export interface ComputedPaneLayout {
  id: WorkspacePaneId;
  rect: LayoutRect;
}

export function computePaneLayouts(
  state: WorkspacePaneLayoutState,
  viewport: LayoutRect,
  paneGapPx: number = 4
): ComputedPaneLayout[] {
  const visibleIds = state.order.filter((id) => state.visibility[id] && !state.collapsed[id]);
  if (visibleIds.length === 0) return [];

  const totalGap = paneGapPx * Math.max(0, visibleIds.length - 1);
  const availableH = Math.max(0, viewport.h - totalGap);

  let remainingH = availableH;
  let remainingRatio = 1.0;

  const paneHeights: Record<string, number> = {};
  for (const id of visibleIds) {
    const minH = state.panes[id]?.minHeight ?? MIN_PANE_HEIGHT_PX;
    const ratioH = (state.ratios[id] || 0) * availableH;
    if (ratioH < minH && remainingRatio > 0) {
      paneHeights[id] = minH;
      remainingH -= minH;
      remainingRatio -= state.ratios[id] || 0;
    }
  }

  let currentY = viewport.y;
  const result: ComputedPaneLayout[] = [];

  for (let i = 0; i < visibleIds.length; i += 1) {
    const id = visibleIds[i]!;
    let h = paneHeights[id];
    if (h === undefined) {
      const ratio = state.ratios[id] || 0;
      const normalizedRatio = remainingRatio > 0 ? ratio / remainingRatio : 0;
      h = normalizedRatio * remainingH;
    }

    h = Math.floor(h);
    if (i === visibleIds.length - 1) {
      h = viewport.y + viewport.h - currentY;
    }

    result.push({
      id,
      rect: {
        x: viewport.x,
        y: currentY,
        w: viewport.w,
        h,
      },
    });

    currentY += h + paneGapPx;
  }

  return result;
}

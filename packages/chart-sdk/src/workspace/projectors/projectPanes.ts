import type { LayoutRect } from "../../layout/splitTree.js";
import type { ChartPaneRuntime } from "../models/runtimeTypes.js";

type WorkspaceStateLike = {
  chartPanes: Record<string, { visible: boolean }>;
};

interface ProjectPanesArgs {
  state: WorkspaceStateLike;
  paneHostByPaneId: Map<string, { stage: HTMLDivElement; chartLayer: HTMLDivElement }>;
  chartRuntimes: Map<string, ChartPaneRuntime>;
  createRuntimeForPane: (paneId: string) => ChartPaneRuntime;
  ensureRuntimeInteractions: (runtime: ChartPaneRuntime) => void;
}

export function projectPanes(args: ProjectPanesArgs): void {
  const { state, paneHostByPaneId, chartRuntimes, createRuntimeForPane, ensureRuntimeInteractions } = args;
  const activePaneIds = new Set<string>();

  for (const [paneId, host] of paneHostByPaneId) {
    if (state.chartPanes[paneId]?.visible === false) continue;
    const stageRect = host.stage.getBoundingClientRect();
    const rect: LayoutRect = {
      x: 0,
      y: 0,
      w: Math.max(1, Math.floor(stageRect.width)),
      h: Math.max(1, Math.floor(stageRect.height)),
    };
    activePaneIds.add(paneId);

    let runtime = chartRuntimes.get(paneId);
    if (!runtime) {
      runtime = createRuntimeForPane(paneId);
      chartRuntimes.set(paneId, runtime);
    }
    ensureRuntimeInteractions(runtime);
    if (runtime.container.parentElement !== host.chartLayer) {
      runtime.container.parentElement?.removeChild(runtime.container);
      host.chartLayer.appendChild(runtime.container);
    }
    runtime.container.style.left = "0px";
    runtime.container.style.top = "0px";
    runtime.container.style.width = `${rect.w}px`;
    runtime.container.style.height = `${rect.h}px`;
    runtime.viewport = rect;

    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const width = Math.max(300, Math.floor(rect.w));
    const height = Math.max(300, Math.floor(rect.h));
    runtime.canvas.width = Math.floor(width * dpr);
    runtime.canvas.height = Math.floor(height * dpr);
    const ctx = runtime.canvas.getContext("2d");
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    runtime.resize(width, height);
  }

  for (const [paneId, runtime] of chartRuntimes) {
    if (activePaneIds.has(paneId)) continue;
    if (runtime.container.parentElement) {
      runtime.container.parentElement.removeChild(runtime.container);
    }
  }
}

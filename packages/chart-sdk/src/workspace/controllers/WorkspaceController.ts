import type { DrawingToolId } from "../models/drawingTool.js";
import type {
    WorkspaceTheme,
    WorkspacePaneLayoutState,
    WorkspacePaneId,
    WorkspacePaneSpec,
    WorkspaceCrosshairState,
    WorkspaceChartPaneSpec,
    WorkspaceChartPaneId,
    WorkspaceChartSplitNode,
    WorkspaceChartSplitDirection,
    WorkspaceTileSpec,
    WorkspaceTileId,
    WorkspaceChartTileSpec,
    WorkspaceChartTileId,
    WorkspaceChartTabSpec,
    WorkspaceChartTabId
} from "../models/types.js";
import type { CursorMode, ReplayState, ObjectTreeState } from "../../wasm/contracts.js";
import type { ReplayController } from "../replay/ReplayController.js";
import { PRICE_PANE_ID, DEFAULT_INDICATOR_PANE_RATIO, DEFAULT_CHART_SPLIT_RATIO } from "../models/constants.js";
import { normalizeIndicatorIds } from "../services/indicatorIdentity.js";
import { TileSessionController } from "../../tile/controllers/TileSessionController.js";
import { WorkspaceGraphController } from "./WorkspaceGraphController.js";

export interface WorkspaceState {
    theme: WorkspaceTheme;
    activeTool: DrawingToolId;
    isObjectTreeOpen: boolean;
    isLeftStripOpen: boolean;
    cursorMode: CursorMode;
    priceAxisMode: "linear" | "log" | "percent";
    replay: ReplayState;
    chartPanes: Record<WorkspaceChartPaneId, WorkspaceChartPaneSpec>;
    chartLayoutTree: WorkspaceChartSplitNode;
    activeChartPaneId: WorkspaceChartPaneId;
    chartPaneSources: Record<WorkspaceChartPaneId, { symbol?: string; timeframe?: string }>;
    workspaceTiles: Record<WorkspaceTileId, WorkspaceTileSpec>;
    workspaceTileOrder: WorkspaceTileId[];
    chartTiles: Record<WorkspaceChartTileId, WorkspaceChartTileSpec>;
    activeChartTileId: WorkspaceChartTileId;
    paneLayout: WorkspacePaneLayoutState;
    crosshair: WorkspaceCrosshairState | null;
}

export function normalizePaneRatios(
    ratios: Record<WorkspacePaneId, number>,
    visibleIds: WorkspacePaneId[]
): Record<WorkspacePaneId, number> {
    const normalized = { ...ratios };
    let sum = 0;
    for (const id of visibleIds) {
        normalized[id] = Math.max(0, ratios[id] ?? 0);
        sum += normalized[id];
    }

    if (sum <= 0) {
        const fallback = 1 / Math.max(1, visibleIds.length);
        for (const id of visibleIds) {
            normalized[id] = fallback;
        }
    } else {
        for (const id of visibleIds) {
            normalized[id] /= sum;
        }
    }

    return normalized;
}

function canonicalPaneId(id: string): string {
    const trimmed = String(id || "").trim();
    if (!trimmed) return trimmed;
    if (trimmed === "price-pane") return PRICE_PANE_ID;
    if (trimmed.endsWith("-pane")) {
        return trimmed.slice(0, -"-pane".length);
    }
    return trimmed;
}


export type WorkspaceListener = (state: WorkspaceState) => void;

/**
 * Headless controller for the Drishya Workspace UI.
 * Manages the state and provides methods to update it,
 * notifying listeners of any changes.
 */
export class WorkspaceController {
    private state: WorkspaceState;
    private chartTileIndicatorTokens: Record<string, string[]> = {};
    private listeners: Set<WorkspaceListener> = new Set();
    private replayControllerByChartTileId: Record<string, ReplayController> = {};
    private replayUnsubscribeByChartTileId: Record<string, () => void> = {};
    private replayStateByChartTileId: Record<string, ReplayState> = {};

    constructor(initial: Partial<WorkspaceState> = {}) {
        const defaultPaneLayout: WorkspacePaneLayoutState = {
            order: [PRICE_PANE_ID],
            ratios: { [PRICE_PANE_ID]: 1.0 },
            visibility: { [PRICE_PANE_ID]: true },
            collapsed: { [PRICE_PANE_ID]: false },
            panes: {
                [PRICE_PANE_ID]: {
                    id: PRICE_PANE_ID,
                    kind: "price",
                    title: "Main Chart"
                }
            }
        };

        this.state = {
            theme: initial.theme ?? "dark",
            activeTool: initial.activeTool ?? "select",
            isObjectTreeOpen: initial.isObjectTreeOpen ?? true,
            isLeftStripOpen: initial.isLeftStripOpen ?? true,
            cursorMode: initial.cursorMode ?? "crosshair",
            priceAxisMode: initial.priceAxisMode ?? "linear",
            replay: { playing: false, cursor_ts: null },
            chartPanes: initial.chartPanes ?? {
                [PRICE_PANE_ID]: {
                    id: PRICE_PANE_ID,
                    title: "Main Chart",
                    visible: true
                }
            },
            chartLayoutTree: initial.chartLayoutTree ?? {
                type: "leaf",
                chartPaneId: PRICE_PANE_ID
            },
            activeChartPaneId: initial.activeChartPaneId ?? PRICE_PANE_ID,
            chartPaneSources: initial.chartPaneSources ?? {},
            workspaceTiles: initial.workspaceTiles ?? {
                "tile-chart-1": {
                    id: "tile-chart-1",
                    kind: "chart",
                    title: "Chart",
                    widthRatio: 0.72,
                    chartTileId: "chart-tile-1"
                },
                "tile-objects": {
                    id: "tile-objects",
                    kind: "objects",
                    title: "Objects",
                    widthRatio: 0.28
                }
            },
            workspaceTileOrder: initial.workspaceTileOrder ?? ["tile-chart-1", "tile-objects"],
            chartTiles: initial.chartTiles ?? {
                "chart-tile-1": {
                    id: "chart-tile-1",
                    tabs: [
                        {
                            id: "tab-price",
                            title: "Main",
                            chartPaneId: PRICE_PANE_ID
                        }
                    ],
                    activeTabId: "tab-price"
                }
            },
            activeChartTileId: initial.activeChartTileId ?? "chart-tile-1",
            paneLayout: initial.paneLayout ?? defaultPaneLayout,
            crosshair: null
        };
        this.repairWorkspaceState();
        this.repairChartTileIndicatorTokens();
        this.repairReplayTileState();
    }

    getState(): WorkspaceState {
        return { ...this.state };
    }

    subscribe(listener: WorkspaceListener): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    private notify(): void {
        const currentState = this.getState();
        this.listeners.forEach((l) => {
            try {
                l(currentState);
            } catch (err) {
                console.error("[WorkspaceController] listener failed", err);
            }
        });
    }

    setTheme(theme: WorkspaceTheme): void {
        if (this.state.theme === theme) return;
        this.state.theme = theme;
        this.notify();
    }

    toggleTheme(): WorkspaceTheme {
        const nextTheme = this.state.theme === "dark" ? "light" : "dark";
        this.setTheme(nextTheme);
        return nextTheme;
    }

    setActiveTool(tool: DrawingToolId, options?: { force?: boolean }): void {
        const force = options?.force === true;
        if (!force && this.state.activeTool === tool) return;
        this.state.activeTool = tool;
        this.notify();
    }

    setObjectTreeOpen(open: boolean): void {
        if (this.state.isObjectTreeOpen === open) return;
        this.state.isObjectTreeOpen = open;
        this.notify();
    }

    setLeftStripOpen(open: boolean): void {
        if (this.state.isLeftStripOpen === open) return;
        this.state.isLeftStripOpen = open;
        this.notify();
    }

    setCursorMode(mode: CursorMode): void {
        if (this.state.cursorMode === mode) return;
        this.state.cursorMode = mode;
        this.notify();
    }

    setPriceAxisMode(mode: "linear" | "log" | "percent"): void {
        if (this.state.priceAxisMode === mode) return;
        this.state.priceAxisMode = mode;
        this.notify();
    }

    setCrosshair(crosshair: WorkspaceCrosshairState | null): void {
        const prev = this.state.crosshair;
        if (sameCrosshair(prev, crosshair)) {
            return;
        }
        this.state.crosshair = crosshair;
    }

    setTileReplayController(chartTileId: WorkspaceChartTileId, controller: ReplayController | null): void {
        this.replayUnsubscribeByChartTileId[chartTileId]?.();
        delete this.replayUnsubscribeByChartTileId[chartTileId];
        if (controller) {
            this.replayControllerByChartTileId[chartTileId] = controller;
            this.replayStateByChartTileId[chartTileId] = controller.state();
            this.replayUnsubscribeByChartTileId[chartTileId] = controller.subscribe((replayState) => {
                this.replayStateByChartTileId[chartTileId] = replayState;
                if (this.state.activeChartTileId === chartTileId) {
                    this.state.replay = replayState;
                }
                this.notify();
            });
        } else {
            delete this.replayControllerByChartTileId[chartTileId];
            delete this.replayStateByChartTileId[chartTileId];
        }
        if (this.state.activeChartTileId === chartTileId) {
            this.state.replay = this.getChartTileReplayState(chartTileId);
        }
        this.notify();
    }

    replay(): {
        play: () => void;
        pause: () => void;
        stop: () => void;
        stepBar: () => number | null;
        stepEvent: () => number | null;
        seekTs: (ts: number) => void;
        state: () => ReplayState;
    }
    replay(chartTileId: WorkspaceChartTileId): {
        play: () => void;
        pause: () => void;
        stop: () => void;
        stepBar: () => number | null;
        stepEvent: () => number | null;
        seekTs: (ts: number) => void;
        state: () => ReplayState;
    }

    replay(chartTileId: WorkspaceChartTileId = this.state.activeChartTileId): {
        play: () => void;
        pause: () => void;
        stop: () => void;
        stepBar: () => number | null;
        stepEvent: () => number | null;
        seekTs: (ts: number) => void;
        state: () => ReplayState;
    } {
        const replayController = this.replayControllerByChartTileId[chartTileId] ?? null;
        return {
            play: () => replayController?.play(),
            pause: () => replayController?.pause(),
            stop: () => replayController?.stop(),
            stepBar: () => replayController?.stepBar() ?? null,
            stepEvent: () => replayController?.stepEvent() ?? null,
            seekTs: (ts: number) => replayController?.seekTs(ts),
            state: () =>
                replayController?.state() ?? this.getChartTileReplayState(chartTileId)
        };
    }

    getChartTileReplayState(chartTileId: WorkspaceChartTileId): ReplayState {
        return this.replayStateByChartTileId[chartTileId] ?? { playing: false, cursor_ts: null };
    }

    /* --- Pane Layout Controller APIs --- */

    registerPane(spec: WorkspacePaneSpec): void {
        const paneId = canonicalPaneId(spec.id);
        if (!paneId) return;
        const paneSpec: WorkspacePaneSpec = { ...spec, id: paneId };
        if (
            paneSpec.kind === "indicator" &&
            !paneSpec.parentChartPaneId
        ) {
            paneSpec.parentChartPaneId = this.findLastChartPaneId();
        }
        const panes = { ...this.state.paneLayout.panes, [paneId]: paneSpec };
        let order = [...this.state.paneLayout.order];
        if (!order.includes(paneId)) {
            order.push(paneId);
        }
        const visibility = { ...this.state.paneLayout.visibility, [paneId]: true };
        const collapsed = { ...this.state.paneLayout.collapsed, [paneId]: false };

        const ratios = { ...this.state.paneLayout.ratios };
        if (!(paneId in ratios)) {
            ratios[paneId] = paneSpec.kind === "indicator" ? DEFAULT_INDICATOR_PANE_RATIO : 0.2;
        }
        if (paneSpec.kind === "indicator") {
            const minRatio = 0.0001;
            const parentPaneId = canonicalPaneId(paneSpec.parentChartPaneId ?? PRICE_PANE_ID);
            const targetParentId = this.state.paneLayout.panes[parentPaneId]
                ? parentPaneId
                : PRICE_PANE_ID;
            const parentRatio = Math.max(minRatio, Number(ratios[targetParentId] ?? 0));
            const desired = Math.max(minRatio, Number(ratios[paneId] ?? DEFAULT_INDICATOR_PANE_RATIO));
            const transfer = Math.max(minRatio, Math.min(desired, Math.max(minRatio, parentRatio - minRatio)));
            ratios[paneId] = transfer;
            ratios[targetParentId] = Math.max(minRatio, parentRatio - transfer);
            this.state.paneLayout = { order, ratios, visibility, collapsed, panes };
            this.notify();
            return;
        }

        const normalizedRatios = normalizePaneRatios(ratios, order.filter(id => visibility[id] && !collapsed[id]));

        this.state.paneLayout = { order, ratios: normalizedRatios, visibility, collapsed, panes };
        this.notify();
    }

    unregisterPane(paneId: WorkspacePaneId): void {
        paneId = canonicalPaneId(paneId);
        if (!this.state.paneLayout.panes[paneId]) return;

        const panes = { ...this.state.paneLayout.panes };
        delete panes[paneId];

        const order = this.state.paneLayout.order.filter(id => id !== paneId);

        const visibility = { ...this.state.paneLayout.visibility };
        delete visibility[paneId];

        const collapsed = { ...this.state.paneLayout.collapsed };
        delete collapsed[paneId];

        const ratios = { ...this.state.paneLayout.ratios };
        const removedRatio = Math.max(0, Number(ratios[paneId] ?? 0));
        delete ratios[paneId];

        const removedSpec = this.state.paneLayout.panes[paneId];
        if (removedSpec?.kind === "indicator") {
            const parentPaneId = canonicalPaneId(removedSpec.parentChartPaneId ?? PRICE_PANE_ID);
            const targetParentId = panes[parentPaneId] ? parentPaneId : PRICE_PANE_ID;
            ratios[targetParentId] = Math.max(0.0001, Number(ratios[targetParentId] ?? 0) + removedRatio);
            this.state.paneLayout = { order, ratios, visibility, collapsed, panes };
            this.notify();
            return;
        }

        const normalizedRatios = normalizePaneRatios(ratios, order.filter(id => visibility[id] && !collapsed[id]));

        this.state.paneLayout = { order, ratios: normalizedRatios, visibility, collapsed, panes };
        this.notify();
    }

    setPaneVisible(paneId: WorkspacePaneId, visible: boolean): void {
        paneId = canonicalPaneId(paneId);
        if (this.state.paneLayout.visibility[paneId] === visible) return;

        const visibility = { ...this.state.paneLayout.visibility, [paneId]: visible };
        const normalizedRatios = normalizePaneRatios(
            this.state.paneLayout.ratios,
            this.state.paneLayout.order.filter(id => visibility[id] && !this.state.paneLayout.collapsed[id])
        );

        this.state.paneLayout = { ...this.state.paneLayout, visibility, ratios: normalizedRatios };
        if (this.state.chartPanes[paneId]) {
            this.state.chartPanes = {
                ...this.state.chartPanes,
                [paneId]: { ...this.state.chartPanes[paneId], visible }
            };
        }
        this.notify();
    }

    setPaneCollapsed(paneId: WorkspacePaneId, isCollapsed: boolean): void {
        paneId = canonicalPaneId(paneId);
        if (this.state.paneLayout.collapsed[paneId] === isCollapsed) return;

        const collapsed = { ...this.state.paneLayout.collapsed, [paneId]: isCollapsed };
        const normalizedRatios = normalizePaneRatios(
            this.state.paneLayout.ratios,
            this.state.paneLayout.order.filter(id => this.state.paneLayout.visibility[id] && !collapsed[id])
        );

        this.state.paneLayout = { ...this.state.paneLayout, collapsed, ratios: normalizedRatios };
        this.notify();
    }

    setPaneRatio(paneId: WorkspacePaneId, ratio: number): void {
        paneId = canonicalPaneId(paneId);
        const targetRatio = Math.max(0, Math.min(1, ratio));
        const visibleIds = this.state.paneLayout.order.filter(id => this.state.paneLayout.visibility[id] && !this.state.paneLayout.collapsed[id]);

        if (!visibleIds.includes(paneId)) return;
        if (visibleIds.length === 1) {
            this.state.paneLayout = {
                ...this.state.paneLayout,
                ratios: { ...this.state.paneLayout.ratios, [paneId]: 1.0 }
            };
            this.notify();
            return;
        }

        const otherIds = visibleIds.filter(id => id !== paneId);
        let otherSum = 0;
        for (const id of otherIds) {
            otherSum += this.state.paneLayout.ratios[id] || 0;
        }

        const newRatios = { ...this.state.paneLayout.ratios };
        newRatios[paneId] = targetRatio;

        const remainingRatio = 1.0 - targetRatio;
        if (otherSum <= 0) {
            const equalShare = remainingRatio / otherIds.length;
            for (const id of otherIds) newRatios[id] = equalShare;
        } else {
            for (const id of otherIds) {
                newRatios[id] = ((this.state.paneLayout.ratios[id] || 0) / otherSum) * remainingRatio;
            }
        }

        this.state.paneLayout = { ...this.state.paneLayout, ratios: newRatios };
        this.notify();
    }

    updatePaneRatios(updates: Record<WorkspacePaneId, number>): void {
        const currentRatios = { ...this.state.paneLayout.ratios };
        const scopedIds: WorkspacePaneId[] = [];
        for (const [id, val] of Object.entries(updates)) {
            const paneId = canonicalPaneId(id);
            if (!paneId) continue;
            if (!this.state.paneLayout.panes[paneId]) continue;
            currentRatios[paneId] = Math.max(0, val);
            if (!scopedIds.includes(paneId)) scopedIds.push(paneId);
        }
        if (scopedIds.length === 0) return;

        let scopedSum = 0;
        for (const paneId of scopedIds) {
            scopedSum += currentRatios[paneId] || 0;
        }
        if (scopedSum <= 0) {
            const equalShare = 1 / scopedIds.length;
            for (const paneId of scopedIds) {
                currentRatios[paneId] = equalShare;
            }
        } else {
            for (const paneId of scopedIds) {
                currentRatios[paneId] = (currentRatios[paneId] || 0) / scopedSum;
            }
        }

        this.state.paneLayout = { ...this.state.paneLayout, ratios: currentRatios };
        this.notify();
    }

    setPaneOrder(order: WorkspacePaneId[]): void {
        const validOrder = order
            .map(canonicalPaneId)
            .filter(id => this.state.paneLayout.panes[id]);
        const deduped: WorkspacePaneId[] = [];
        for (const id of validOrder) {
            if (!deduped.includes(id)) deduped.push(id);
        }

        for (const id of this.state.paneLayout.order) {
            if (!deduped.includes(id)) {
                deduped.push(id);
            }
        }

        const normalizedRatios = normalizePaneRatios(
            this.state.paneLayout.ratios,
            deduped.filter(id => this.state.paneLayout.visibility[id] && !this.state.paneLayout.collapsed[id])
        );

        this.state.paneLayout = { ...this.state.paneLayout, order: deduped, ratios: normalizedRatios };
        this.notify();
    }

    resetPaneLayout(): void {
        const defaultPaneLayout: WorkspacePaneLayoutState = {
            order: [PRICE_PANE_ID],
            ratios: { [PRICE_PANE_ID]: 1.0 },
            visibility: { [PRICE_PANE_ID]: true },
            collapsed: { [PRICE_PANE_ID]: false },
            panes: {
                [PRICE_PANE_ID]: {
                    id: PRICE_PANE_ID,
                    kind: "price",
                    title: "Main Chart"
                }
            }
        };

        this.state.paneLayout = defaultPaneLayout;
        this.state.chartPanes = {
            [PRICE_PANE_ID]: {
                id: PRICE_PANE_ID,
                title: "Main Chart",
                visible: true
            }
        };
        this.state.chartLayoutTree = { type: "leaf", chartPaneId: PRICE_PANE_ID };
        this.state.activeChartPaneId = PRICE_PANE_ID;
        this.state.chartPaneSources = {
            [PRICE_PANE_ID]: this.state.chartPaneSources[PRICE_PANE_ID] ?? {}
        };
        this.state.chartTiles = {
            "chart-tile-1": {
                id: "chart-tile-1",
                tabs: [{ id: "tab-price", title: "Main", chartPaneId: PRICE_PANE_ID }],
                activeTabId: "tab-price"
            }
        };
        this.chartTileIndicatorTokens = { "chart-tile-1": [] };
        this.state.workspaceTiles = {
            "tile-chart-1": {
                id: "tile-chart-1",
                kind: "chart",
                title: "Chart",
                widthRatio: 0.72,
                chartTileId: "chart-tile-1"
            },
            "tile-objects": {
                id: "tile-objects",
                kind: "objects",
                title: "Objects",
                widthRatio: 0.28
            }
        };
        this.state.workspaceTileOrder = ["tile-chart-1", "tile-objects"];
        this.state.activeChartTileId = "chart-tile-1";
        this.notify();
    }

    loadPaneLayout(layout: WorkspacePaneLayoutState): void {
        if (!layout.order || !layout.ratios || !layout.panes) return;
        const normalizeId = canonicalPaneId;
        const order = (Array.isArray(layout.order) ? layout.order : [PRICE_PANE_ID]).map(normalizeId);
        const ratios = Object.fromEntries(
            Object.entries(layout.ratios || { [PRICE_PANE_ID]: 1.0 }).map(([id, ratio]) => [normalizeId(id), ratio])
        );
        const visibility = Object.fromEntries(
            Object.entries(layout.visibility || { [PRICE_PANE_ID]: true }).map(([id, visible]) => [normalizeId(id), visible])
        );
        const collapsed = Object.fromEntries(
            Object.entries(layout.collapsed || { [PRICE_PANE_ID]: false }).map(([id, isCollapsed]) => [normalizeId(id), isCollapsed])
        );
        const panes = Object.fromEntries(
            Object.entries(layout.panes || {
                [PRICE_PANE_ID]: {
                    id: PRICE_PANE_ID,
                    kind: "price",
                    title: "Price"
                }
            }).map(([id, pane]) => [normalizeId(id), { ...pane, id: normalizeId(pane.id) }])
        );
        this.state.paneLayout = {
            order,
            ratios,
            visibility,
            collapsed,
            panes
        };
        this.state.chartPanes = ensureChartPaneRegistryFromPaneLayout(this.state.paneLayout, this.state.chartPanes);
        this.state.chartLayoutTree = ensureChartSplitTreeFromChartPanes(
            this.state.chartLayoutTree,
            Object.keys(this.state.chartPanes)
        );
        if (!this.state.chartPanes[this.state.activeChartPaneId]) {
            this.state.activeChartPaneId = PRICE_PANE_ID;
        }
        const nextSources: Record<string, { symbol?: string; timeframe?: string }> = {};
        for (const id of Object.keys(this.state.chartPanes)) {
            nextSources[id] = this.state.chartPaneSources[id] ?? {};
        }
        this.state.chartPaneSources = nextSources;
        this.notify();
    }

    loadChartLayout(
        chartPanes: Record<WorkspaceChartPaneId, WorkspaceChartPaneSpec>,
        chartLayoutTree: WorkspaceChartSplitNode,
        activeChartPaneId?: WorkspaceChartPaneId
    ): void {
        if (!chartPanes || Object.keys(chartPanes).length === 0) return;
        this.state.chartPanes = { ...chartPanes };
        this.state.chartLayoutTree = ensureChartSplitTreeFromChartPanes(
            chartLayoutTree,
            Object.keys(this.state.chartPanes)
        );
        const requestedActive = activeChartPaneId ? canonicalPaneId(activeChartPaneId) : this.state.activeChartPaneId;
        this.state.activeChartPaneId = this.state.chartPanes[requestedActive]
            ? requestedActive
            : PRICE_PANE_ID;
        const nextSources: Record<string, { symbol?: string; timeframe?: string }> = {};
        for (const id of Object.keys(this.state.chartPanes)) {
            nextSources[id] = this.state.chartPaneSources[id] ?? {};
        }
        this.state.chartPaneSources = nextSources;
        this.repairWorkspaceState();
        this.notify();
    }

    loadWorkspaceTiles(
        workspaceTiles: Record<WorkspaceTileId, WorkspaceTileSpec>,
        workspaceTileOrder: WorkspaceTileId[],
        chartTiles: Record<WorkspaceChartTileId, WorkspaceChartTileSpec>,
        activeChartTileId?: WorkspaceChartTileId
    ): void {
        this.state.workspaceTiles = { ...workspaceTiles };
        this.state.workspaceTileOrder = [...workspaceTileOrder];
        this.state.chartTiles = { ...chartTiles };
        const nextTokens: Record<string, string[]> = {};
        for (const tileId of Object.keys(this.state.chartTiles)) {
            const existing = this.chartTileIndicatorTokens[tileId];
            nextTokens[tileId] = normalizeIndicatorIds(existing ?? []);
        }
        this.chartTileIndicatorTokens = nextTokens;
        if (activeChartTileId) {
            this.state.activeChartTileId = activeChartTileId;
        }
        this.repairWorkspaceState();
        this.repairChartTileIndicatorTokens();
        this.notify();
    }

    cleanupEmptyIndicatorPanes(tree: ObjectTreeState): void {
        const panesWithSeries = new Set<string>();
        panesWithSeries.add(PRICE_PANE_ID);

        for (const s of tree.series) {
            if (!s.deleted) {
                panesWithSeries.add(s.pane_id);
            }
        }

        const panesToUnregister: string[] = [];
        for (const id of this.state.paneLayout.order) {
            const spec = this.state.paneLayout.panes[id];
            if (spec && spec.kind === "indicator" && !panesWithSeries.has(id)) {
                panesToUnregister.push(id);
            }
        }

        for (const id of panesToUnregister) {
            this.unregisterPane(id);
        }
    }

    addPane(): string {
        return this.addChartPane();
    }

    addChartPane(): string {
        const id = this.nextChartPaneId();
        const nextIndex =
            Object.keys(this.state.chartPanes).filter((pid) => pid !== PRICE_PANE_ID).length + 1;
        this.registerPane({
            id,
            kind: "chart",
            title: `Chart ${nextIndex}`
        });
        this.state.chartPanes = {
            ...this.state.chartPanes,
            [id]: { id, title: `Chart ${nextIndex}`, visible: true }
        };
        this.state.chartLayoutTree = splitLeaf(
            this.state.chartLayoutTree,
            this.state.activeChartPaneId || PRICE_PANE_ID,
            {
                type: "leaf",
                chartPaneId: id
            },
            "horizontal",
            DEFAULT_CHART_SPLIT_RATIO
        );
        this.state.activeChartPaneId = id;
        this.state.chartPaneSources = {
            ...this.state.chartPaneSources,
            [id]: {}
        };
        this.notify();
        return id;
    }

    splitChartPane(targetPaneId: WorkspaceChartPaneId, direction: WorkspaceChartSplitDirection): string {
        const target = canonicalPaneId(targetPaneId);
        if (!this.state.chartPanes[target]) {
            throw new Error(`Unknown chart pane: ${targetPaneId}`);
        }
        const id = this.nextChartPaneId();
        this.registerPane({
            id,
            kind: "chart",
            title: `Chart ${Object.keys(this.state.chartPanes).length + 1}`
        });
        this.state.chartPanes = {
            ...this.state.chartPanes,
            [id]: { id, title: `Chart ${Object.keys(this.state.chartPanes).length + 1}`, visible: true }
        };
        this.state.chartLayoutTree = splitLeaf(
            this.state.chartLayoutTree,
            target,
            { type: "leaf", chartPaneId: id },
            direction,
            DEFAULT_CHART_SPLIT_RATIO
        );
        this.state.activeChartPaneId = id;
        this.state.chartPaneSources = {
            ...this.state.chartPaneSources,
            [id]: {}
        };
        this.notify();
        return id;
    }

    removeChartPane(chartPaneId: WorkspaceChartPaneId): void {
        const paneId = canonicalPaneId(chartPaneId);
        if (paneId === PRICE_PANE_ID) return;
        if (!this.state.chartPanes[paneId]) return;
        const nextTree = removeLeaf(this.state.chartLayoutTree, paneId);
        if (!nextTree) return;
        const nextChartPanes = { ...this.state.chartPanes };
        delete nextChartPanes[paneId];
        this.state.chartPanes = nextChartPanes;
        const nextSources = { ...this.state.chartPaneSources };
        delete nextSources[paneId];
        this.state.chartPaneSources = nextSources;
        this.state.chartLayoutTree = nextTree;
        const nextChartTiles: Record<string, WorkspaceChartTileSpec> = {};
        for (const [tileId, tile] of Object.entries(this.state.chartTiles)) {
            const tabs = tile.tabs.filter((tab) => tab.chartPaneId !== paneId);
            if (tabs.length === 0) {
                continue;
            }
            const activeTabId = tabs.some((tab) => tab.id === tile.activeTabId) ? tile.activeTabId : tabs[0].id;
            nextChartTiles[tileId] = { ...tile, tabs, activeTabId };
        }
        this.state.chartTiles = nextChartTiles;
        if (!this.state.chartPanes[this.state.activeChartPaneId]) {
            this.state.activeChartPaneId = PRICE_PANE_ID;
        }
        const ownedIndicatorIds = Object.entries(this.state.paneLayout.panes)
            .filter(([id, spec]) => spec.kind === "indicator" && spec.parentChartPaneId === paneId)
            .map(([id]) => id);
        for (const id of ownedIndicatorIds) {
            const spec = this.state.paneLayout.panes[id];
            if (!spec) continue;
            this.state.paneLayout = {
                ...this.state.paneLayout,
                panes: {
                    ...this.state.paneLayout.panes,
                    [id]: { ...spec, parentChartPaneId: PRICE_PANE_ID }
                }
            };
        }
        this.repairWorkspaceState();
        this.unregisterPane(paneId);
    }

    setActiveChartPane(chartPaneId: WorkspaceChartPaneId): void {
        const paneId = canonicalPaneId(chartPaneId);
        if (!this.state.chartPanes[paneId]) return;
        if (this.state.activeChartPaneId === paneId) return;
        this.state.activeChartPaneId = paneId;
        this.notify();
    }

    setChartPaneSource(
        chartPaneId: WorkspaceChartPaneId,
        next: { symbol?: string; timeframe?: string }
    ): void {
        const paneId = canonicalPaneId(chartPaneId);
        if (!this.state.chartPanes[paneId]) return;
        const prev = this.state.chartPaneSources[paneId] ?? {};
        const merged = {
            symbol: next.symbol ?? prev.symbol,
            timeframe: next.timeframe ?? prev.timeframe
        };
        if (prev.symbol === merged.symbol && prev.timeframe === merged.timeframe) return;
        this.state.chartPaneSources = {
            ...this.state.chartPaneSources,
            [paneId]: merged
        };
        this.notify();
    }

    setActiveChartTile(tileId: WorkspaceChartTileId): void {
        const session = TileSessionController.snapshot(this.state, this.chartTileIndicatorTokens, tileId);
        if (!session) return;
        this.state.activeChartTileId = tileId;
        this.state.replay = this.getChartTileReplayState(tileId);
        const activeTab =
            session.chartTile.tabs.find((tab) => tab.id === session.chartTile.activeTabId) ??
            session.chartTile.tabs[0];
        if (activeTab) this.state.activeChartPaneId = activeTab.chartPaneId;
        this.notify();
    }

    setActiveChartTab(chartTileId: WorkspaceChartTileId, tabId: WorkspaceChartTabId): void {
        this.state = TileSessionController.setActiveTab(this.state, chartTileId, tabId);
        this.state.replay = this.getChartTileReplayState(chartTileId);
        this.notify();
    }

    getChartTileIndicatorTokens(chartTileId: WorkspaceChartTileId): string[] {
        return TileSessionController.snapshot(this.state, this.chartTileIndicatorTokens, chartTileId)?.indicatorTokens ?? [];
    }

    setChartTileIndicatorTokens(chartTileId: WorkspaceChartTileId, tokens: readonly string[]): void {
        const tile = this.state.chartTiles[chartTileId];
        if (!tile) return;
        const next = normalizeIndicatorIds(tokens);
        if (JSON.stringify(this.chartTileIndicatorTokens[chartTileId] ?? []) === JSON.stringify(next)) return;
        this.chartTileIndicatorTokens = TileSessionController.setIndicatorTokens(
            this.chartTileIndicatorTokens,
            chartTileId,
            next
        );
        this.notify();
    }

    addChartTab(chartTileId: WorkspaceChartTileId): WorkspaceChartTabId | null {
        const tile = this.state.chartTiles[chartTileId];
        if (!tile) return null;
        const paneId = this.addChartPane();
        const tabId = this.nextChartTabId();
        const title = `Chart ${tile.tabs.length + 1}`;
        const nextTab: WorkspaceChartTabSpec = { id: tabId, title, chartPaneId: paneId };
        this.state = TileSessionController.appendTab(this.state, chartTileId, nextTab);
        this.notify();
        return tabId;
    }

    removeChartTab(chartTileId: WorkspaceChartTileId, tabId: WorkspaceChartTabId): void {
        const tile = this.state.chartTiles[chartTileId];
        if (!tile) return;
        const tab = tile.tabs.find((candidate) => candidate.id === tabId);
        if (!tab) return;
        if (tile.tabs.length === 1) return;
        const remainingTabs = tile.tabs.filter((candidate) => candidate.id !== tabId);
        const activeTabId = remainingTabs.some((candidate) => candidate.id === tile.activeTabId)
            ? tile.activeTabId
            : remainingTabs[0].id;
        this.state.chartTiles = {
            ...this.state.chartTiles,
            [chartTileId]: {
                ...tile,
                tabs: remainingTabs,
                activeTabId
            }
        };
        if (this.state.activeChartTileId === chartTileId) {
            const activeTab = remainingTabs.find((candidate) => candidate.id === activeTabId) ?? remainingTabs[0];
            if (activeTab) {
                this.state.activeChartPaneId = activeTab.chartPaneId;
            }
        }
        this.removeChartPane(tab.chartPaneId);
        this.notify();
    }

    setChartTabTitle(chartTileId: WorkspaceChartTileId, tabId: WorkspaceChartTabId, title: string): void {
        const nextState = TileSessionController.setTabTitle(this.state, chartTileId, tabId, title);
        if (nextState === this.state) return;
        this.state = nextState;
        this.notify();
    }

    moveChartTab(
        sourceChartTileId: WorkspaceChartTileId,
        tabId: WorkspaceChartTabId,
        targetChartTileId: WorkspaceChartTileId,
        targetIndex: number
    ): void {
        const nextState = TileSessionController.moveTab(
            this.state,
            sourceChartTileId,
            tabId,
            targetChartTileId,
            targetIndex
        );
        if (nextState === this.state) return;
        this.state = nextState;
        this.notify();
    }

    addChartTile(): WorkspaceChartTileId {
        const paneId = this.addChartPane();
        const chartTileId = this.nextChartTileId();
        const tabId = this.nextChartTabId();
        this.state.chartTiles = {
            ...this.state.chartTiles,
            [chartTileId]: {
                id: chartTileId,
                tabs: [{ id: tabId, title: "Main", chartPaneId: paneId }],
                activeTabId: tabId
            }
        };
        this.chartTileIndicatorTokens = {
            ...this.chartTileIndicatorTokens,
            [chartTileId]: []
        };
        const tileId = this.nextWorkspaceTileId();
        this.state = WorkspaceGraphController.appendChartTile(this.state, tileId, chartTileId);
        this.notify();
        return chartTileId;
    }

    removeWorkspaceTile(tileId: WorkspaceTileId): void {
        const tile = this.state.workspaceTiles[tileId];
        if (!tile) return;
        if (tile.kind === "objects") return;
        const chartTileId = tile.chartTileId;
        if (chartTileId) {
            const chartTile = this.state.chartTiles[chartTileId];
            if (chartTile) {
                for (const tab of chartTile.tabs) {
                    this.removeChartPane(tab.chartPaneId);
                }
            }
            const nextChartTiles = { ...this.state.chartTiles };
            delete nextChartTiles[chartTileId];
            this.state.chartTiles = nextChartTiles;
        }
        this.state = WorkspaceGraphController.removeWorkspaceTileRecord(this.state, tileId);
        this.repairWorkspaceState();
        this.notify();
    }

    moveWorkspaceTile(tileId: WorkspaceTileId, nextIndex: number): void {
        const nextState = WorkspaceGraphController.moveWorkspaceTile(this.state, tileId, nextIndex);
        if (nextState === this.state) return;
        this.state = nextState;
        this.notify();
    }

    updateWorkspaceTileRatios(updates: Record<WorkspaceTileId, number>): void {
        this.state = WorkspaceGraphController.updateWorkspaceTileRatios(this.state, updates);
        this.notify();
    }

    setChartSplitRatio(path: readonly number[], ratio: number): void {
        const clamped = Math.max(0.1, Math.min(0.9, ratio));
        this.state.chartLayoutTree = updateSplitRatioAtPath(this.state.chartLayoutTree, path, clamped);
        this.notify();
    }

    private nextChartPaneId(): string {
        let maxN = 1;
        for (const id of Object.keys(this.state.chartPanes)) {
            if (id === PRICE_PANE_ID) continue;
            const m = /^chart-(\d+)$/.exec(id);
            if (!m) continue;
            const n = Number(m[1]);
            if (Number.isFinite(n) && n > maxN) maxN = n;
        }
        return `chart-${maxN + 1}`;
    }

    private nextChartTileId(): string {
        let maxN = 1;
        for (const id of Object.keys(this.state.chartTiles)) {
            const m = /^chart-tile-(\d+)$/.exec(id);
            if (!m) continue;
            const n = Number(m[1]);
            if (Number.isFinite(n) && n > maxN) maxN = n;
        }
        return `chart-tile-${maxN + 1}`;
    }

    private nextChartTabId(): string {
        let maxN = 1;
        for (const tile of Object.values(this.state.chartTiles)) {
            for (const tab of tile.tabs) {
                const m = /^tab-(\d+)$/.exec(tab.id);
                if (!m) continue;
                const n = Number(m[1]);
                if (Number.isFinite(n) && n > maxN) maxN = n;
            }
        }
        return `tab-${maxN + 1}`;
    }

    private nextWorkspaceTileId(): string {
        let maxN = 1;
        for (const id of Object.keys(this.state.workspaceTiles)) {
            const m = /^tile-chart-(\d+)$/.exec(id);
            if (!m) continue;
            const n = Number(m[1]);
            if (Number.isFinite(n) && n > maxN) maxN = n;
        }
        return `tile-chart-${maxN + 1}`;
    }

    private normalizeWorkspaceTileRatios(): void {
        this.state = WorkspaceGraphController.normalizeWorkspaceTileRatios(this.state);
    }

    private repairWorkspaceState(): void {
        for (const [tileId, tile] of Object.entries(this.state.chartTiles)) {
            const tabs = tile.tabs.filter((tab) => this.state.chartPanes[tab.chartPaneId]);
            if (tabs.length === 0) {
                tabs.push({ id: this.nextChartTabId(), title: "Main", chartPaneId: PRICE_PANE_ID });
            }
            const activeTabId = tabs.some((tab) => tab.id === tile.activeTabId) ? tile.activeTabId : tabs[0].id;
            this.state.chartTiles[tileId] = {
                ...tile,
                tabs,
                activeTabId
            };
        }

        const nextTiles: Record<string, WorkspaceTileSpec> = {};
        for (const tileId of this.state.workspaceTileOrder) {
            const tile = this.state.workspaceTiles[tileId];
            if (!tile) continue;
            if (tile.kind === "chart" && (!tile.chartTileId || !this.state.chartTiles[tile.chartTileId])) {
                continue;
            }
            nextTiles[tileId] = tile;
        }
        for (const [tileId, tile] of Object.entries(this.state.workspaceTiles)) {
            if (nextTiles[tileId]) continue;
            if (tile.kind === "chart" && (!tile.chartTileId || !this.state.chartTiles[tile.chartTileId])) {
                continue;
            }
            nextTiles[tileId] = tile;
        }
        this.state.workspaceTiles = nextTiles;
        this.state.workspaceTileOrder = this.state.workspaceTileOrder.filter((id) => this.state.workspaceTiles[id]);

        if (!this.state.workspaceTileOrder.some((id) => this.state.workspaceTiles[id]?.kind === "objects")) {
            this.state.workspaceTiles["tile-objects"] = {
                id: "tile-objects",
                kind: "objects",
                title: "Objects",
                widthRatio: 0.28
            };
            this.state.workspaceTileOrder.push("tile-objects");
        }

        const chartTileIds = Object.keys(this.state.chartTiles);
        if (chartTileIds.length > 0) {
            const hasActiveChartTile = this.state.chartTiles[this.state.activeChartTileId];
            if (!hasActiveChartTile) {
                this.state.activeChartTileId = chartTileIds[0];
            }
            const activeTile = this.state.chartTiles[this.state.activeChartTileId];
            const activeTab = activeTile?.tabs.find((tab) => tab.id === activeTile.activeTabId) ?? activeTile?.tabs[0];
            if (activeTab) {
                this.state.activeChartPaneId = activeTab.chartPaneId;
            }
        } else {
            this.state.activeChartTileId = "";
            this.state.activeChartPaneId = PRICE_PANE_ID;
        }
        this.normalizeWorkspaceTileRatios();
        this.repairChartTileIndicatorTokens();
        this.repairReplayTileState();
    }

    private repairChartTileIndicatorTokens(): void {
        const next: Record<string, string[]> = {};
        for (const tileId of Object.keys(this.state.chartTiles)) {
            next[tileId] = normalizeIndicatorIds(this.chartTileIndicatorTokens[tileId] ?? []);
        }
        this.chartTileIndicatorTokens = next;
    }

    private repairReplayTileState(): void {
        const chartTileIds = new Set(Object.keys(this.state.chartTiles));
        for (const tileId of Object.keys(this.replayControllerByChartTileId)) {
            if (chartTileIds.has(tileId)) continue;
            this.replayUnsubscribeByChartTileId[tileId]?.();
            delete this.replayUnsubscribeByChartTileId[tileId];
            delete this.replayControllerByChartTileId[tileId];
            delete this.replayStateByChartTileId[tileId];
        }
        for (const tileId of chartTileIds) {
            if (!this.replayStateByChartTileId[tileId]) {
                this.replayStateByChartTileId[tileId] = { playing: false, cursor_ts: null };
            }
        }
        this.state.replay = this.getChartTileReplayState(this.state.activeChartTileId);
    }

    private findLastChartPaneId(): string {
        for (let i = this.state.paneLayout.order.length - 1; i >= 0; i -= 1) {
            const id = this.state.paneLayout.order[i];
            const kind = this.state.paneLayout.panes[id]?.kind;
            if (kind === "price" || kind === "chart") {
                return id;
            }
        }
        return PRICE_PANE_ID;
    }
}

function splitLeaf(
    node: WorkspaceChartSplitNode,
    targetPaneId: WorkspaceChartPaneId,
    insertedLeaf: WorkspaceChartSplitNode,
    direction: WorkspaceChartSplitDirection,
    ratio: number
): WorkspaceChartSplitNode {
    if (node.type === "leaf") {
        if (node.chartPaneId !== targetPaneId) return node;
        return {
            type: "split",
            direction,
            ratio,
            first: node,
            second: insertedLeaf
        };
    }
    return {
        ...node,
        first: splitLeaf(node.first, targetPaneId, insertedLeaf, direction, ratio),
        second: splitLeaf(node.second, targetPaneId, insertedLeaf, direction, ratio)
    };
}

function removeLeaf(node: WorkspaceChartSplitNode, targetPaneId: WorkspaceChartPaneId): WorkspaceChartSplitNode | null {
    if (node.type === "leaf") {
        return node.chartPaneId === targetPaneId ? null : node;
    }
    const first = removeLeaf(node.first, targetPaneId);
    const second = removeLeaf(node.second, targetPaneId);
    if (!first && !second) return null;
    if (!first) return second;
    if (!second) return first;
    return { ...node, first, second };
}

function updateSplitRatioAtPath(
    node: WorkspaceChartSplitNode,
    path: readonly number[],
    ratio: number
): WorkspaceChartSplitNode {
    if (path.length === 0) {
        if (node.type !== "split") return node;
        return { ...node, ratio };
    }
    if (node.type !== "split") return node;
    const [head, ...tail] = path;
    if (head === 0) {
        return { ...node, first: updateSplitRatioAtPath(node.first, tail, ratio) };
    }
    return { ...node, second: updateSplitRatioAtPath(node.second, tail, ratio) };
}

function ensureChartPaneRegistryFromPaneLayout(
    paneLayout: WorkspacePaneLayoutState,
    previous: Record<WorkspaceChartPaneId, WorkspaceChartPaneSpec>
): Record<WorkspaceChartPaneId, WorkspaceChartPaneSpec> {
    const out: Record<WorkspaceChartPaneId, WorkspaceChartPaneSpec> = {};
    for (const id of paneLayout.order) {
        const spec = paneLayout.panes[id];
        if (!spec) continue;
        if (spec.kind !== "price" && spec.kind !== "chart") continue;
        out[id] = {
            id,
            title: spec.title ?? (id === PRICE_PANE_ID ? "Main Chart" : id.toUpperCase()),
            visible: paneLayout.visibility[id] ?? true
        };
    }
    if (!out[PRICE_PANE_ID]) {
        out[PRICE_PANE_ID] = previous[PRICE_PANE_ID] ?? {
            id: PRICE_PANE_ID,
            title: "Main Chart",
            visible: true
        };
    }
    return out;
}

function ensureChartSplitTreeFromChartPanes(
    tree: WorkspaceChartSplitNode,
    chartPaneIds: string[]
): WorkspaceChartSplitNode {
    const existing = new Set(chartPaneIds);
    const leaves: string[] = [];
    collectLeafIds(tree, leaves);
    const filtered = leaves.filter((id) => existing.has(id));
    if (filtered.length === 0) {
        return { type: "leaf", chartPaneId: PRICE_PANE_ID };
    }
    let root: WorkspaceChartSplitNode = { type: "leaf", chartPaneId: filtered[0] };
    for (let i = 1; i < filtered.length; i += 1) {
        root = {
            type: "split",
            direction: "horizontal",
            ratio: DEFAULT_CHART_SPLIT_RATIO,
            first: root,
            second: { type: "leaf", chartPaneId: filtered[i] }
        };
    }
    for (const paneId of chartPaneIds) {
        if (!filtered.includes(paneId)) {
            root = {
                type: "split",
                direction: "vertical",
                ratio: DEFAULT_CHART_SPLIT_RATIO,
                first: root,
                second: { type: "leaf", chartPaneId: paneId }
            };
        }
    }
    return root;
}

function collectLeafIds(node: WorkspaceChartSplitNode, out: string[]): void {
    if (node.type === "leaf") {
        out.push(node.chartPaneId);
        return;
    }
    collectLeafIds(node.first, out);
    collectLeafIds(node.second, out);
}

function sameCrosshair(a: WorkspaceCrosshairState | null, b: WorkspaceCrosshairState | null): boolean {
    if (a === b) return true;
    if (!a || !b) return false;
    if (a.x !== b.x || a.index !== b.index || a.timestamp !== b.timestamp) return false;
    if (a.readouts.length !== b.readouts.length) return false;
    for (let i = 0; i < a.readouts.length; i += 1) {
        const ar = a.readouts[i];
        const br = b.readouts[i];
        if (ar.paneId !== br.paneId || ar.value !== br.value) {
            return false;
        }
    }
    return true;
}

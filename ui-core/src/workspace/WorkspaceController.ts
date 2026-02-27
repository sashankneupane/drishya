import type { DrawingToolId } from "../toolbar/model.js";
import type {
    WorkspaceTheme,
    WorkspacePaneLayoutState,
    WorkspacePaneId,
    WorkspacePaneSpec,
    WorkspaceCrosshairState,
    WorkspaceChartPaneSpec,
    WorkspaceChartPaneId,
    WorkspaceChartSplitNode,
    WorkspaceChartSplitDirection
} from "./types.js";
import type { CursorMode, ReplayState, ObjectTreeState } from "../wasm/contracts.js";
import type { ReplayController } from "./replay/ReplayController.js";
import { PRICE_PANE_ID, DEFAULT_INDICATOR_PANE_RATIO, DEFAULT_CHART_SPLIT_RATIO } from "./constants.js";

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
    private listeners: Set<WorkspaceListener> = new Set();
    private replayController: ReplayController | null = null;
    private replayUnsubscribe: (() => void) | null = null;

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
            paneLayout: initial.paneLayout ?? defaultPaneLayout,
            crosshair: null
        };
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

    setReplayController(controller: ReplayController | null): void {
        this.replayUnsubscribe?.();
        this.replayUnsubscribe = null;
        this.replayController = controller;
        if (controller) {
            this.state.replay = controller.state();
            this.replayUnsubscribe = controller.subscribe((replayState) => {
                this.state.replay = replayState;
                this.notify();
            });
        } else {
            this.state.replay = { playing: false, cursor_ts: null };
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
    } {
        return {
            play: () => this.replayController?.play(),
            pause: () => this.replayController?.pause(),
            stop: () => this.replayController?.stop(),
            stepBar: () => this.replayController?.stepBar() ?? null,
            stepEvent: () => this.replayController?.stepEvent() ?? null,
            seekTs: (ts: number) => this.replayController?.seekTs(ts),
            state: () =>
                this.replayController?.state() ?? {
                    playing: false,
                    cursor_ts: null
                }
        };
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
        delete ratios[paneId];

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
        for (const [id, val] of Object.entries(updates)) {
            const paneId = canonicalPaneId(id);
            if (!paneId) continue;
            currentRatios[paneId] = Math.max(0, val);
        }

        const normalizedRatios = normalizePaneRatios(
            currentRatios,
            this.state.paneLayout.order.filter(id => this.state.paneLayout.visibility[id] && !this.state.paneLayout.collapsed[id])
        );

        this.state.paneLayout = { ...this.state.paneLayout, ratios: normalizedRatios };
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
            direction: "vertical",
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

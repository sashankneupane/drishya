import type { DrawingToolId } from "../toolbar/model.js";
import type { WorkspaceTheme, WorkspacePaneLayoutState, WorkspacePaneId, WorkspacePaneSpec, WorkspaceCrosshairState } from "./types.js";
import type { CursorMode, ReplayState, ObjectTreeState } from "../wasm/contracts.js";
import type { ReplayController } from "./replay/ReplayController.js";
import { PRICE_PANE_ID, DEFAULT_INDICATOR_PANE_RATIO } from "./constants.js";

export interface WorkspaceState {
    theme: WorkspaceTheme;
    activeTool: DrawingToolId;
    isObjectTreeOpen: boolean;
    isLeftStripOpen: boolean;
    cursorMode: CursorMode;
    priceAxisMode: "linear" | "log" | "percent";
    replay: ReplayState;
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
                    title: "Price"
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
        this.listeners.forEach((l) => l(currentState));
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
        const panes = { ...this.state.paneLayout.panes, [spec.id]: spec };
        let order = [...this.state.paneLayout.order];
        if (!order.includes(spec.id)) {
            order.push(spec.id);
        }
        const visibility = { ...this.state.paneLayout.visibility, [spec.id]: true };
        const collapsed = { ...this.state.paneLayout.collapsed, [spec.id]: false };

        const ratios = { ...this.state.paneLayout.ratios };
        if (!(spec.id in ratios)) {
            ratios[spec.id] = spec.kind === "indicator" ? DEFAULT_INDICATOR_PANE_RATIO : 0.2;
        }

        const normalizedRatios = normalizePaneRatios(ratios, order.filter(id => visibility[id] && !collapsed[id]));

        this.state.paneLayout = { order, ratios: normalizedRatios, visibility, collapsed, panes };
        this.notify();
    }

    unregisterPane(paneId: WorkspacePaneId): void {
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
        if (this.state.paneLayout.visibility[paneId] === visible) return;

        const visibility = { ...this.state.paneLayout.visibility, [paneId]: visible };
        const normalizedRatios = normalizePaneRatios(
            this.state.paneLayout.ratios,
            this.state.paneLayout.order.filter(id => visibility[id] && !this.state.paneLayout.collapsed[id])
        );

        this.state.paneLayout = { ...this.state.paneLayout, visibility, ratios: normalizedRatios };
        this.notify();
    }

    setPaneCollapsed(paneId: WorkspacePaneId, isCollapsed: boolean): void {
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
            currentRatios[id] = Math.max(0, val);
        }

        const normalizedRatios = normalizePaneRatios(
            currentRatios,
            this.state.paneLayout.order.filter(id => this.state.paneLayout.visibility[id] && !this.state.paneLayout.collapsed[id])
        );

        this.state.paneLayout = { ...this.state.paneLayout, ratios: normalizedRatios };
        this.notify();
    }

    setPaneOrder(order: WorkspacePaneId[]): void {
        const validOrder = order.filter(id => this.state.paneLayout.panes[id]);

        for (const id of this.state.paneLayout.order) {
            if (!validOrder.includes(id)) {
                validOrder.push(id);
            }
        }

        const normalizedRatios = normalizePaneRatios(
            this.state.paneLayout.ratios,
            validOrder.filter(id => this.state.paneLayout.visibility[id] && !this.state.paneLayout.collapsed[id])
        );

        this.state.paneLayout = { ...this.state.paneLayout, order: validOrder, ratios: normalizedRatios };
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
                    title: "Price"
                }
            }
        };

        this.state.paneLayout = defaultPaneLayout;
        this.notify();
    }

    loadPaneLayout(layout: WorkspacePaneLayoutState): void {
        if (!layout.order || !layout.ratios || !layout.panes) return;
        const normalizeId = (id: string) => (id === "price-pane" ? PRICE_PANE_ID : id);
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

    addPane(): void {
        const id = `pane-${Math.random().toString(36).slice(2, 7)}`;
        this.registerPane({
            id,
            kind: "indicator",
            title: "Indicator Pane"
        });
    }
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

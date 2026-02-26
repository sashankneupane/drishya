import type { DrawingToolId } from "../toolbar/model.js";
import type { WorkspaceTheme } from "./types.js";
import type { CursorMode } from "../wasm/contracts.js";

export interface WorkspaceState {
    theme: WorkspaceTheme;
    activeTool: DrawingToolId;
    isObjectTreeOpen: boolean;
    isLeftStripOpen: boolean;
    cursorMode: CursorMode;
    priceAxisMode: "linear" | "log" | "percent";
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

    constructor(initial: Partial<WorkspaceState> = {}) {
        this.state = {
            theme: initial.theme ?? "dark",
            activeTool: initial.activeTool ?? "select",
            isObjectTreeOpen: initial.isObjectTreeOpen ?? true,
            isLeftStripOpen: initial.isLeftStripOpen ?? true,
            cursorMode: initial.cursorMode ?? "crosshair",
            priceAxisMode: initial.priceAxisMode ?? "linear"
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
}

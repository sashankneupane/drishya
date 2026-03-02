import type { WorkspaceDocument } from "../state/schema.js";
import type { WorkspaceIntent } from "../state/intents.js";
import { reduceWorkspaceDocument } from "../state/reducer.js";
import {
  assertValidWorkspaceDocument,
  validateWorkspaceDocument,
  type ValidationResult,
} from "../state/validator.js";

export type WorkspacePatch =
  | {
      kind: "state/replaced";
      previous: WorkspaceDocument;
      next: WorkspaceDocument;
    }
  | {
      kind: "state/reduced";
      intent: WorkspaceIntent;
      previous: WorkspaceDocument;
      next: WorkspaceDocument;
    };

export interface WorkspaceLogger {
  debug?: (message: string, context?: Record<string, unknown>) => void;
  warn?: (message: string, context?: Record<string, unknown>) => void;
  error?: (message: string, context?: Record<string, unknown>) => void;
}

export interface WorkspaceViewHandle {
  destroy?: () => void;
}

export interface WorkspaceRuntimeAdapters {
  mount?: (host: HTMLElement, engine: WorkspaceEngine) => WorkspaceViewHandle | void;
}

export interface WorkspaceEngine {
  getState(): WorkspaceDocument;
  setState(next: WorkspaceDocument): void;
  dispatch(intent: WorkspaceIntent): WorkspaceDocument;
  subscribe(listener: (state: WorkspaceDocument, patch: WorkspacePatch) => void): () => void;
  mount(host: HTMLElement, adapters: WorkspaceRuntimeAdapters): WorkspaceViewHandle;
  unmount(): void;
}

export function createWorkspaceEngine(options: {
  initialState: WorkspaceDocument;
  validate?: "strict" | "strict_with_warnings";
  logger?: WorkspaceLogger;
}): WorkspaceEngine {
  const validateMode = options.validate ?? "strict";
  const logger = options.logger;

  assertValidWorkspaceDocument(options.initialState);

  let state: WorkspaceDocument = options.initialState;
  const listeners = new Set<(state: WorkspaceDocument, patch: WorkspacePatch) => void>();
  let mountedViewHandle: WorkspaceViewHandle | null = null;

  const notify = (patch: WorkspacePatch): void => {
    for (const listener of listeners) {
      try {
        listener(state, patch);
      } catch (error) {
        logger?.error?.("Workspace listener failed", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  };

  const validateOrThrow = (doc: WorkspaceDocument): void => {
    const result = validateWorkspaceDocument(doc);
    if (result.ok) return;
    if (validateMode === "strict_with_warnings") {
      logger?.warn?.("Workspace validation produced errors in strict_with_warnings mode", {
        errors: result.errors,
      });
      throw new Error(formatValidationError(result));
    }
    throw new Error(formatValidationError(result));
  };

  return {
    getState(): WorkspaceDocument {
      return state;
    },
    setState(next: WorkspaceDocument): void {
      validateOrThrow(next);
      const previous = state;
      state = next;
      notify({
        kind: "state/replaced",
        previous,
        next: state,
      });
    },
    dispatch(intent: WorkspaceIntent): WorkspaceDocument {
      const previous = state;
      const reduced = reduceWorkspaceDocument(state, intent);
      state = reduced;
      notify({
        kind: "state/reduced",
        intent,
        previous,
        next: state,
      });
      return state;
    },
    subscribe(listener: (nextState: WorkspaceDocument, patch: WorkspacePatch) => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    mount(host: HTMLElement, adapters: WorkspaceRuntimeAdapters): WorkspaceViewHandle {
      if (mountedViewHandle?.destroy) {
        mountedViewHandle.destroy();
      }
      const maybeHandle = adapters.mount?.(host, this);
      mountedViewHandle = maybeHandle ?? {};
      return mountedViewHandle;
    },
    unmount(): void {
      if (mountedViewHandle?.destroy) {
        mountedViewHandle.destroy();
      }
      mountedViewHandle = null;
    },
  };
}

function formatValidationError(result: ValidationResult): string {
  const details = result.errors.map((error) => `${error.path}: ${error.message}`).join("; ");
  return `Invalid workspace state: ${details}`;
}

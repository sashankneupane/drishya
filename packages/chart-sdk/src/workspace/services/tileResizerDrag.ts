import type { WorkspaceController } from "../controllers/WorkspaceController.js";

interface AttachTileResizerDragOptions {
  resizer: HTMLDivElement;
  tilesRow: HTMLDivElement;
  tileId: string;
  nextTileId: string;
  controller: WorkspaceController;
  onResizeEnd: () => void;
}

export function attachTileResizerDrag(
  options: AttachTileResizerDragOptions
): void {
  options.resizer.onpointerdown = (event) => {
    event.preventDefault();
    const rowRect = options.tilesRow.getBoundingClientRect();
    const startX = event.clientX;
    const stateNow = options.controller.getState();
    const leftRatio = stateNow.workspaceTiles[options.tileId]?.widthRatio ?? 0.5;
    const rightRatio = stateNow.workspaceTiles[options.nextTileId]?.widthRatio ?? 0.5;
    const pair = leftRatio + rightRatio;
    const onMove = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - startX;
      const deltaRatio = dx / Math.max(1, rowRect.width);
      const nextLeft = Math.max(0.12, Math.min(pair - 0.12, leftRatio + deltaRatio));
      const nextRight = pair - nextLeft;
      options.controller.updateWorkspaceTileRatios({
        [options.tileId]: nextLeft,
        [options.nextTileId]: nextRight,
      });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      options.onResizeEnd();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };
}


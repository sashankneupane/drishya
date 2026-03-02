import type { WorkspaceController } from "../controllers/WorkspaceController.js";

interface AttachTileResizerDragOptions {
  resizer: HTMLDivElement;
  leftShell: HTMLDivElement;
  rightShell: HTMLDivElement;
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
    const leftRect = options.leftShell.getBoundingClientRect();
    const rightRect = options.rightShell.getBoundingClientRect();
    const startX = event.clientX;
    const stateNow = options.controller.getState();
    const leftRatio = stateNow.workspaceTiles[options.tileId]?.widthRatio ?? 0.5;
    const rightRatio = stateNow.workspaceTiles[options.nextTileId]?.widthRatio ?? 0.5;
    const pair = leftRatio + rightRatio;
    const pairWidthPx = Math.max(1, leftRect.width + rightRect.width);
    const minTileWidthPx = 240;
    if (pair <= 0) return;
    const onMove = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - startX;
      const nextLeftPx = Math.max(
        minTileWidthPx,
        Math.min(pairWidthPx - minTileWidthPx, leftRect.width + dx)
      );
      const nextLeft = pair * (nextLeftPx / pairWidthPx);
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


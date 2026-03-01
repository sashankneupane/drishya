import type { WorkspaceController } from "./WorkspaceController.js";

interface AttachTileHeaderDragReorderOptions {
  header: HTMLDivElement;
  shell: HTMLDivElement;
  tileId: string;
  controller: WorkspaceController;
  tileShellById: Map<string, HTMLDivElement>;
  onReordered: () => void;
}

export function attachTileHeaderDragReorder(
  options: AttachTileHeaderDragReorderOptions
): void {
  options.header.onpointerdown = (event) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest("[data-no-tile-drag='1']")) return;
    const startX = event.clientX;
    let dragging = false;
    let didReorder = false;
    const draggedShell = options.shell;
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "grabbing";
    const onMove = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - startX;
      if (!dragging && Math.abs(dx) > 10) dragging = true;
      if (!dragging) return;
      draggedShell.style.transform = `translateX(${dx}px)`;
      draggedShell.style.zIndex = "30";
      draggedShell.style.opacity = "0.92";
      draggedShell.style.pointerEvents = "none";
      const stateNow = options.controller.getState();
      const orderedIds = stateNow.workspaceTileOrder.filter((id) => stateNow.workspaceTiles[id]);
      const centers = orderedIds.map((id) => {
        const el = options.tileShellById.get(id);
        const rect = el?.getBoundingClientRect();
        return rect ? rect.left + rect.width / 2 : Number.POSITIVE_INFINITY;
      });
      let targetIndex = orderedIds.length - 1;
      for (let i = 0; i < centers.length; i += 1) {
        if (moveEvent.clientX < centers[i]) {
          targetIndex = i;
          break;
        }
      }
      const currentIndex = orderedIds.indexOf(options.tileId);
      if (currentIndex >= 0 && targetIndex !== currentIndex) {
        options.controller.moveWorkspaceTile(options.tileId, targetIndex);
        didReorder = true;
      }
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      draggedShell.style.transform = "";
      draggedShell.style.zIndex = "";
      draggedShell.style.opacity = "";
      draggedShell.style.pointerEvents = "";
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      if (didReorder) options.onReordered();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };
}


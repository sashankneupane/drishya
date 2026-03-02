import type { WorkspaceTileDropTarget } from "./tilePlacement.js";

interface AttachTileHeaderDragReorderOptions {
  header: HTMLDivElement;
  shell: HTMLDivElement;
  tileId: string;
  resolveDropTarget: (clientX: number, clientY: number, draggedTileId: string) => WorkspaceTileDropTarget | null;
  onPreview: (target: WorkspaceTileDropTarget | null) => void;
  onDrop: (draggedTileId: string, target: WorkspaceTileDropTarget) => void;
  onDragEnd: () => void;
}

export function attachTileHeaderDragReorder(
  options: AttachTileHeaderDragReorderOptions
): void {
  options.header.onpointerdown = (event) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest("[data-no-tile-drag='1']")) return;
    const startX = event.clientX;
    const startY = event.clientY;
    let dragging = false;
    let dropTarget: WorkspaceTileDropTarget | null = null;
    const draggedShell = options.shell;
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "grabbing";
    const onMove = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      if (!dragging && Math.hypot(dx, dy) > 10) dragging = true;
      if (!dragging) return;
      draggedShell.style.transform = `translate(${dx}px, ${dy}px)`;
      draggedShell.style.zIndex = "30";
      draggedShell.style.opacity = "0.92";
      draggedShell.style.pointerEvents = "none";
      dropTarget = options.resolveDropTarget(moveEvent.clientX, moveEvent.clientY, options.tileId);
      options.onPreview(dropTarget);
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
      if (dragging && dropTarget) {
        options.onDrop(options.tileId, dropTarget);
      }
      options.onPreview(null);
      options.onDragEnd();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };
}


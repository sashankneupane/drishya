export type SplitDirection = "horizontal" | "vertical";

export interface LayoutRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type SplitNode =
  | { type: "leaf"; groupId: string }
  | {
      type: "split";
      direction: SplitDirection;
      ratio: number;
      first: SplitNode;
      second: SplitNode;
    };

export interface GroupViewport {
  groupId: string;
  rect: LayoutRect;
}

export function computeGroupViewports(root: SplitNode, rect: LayoutRect): GroupViewport[] {
  const out: GroupViewport[] = [];
  walk(root, rect, out);
  return out;
}

function walk(node: SplitNode, rect: LayoutRect, out: GroupViewport[]): void {
  if (node.type === "leaf") {
    out.push({ groupId: node.groupId, rect });
    return;
  }

  const ratio = clamp(node.ratio, 0.05, 0.95);
  if (node.direction === "horizontal") {
    const firstW = rect.w * ratio;
    const secondW = rect.w - firstW;
    walk(node.first, { x: rect.x, y: rect.y, w: firstW, h: rect.h }, out);
    walk(node.second, { x: rect.x + firstW, y: rect.y, w: secondW, h: rect.h }, out);
  } else {
    const firstH = rect.h * ratio;
    const secondH = rect.h - firstH;
    walk(node.first, { x: rect.x, y: rect.y, w: rect.w, h: firstH }, out);
    walk(node.second, { x: rect.x, y: rect.y + firstH, w: rect.w, h: secondH }, out);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

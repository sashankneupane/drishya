export type DrawingToolId =
  | "select"
  | "hline"
  | "vline"
  | "ray"
  | "rectangle"
  | "fib"
  | "long"
  | "short";

export interface DrawingToolDef {
  id: DrawingToolId;
  label: string;
  hotkey?: string;
}

export const DRAWING_TOOLS: readonly DrawingToolDef[] = [
  { id: "select", label: "Select", hotkey: "V" },
  { id: "hline", label: "H-Line", hotkey: "H" },
  { id: "vline", label: "V-Line", hotkey: "L" },
  { id: "ray", label: "Ray", hotkey: "R" },
  { id: "rectangle", label: "Rect", hotkey: "B" },
  { id: "fib", label: "Fib", hotkey: "F" },
  { id: "long", label: "Long", hotkey: "N" },
  { id: "short", label: "Short", hotkey: "S" }
];

export function isDrawingToolId(value: string): value is DrawingToolId {
  return DRAWING_TOOLS.some((tool) => tool.id === value);
}

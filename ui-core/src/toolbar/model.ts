export type DrawingToolId =
  | "select"
  | "hline"
  | "vline"
  | "ray"
  | "rectangle"
  | "price_range"
  | "time_range"
  | "date_time_range"
  | "fib"
  | "long"
  | "short"
  | "triangle"
  | "circle"
  | "ellipse"
  | "text"
  | "brush"
  | "highlighter";

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
  { id: "price_range", label: "P-Range", hotkey: "G" },
  { id: "time_range", label: "T-Range", hotkey: "Y" },
  { id: "date_time_range", label: "DT-Range", hotkey: "U" },
  { id: "fib", label: "Fib", hotkey: "F" },
  { id: "long", label: "Long", hotkey: "N" },
  { id: "short", label: "Short", hotkey: "S" },
  { id: "triangle", label: "Triangle", hotkey: "T" },
  { id: "circle", label: "Circle", hotkey: "C" },
  { id: "ellipse", label: "Ellipse", hotkey: "E" },
  { id: "text", label: "Text", hotkey: "X" },
  { id: "brush", label: "Brush", hotkey: "K" },
  { id: "highlighter", label: "Marker", hotkey: "M" }
];

export function isDrawingToolId(value: string): value is DrawingToolId {
  return DRAWING_TOOLS.some((tool) => tool.id === value);
}

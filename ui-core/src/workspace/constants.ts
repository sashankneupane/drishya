import type { WorkspaceToolDef } from "./types";

export const WORKSPACE_DRAW_TOOLS: readonly WorkspaceToolDef[] = [
  { id: "select", hotkey: "V", title: "Select / edit drawings" },
  { id: "hline", hotkey: "H", title: "Horizontal line" },
  { id: "vline", hotkey: "L", title: "Vertical line" },
  { id: "ray", hotkey: "R", title: "Ray" },
  { id: "rectangle", hotkey: "B", title: "Rectangle" },
  { id: "fib", hotkey: "F", title: "Fib retracement" },
  { id: "long", hotkey: "N", title: "Long position" },
  { id: "short", hotkey: "S", title: "Short position" }
];


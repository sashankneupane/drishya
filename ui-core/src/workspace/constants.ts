import type { WorkspaceToolDef } from "./types.js";

export const WORKSPACE_DRAW_TOOLS: readonly WorkspaceToolDef[] = [
  { id: "select", hotkey: "V", title: "Select / edit drawings" },
  {
    id: "line-group",
    hotkey: "L",
    title: "Line tools",
    children: [
      { id: "hline", hotkey: "H", title: "Horizontal line" },
      { id: "vline", hotkey: "V", title: "Vertical line" },
      { id: "ray", hotkey: "R", title: "Ray" }
    ]
  },
  { id: "rectangle", hotkey: "B", title: "Rectangle" },
  {
    id: "range-group",
    hotkey: "G",
    title: "Range tools",
    children: [
      { id: "price_range", hotkey: "G", title: "Price range" },
      { id: "time_range", hotkey: "Y", title: "Time range" },
      { id: "date_time_range", hotkey: "U", title: "Date & time range" }
    ]
  },
  { id: "fib", hotkey: "F", title: "Fib retracement" },
  {
    id: "position-group",
    hotkey: "P",
    title: "Position tools",
    children: [
      { id: "long", hotkey: "N", title: "Long position" },
      { id: "short", hotkey: "S", title: "Short position" }
    ]
  }
];

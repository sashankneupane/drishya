import type { WorkspaceToolDef } from "./types.js";
import type { ChartAppearanceConfig } from "../wasm/contracts.js";

/** Default chart appearance colors (dark theme). */
export const DEFAULT_APPEARANCE_CONFIG: ChartAppearanceConfig = {
  background: "#030712",
  candle_up: "#22c55e",
  candle_down: "#ef4444"
};


export const WORKSPACE_DRAW_TOOLS: readonly WorkspaceToolDef[] = [
  {
    id: "cursor-group",
    hotkey: "Q",
    title: "Cursor options",
    children: [
      { id: "crosshair", hotkey: "Q", title: "Crosshair" },
      { id: "dot", hotkey: "D", title: "Dot" },
      { id: "normal", hotkey: "V", title: "Arrow / Normal" }
    ]
  },
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
  {
    id: "shape-group",
    hotkey: "S",
    title: "Shape tools",
    children: [
      { id: "rectangle", hotkey: "B", title: "Rectangle" },
      { id: "triangle", hotkey: "T", title: "Triangle" },
      { id: "circle", hotkey: "C", title: "Circle" },
      { id: "ellipse", hotkey: "E", title: "Ellipse" }
    ]
  },
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
  },
  { id: "text", hotkey: "X", title: "Text" }
];

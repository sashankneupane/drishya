const NS = "http://www.w3.org/2000/svg";

export type WorkspaceIconName =
  | "select"
  | "hline"
  | "vline"
  | "ray"
  | "rectangle"
  | "price_range"
  | "time_range"
  | "date_time_range"
  | "rectangle-filled"
  | "bars"
  | "volume-candles"
  | "fib"
  | "long"
  | "short"
  | "triangle"
  | "circle"
  | "ellipse"
  | "text"
  | "trash"
  | "theme"
  | "theme-off"
  | "eye"
  | "eye-off"
  | "close"
  | "chevron-up"
  | "chevron-down"
  | "chevron-right"
  | "delete"
  | "search"
  | "crosshair"
  | "dot"
  | "normal"
  | "settings"
  | "grip-vertical"
  | "grip-horizontal"
  | "lock"
  | "lock-open"
  | "brush"
  | "highlighter"
  | "plus"
  | "tree"
  | "panels"
  | "play"
  | "pause"
  | "stop"
  | "step-forward"
  | "skip-forward";

interface IconDef {
  paths: string[];
  fill?: boolean;
  strokeWidth?: number;
  circles?: Array<{ cx: number; cy: number; r: number; fill?: boolean }>;
}

export function makeSvgIcon(name: WorkspaceIconName | string, className = "drishya-icon"): SVGSVGElement {
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.5");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", className);

  const path = (d: string) => {
    const el = document.createElementNS(NS, "path");
    el.setAttribute("d", d);
    return el;
  };

  const circle = (cx: number, cy: number, r: number, fill?: boolean) => {
    const el = document.createElementNS(NS, "circle");
    el.setAttribute("cx", String(cx));
    el.setAttribute("cy", String(cy));
    el.setAttribute("r", String(r));
    if (fill) el.setAttribute("fill", "currentColor");
    return el;
  };

  const icons: Record<string, IconDef> = {
    // --- Cursor tools ---
    "select": {
      paths: [
        "M5 3l2.5 17 3.5-6.5 6.5-2.5L5 3z",
        "M12.5 13.5l5.5 5.5",
      ],
    },
    "crosshair": {
      paths: ["M12 2v7", "M12 15v7", "M2 12h7", "M15 12h7"],
      circles: [{ cx: 12, cy: 12, r: 1, fill: true }],
    },
    "dot": {
      paths: [],
      circles: [
        { cx: 12, cy: 12, r: 2, fill: true },
        { cx: 12, cy: 12, r: 6 },
      ],
    },
    "normal": {
      paths: [
        "M6 3l1 15 3.5-5 5.5 0L6 3z",
      ],
    },

    // --- Line tools ---
    "hline": {
      paths: ["M2 12h20"],
      circles: [{ cx: 12, cy: 12, r: 1.5, fill: true }],
    },
    "vline": {
      paths: ["M12 2v20"],
      circles: [{ cx: 12, cy: 12, r: 1.5, fill: true }],
    },
    "ray": {
      paths: ["M4 20L20 4", "M16 4h4v4"],
      circles: [
        { cx: 4, cy: 20, r: 1.5, fill: true },
        { cx: 12, cy: 12, r: 1.5, fill: true },
      ],
    },

    // --- Shape tools ---
    "rectangle": {
      paths: [
        "M4 6h16v12H4z",
      ],
      circles: [
        { cx: 4, cy: 6, r: 1.2, fill: true },
        { cx: 20, cy: 6, r: 1.2, fill: true },
        { cx: 4, cy: 18, r: 1.2, fill: true },
        { cx: 20, cy: 18, r: 1.2, fill: true },
      ],
    },
    "rectangle-filled": {
      paths: ["M4 6h16v12H4z"],
      fill: true,
    },
    "triangle": {
      paths: ["M12 4l9 16H3z"],
      circles: [
        { cx: 12, cy: 4, r: 1.2, fill: true },
        { cx: 3, cy: 20, r: 1.2, fill: true },
        { cx: 21, cy: 20, r: 1.2, fill: true },
      ],
    },
    "circle": {
      paths: [],
      circles: [
        { cx: 12, cy: 12, r: 9 },
      ],
    },
    "ellipse": {
      paths: [
        "M12 6c5.523 0 10 2.686 10 6s-4.477 6-10 6-10-2.686-10-6 4.477-6 10-6z",
      ],
    },

    // --- Range tools ---
    "price_range": {
      paths: [
        "M4 5h16",
        "M4 19h16",
        "M12 7.5v9",
        "M9.5 9l2.5-3 2.5 3",
        "M9.5 15l2.5 3 2.5-3",
      ],
    },
    "time_range": {
      paths: [
        "M5 4v16",
        "M19 4v16",
        "M7.5 12h9",
        "M9 9.5l-3 2.5 3 2.5",
        "M15 9.5l3 2.5-3 2.5",
      ],
    },
    "date_time_range": {
      paths: [
        "M3 4h18v16H3z",
        "M7 17V7.5",
        "M4.5 10l2.5-2.5 2.5 2.5",
        "M7 17h11.5",
        "M16 14.5l2.5 2.5-2.5 2.5",
      ],
    },

    // --- Chart-specific tools ---
    "bars": {
      paths: [
        "M7 4v16",
        "M4 8h3",
        "M7 15h3",
        "M17 4v16",
        "M14 7h3",
        "M17 14h3",
      ],
    },
    "volume-candles": {
      paths: [
        "M7 3v18",
        "M5 7h4v10H5z",
        "M17 3v18",
        "M15 5h4v14h-4z",
      ],
    },
    "fib": {
      paths: [
        "M4 20L20 4",
        "M3 4h18",
        "M3 12h18",
        "M3 20h18",
      ],
      circles: [
        { cx: 4, cy: 20, r: 1.5, fill: true },
        { cx: 20, cy: 4, r: 1.5, fill: true },
      ],
    },

    // --- Position tools ---
    "long": {
      paths: [
        "M6 13l6-8 6 8",
        "M4 19h16",
      ],
      circles: [{ cx: 12, cy: 19, r: 1.5, fill: true }],
    },
    "short": {
      paths: [
        "M6 11l6 8 6-8",
        "M4 5h16",
      ],
      circles: [{ cx: 12, cy: 5, r: 1.5, fill: true }],
    },

    // --- Freehand tools ---
    "brush": {
      paths: [
        "M18.37 2.63a2.12 2.12 0 0 1 3 3L9 18l-5.5 2L5 14.5z",
        "M15 5l4 4",
      ],
    },
    "highlighter": {
      paths: [
        "M17.5 2.5l4 4L11 17H7v-4z",
        "M14 6l4 4",
        "M3 22l4-4",
      ],
    },
    "text": {
      paths: [
        "M5 6V4h14v2",
        "M12 4v16",
        "M9 20h6",
      ],
    },

    // --- UI icons ---
    "trash": {
      paths: [
        "M4 6h16",
        "M6 6v13a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6",
        "M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2",
      ],
    },
    "theme": {
      paths: [
        "M12 2v2", "M12 20v2",
        "M4.93 4.93l1.41 1.41", "M17.66 17.66l1.41 1.41",
        "M2 12h2", "M20 12h2",
        "M6.34 17.66l-1.41 1.41", "M19.07 4.93l-1.41 1.41",
      ],
      circles: [{ cx: 12, cy: 12, r: 4 }],
    },
    "theme-off": {
      paths: [
        "M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z",
      ],
    },
    "eye": {
      paths: [
        "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z",
      ],
      circles: [{ cx: 12, cy: 12, r: 3 }],
    },
    "eye-off": {
      paths: [
        "M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94",
        "M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19",
        "M1 1l22 22",
      ],
      circles: [{ cx: 12, cy: 12, r: 3 }],
    },
    "close": {
      paths: ["M18 6L6 18", "M6 6l12 12"],
    },
    "chevron-up": {
      paths: ["M18 15l-6-6-6 6"],
    },
    "chevron-down": {
      paths: ["M6 9l6 6 6-6"],
    },
    "chevron-right": {
      paths: ["M9 18l6-6-6-6"],
    },
    "delete": {
      paths: [
        "M4 6h16",
        "M6 6v13a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6",
        "M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2",
        "M10 11v6",
        "M14 11v6",
      ],
    },
    "search": {
      paths: ["M21 21l-5.2-5.2"],
      circles: [{ cx: 10, cy: 10, r: 7 }],
    },
    "settings": {
      paths: [
        "M3 6h4", "M11 6h10", "M9 4v4",
        "M3 12h10", "M17 12h4", "M15 10v4",
        "M3 18h6", "M13 18h8", "M11 16v4",
      ],
    },
    "grip-vertical": {
      paths: [],
      circles: [
        { cx: 9, cy: 5, r: 1.2, fill: true },
        { cx: 9, cy: 12, r: 1.2, fill: true },
        { cx: 9, cy: 19, r: 1.2, fill: true },
        { cx: 15, cy: 5, r: 1.2, fill: true },
        { cx: 15, cy: 12, r: 1.2, fill: true },
        { cx: 15, cy: 19, r: 1.2, fill: true },
      ],
    },
    "grip-horizontal": {
      paths: [],
      circles: [
        { cx: 5, cy: 9, r: 1.2, fill: true },
        { cx: 12, cy: 9, r: 1.2, fill: true },
        { cx: 19, cy: 9, r: 1.2, fill: true },
        { cx: 5, cy: 15, r: 1.2, fill: true },
        { cx: 12, cy: 15, r: 1.2, fill: true },
        { cx: 19, cy: 15, r: 1.2, fill: true },
      ],
    },
    "lock": {
      paths: [
        "M5 11h14v10H5z",
        "M8 11V7a4 4 0 0 1 8 0v4",
      ],
      circles: [{ cx: 12, cy: 16, r: 1.5, fill: true }],
    },
    "lock-open": {
      paths: [
        "M5 11h14v10H5z",
        "M8 11V7a4 4 0 0 1 7.83-1",
      ],
      circles: [{ cx: 12, cy: 16, r: 1.5, fill: true }],
    },
    "plus": {
      paths: [
        "M12 5v14",
        "M5 12h14",
      ],
    },
    "tree": {
      paths: [
        "M12 3v4",
        "M8 7h8",
        "M8 7v4",
        "M16 7v4",
        "M5 11h3v4H5z",
        "M10 11h4v4h-4z",
        "M16 11h3v4h-3z",
        "M6.5 15v3", "M12 15v3", "M17.5 15v3",
      ],
    },
    "panels": {
      paths: [
        "M3 4h18v16H3z",
        "M3 10h18",
        "M10 10v10",
      ],
    },
    "play": {
      paths: ["M7 4v16l13-8z"],
    },
    "pause": {
      paths: ["M7 4h3v16H7z", "M14 4h3v16h-3z"],
    },
    "stop": {
      paths: ["M6 6h12v12H6z"],
    },
    "step-forward": {
      paths: ["M5 4v16l9-8z", "M17 4v16"],
    },
    "skip-forward": {
      paths: ["M4 4v16l9-8z", "M13 4v16l9-8z"],
    },
  };

  const def = icons[name];
  if (!def) return svg;

  if (def.fill) {
    svg.setAttribute("fill", "currentColor");
    svg.setAttribute("stroke", "none");
  }

  if (def.strokeWidth) {
    svg.setAttribute("stroke-width", String(def.strokeWidth));
  }

  for (const d of def.paths) {
    svg.appendChild(path(d));
  }

  if (def.circles) {
    for (const c of def.circles) {
      svg.appendChild(circle(c.cx, c.cy, c.r, c.fill));
    }
  }

  return svg;
}

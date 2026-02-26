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
  | "trash"
  | "theme"
  | "theme-off"
  | "eye"
  | "eye-off"
  | "close"
  | "chevron-right"
  | "delete"
  | "search"
  | "crosshair"
  | "dot"
  | "settings";

export function makeSvgIcon(name: WorkspaceIconName | string, className = "drishya-icon"): SVGSVGElement {
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", className);

  const path = (d: string) => {
    const el = document.createElementNS(NS, "path");
    el.setAttribute("d", d);
    return el;
  };

  const icons: Record<string, string[]> = {
    "select": ["M4 4l7.07 16.97 2.51-7.39 7.39-2.51L4 4z", "M13 13l6 6"],
    "hline": ["M3 12h18"],
    "vline": ["M12 3v18"],
    "ray": ["M3 17l14-11", "M13 6h4v4"],
    "rectangle": ["M3 5h18v14H3z"],
    "price_range": ["M7 5h10v14H7z", "M3 8h4", "M3 16h4", "M17 8h4", "M17 16h4"],
    "time_range": ["M5 7h14v10H5z", "M8 3v4", "M16 3v4", "M8 17v4", "M16 17v4"],
    "date_time_range": ["M3 3h18v18H3z", "M3 12h18", "M12 3v18"],
    "rectangle-filled": ["M3 5h18v14H3z"], // Use fill attribute in the map
    "bars": ["M6 5v14", "M3 9h3", "M6 14h3", "M18 5v14", "M15 8h3", "M18 15h3"],
    "volume-candles": ["M6 3v18", "M4 8h4v8H4z", "M18 3v18", "M14 6h8v12h-8z"],
    "fib": ["M4 18l16-16", "M8 15h9", "M11 12h9", "M14 9h9"],
    "long": ["M12 20V4", "M5 11l7-7 7 7"],
    "short": ["M12 4v16", "M5 13l7 7 7-7"],
    "trash": ["M3 6h18", "M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6", "M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"],
    "theme": ["M12 12m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0", "M12 2v2", "M12 20v2", "M4.93 4.93l1.41 1.41", "M17.66 17.66l1.41 1.41", "M2 12h2", "M20 12h2", "M6.34 17.66l-1.41 1.41", "M19.07 4.93l-1.41 1.41"],
    "theme-off": ["M12 3c0.132 0 .263 0 .393 0a7.5 7.5 0 0 0 7.92 12.446a9 9 0 1 1 -8.313 -12.454z"],
    "eye": ["M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z", "M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0"],
    "eye-off": ["M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M1 1l22 22", "M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0"],
    "close": ["M18 6L6 18", "M6 6l12 12"],
    "chevron-right": ["M9 18l6-6-6-6"],
    "delete": ["M3 6h18", "M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6", "M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2", "M10 11v6", "M14 11v6"],
    "search": ["M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"],
    "crosshair": ["M12 2v4", "M12 18v4", "M2 12h4", "M18 12h22", "M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0"],
    "dot": ["M12 12m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"],
    "settings": ["M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z", "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"],
    "triangle": ["M12 3l9 17H3L12 3z"],
    "circle": ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z"],
    "ellipse": ["M22 12c0 4.418-4.477 8-10 8s-10-3.582-10-8 4.477-8 10-8 10 3.582 10 8z"]
  };

  const ds = icons[name] || [];
  if (name === "rectangle-filled") {
    svg.setAttribute("fill", "currentColor");
    svg.setAttribute("stroke", "none");
  }

  ds.forEach(d => {
    svg.appendChild(path(d));
  });

  return svg;
}

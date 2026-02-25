const NS = "http://www.w3.org/2000/svg";

export type WorkspaceIconName =
  | "select"
  | "hline"
  | "vline"
  | "ray"
  | "rectangle"
  | "fib"
  | "long"
  | "short"
  | "trash"
  | "theme"
  | "eye"
  | "eye-off"
  | "x";

export function makeSvgIcon(name: WorkspaceIconName, className = "drishya-icon"): SVGSVGElement {
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.8");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", className);

  const path = (d: string) => {
    const el = document.createElementNS(NS, "path");
    el.setAttribute("d", d);
    return el;
  };
  const line = (x1: number, y1: number, x2: number, y2: number) => {
    const el = document.createElementNS(NS, "line");
    el.setAttribute("x1", String(x1));
    el.setAttribute("y1", String(y1));
    el.setAttribute("x2", String(x2));
    el.setAttribute("y2", String(y2));
    return el;
  };
  const circle = (cx: number, cy: number, r: number) => {
    const el = document.createElementNS(NS, "circle");
    el.setAttribute("cx", String(cx));
    el.setAttribute("cy", String(cy));
    el.setAttribute("r", String(r));
    return el;
  };
  const rect = (x: number, y: number, w: number, h: number, rx = 0) => {
    const el = document.createElementNS(NS, "rect");
    el.setAttribute("x", String(x));
    el.setAttribute("y", String(y));
    el.setAttribute("width", String(w));
    el.setAttribute("height", String(h));
    if (rx > 0) el.setAttribute("rx", String(rx));
    return el;
  };
  const poly = (points: string) => {
    const el = document.createElementNS(NS, "polyline");
    el.setAttribute("points", points);
    return el;
  };

  if (name === "select") {
    svg.appendChild(poly("6,4 6,19 10,15 13,20 15,19 12,14 17,14"));
  } else if (name === "hline") {
    svg.appendChild(line(4, 12, 20, 12));
  } else if (name === "vline") {
    svg.appendChild(line(12, 4, 12, 20));
  } else if (name === "ray") {
    svg.appendChild(line(5, 17, 18, 6));
    svg.appendChild(poly("18,6 18,10 14,10"));
  } else if (name === "rectangle") {
    svg.appendChild(rect(5, 7, 14, 10, 1.5));
  } else if (name === "fib") {
    svg.appendChild(line(6, 18, 18, 6));
    svg.appendChild(line(7, 15, 14, 15));
    svg.appendChild(line(9, 12, 16, 12));
    svg.appendChild(line(11, 9, 18, 9));
  } else if (name === "long") {
    svg.appendChild(line(12, 18, 12, 5));
    svg.appendChild(poly("8,9 12,5 16,9"));
  } else if (name === "short") {
    svg.appendChild(line(12, 6, 12, 19));
    svg.appendChild(poly("8,15 12,19 16,15"));
  } else if (name === "trash") {
    svg.appendChild(rect(8, 9, 8, 10, 1.5));
    svg.appendChild(line(6, 9, 18, 9));
    svg.appendChild(line(10, 6, 14, 6));
  } else if (name === "theme") {
    svg.appendChild(circle(12, 12, 4.5));
    svg.appendChild(line(12, 2.5, 12, 5));
    svg.appendChild(line(12, 19, 12, 21.5));
    svg.appendChild(line(2.5, 12, 5, 12));
    svg.appendChild(line(19, 12, 21.5, 12));
  } else if (name === "eye") {
    svg.appendChild(path("M2 12c2.7-4 6-6 10-6s7.3 2 10 6c-2.7 4-6 6-10 6s-7.3-2-10-6z"));
    svg.appendChild(circle(12, 12, 2.3));
  } else if (name === "eye-off") {
    svg.appendChild(path("M2 12c2.7-4 6-6 10-6 3 0 5.7 1.2 8 3.7"));
    svg.appendChild(path("M22 12c-2.7 4-6 6-10 6-3 0-5.7-1.2-8-3.7"));
    svg.appendChild(line(4, 20, 20, 4));
  } else if (name === "x") {
    svg.appendChild(line(6, 6, 18, 18));
    svg.appendChild(line(18, 6, 6, 18));
  }

  return svg;
}


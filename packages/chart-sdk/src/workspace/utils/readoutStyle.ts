import type { SeriesStyleSnapshot } from "../../wasm/contracts.js";

export function resolveReadoutLabel(
  seriesId: string,
  snapshotName: string
): string {
  const fallback = seriesId.split(":")[0] ?? seriesId;
  return (snapshotName || fallback).trim();
}

export function resolveReadoutColor(
  seriesId: string,
  styleBySeriesId: Map<string, SeriesStyleSnapshot>,
  isVisible: boolean
): string {
  if (!isVisible) return "#71717a";
  const style = styleBySeriesId.get(seriesId);
  const stroke = style?.stroke_color;
  if (typeof stroke === "string" && stroke.trim()) return stroke;
  const marker = style?.marker_color;
  if (typeof marker === "string" && marker.trim()) return marker;
  const histPos = style?.histogram_positive_color;
  if (typeof histPos === "string" && histPos.trim()) return histPos;
  return "#d4d4d8";
}


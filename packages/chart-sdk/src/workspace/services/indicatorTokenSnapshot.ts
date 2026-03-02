import type { DrishyaChartClient } from "../../wasm/client.js";
import {
  canonicalIndicatorId,
  encodeIndicatorToken,
  parseIndicatorParamsFromSeriesId,
} from "./indicatorIdentity.js";

export const snapshotIndicatorTokensFromReadout = (chart: DrishyaChartClient): string[] => {
  const indicators = chart.readoutSnapshot()?.indicators ?? [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of indicators) {
    const id = canonicalIndicatorId(item.id.split(":")[0] ?? "");
    if (!id) continue;
    const token = encodeIndicatorToken(id, parseIndicatorParamsFromSeriesId(id, item.id));
    if (seen.has(token)) continue;
    seen.add(token);
    out.push(token);
  }
  return out;
};

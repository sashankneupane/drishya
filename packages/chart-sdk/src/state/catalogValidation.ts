import type { DiscoveredIndicator, StrictIndicatorStyleSlotConfig } from "../wasm/contracts.js";

export interface CatalogValidationIssue {
  code: string;
  path: string;
  message: string;
}

const canonicalIndicatorId = (rawId: string): string => {
  const id = (rawId || "").toLowerCase().trim();
  if (!id) return id;
  if (id === "bbands") return "bb";
  if (id.startsWith("macd")) return "macd";
  if (id.startsWith("stoch")) return "stoch";
  if (id === "plus-di" || id === "minus-di") return "adx";
  return id;
};

const isPrimitive = (value: unknown): value is string | number | boolean =>
  typeof value === "string" || typeof value === "number" || typeof value === "boolean";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

export function validateIndicatorPayloadAgainstCatalog(args: {
  catalog: readonly DiscoveredIndicator[];
  indicatorId: string;
  params: Record<string, unknown>;
  styleSlots: Record<string, StrictIndicatorStyleSlotConfig>;
  path: string;
}): CatalogValidationIssue[] {
  const issues: CatalogValidationIssue[] = [];
  const targetId = canonicalIndicatorId(args.indicatorId);
  const metadata = args.catalog.find((item) => canonicalIndicatorId(item.id) === targetId);
  if (!metadata) {
    issues.push({
      code: "unknown_indicator_catalog_id",
      path: `${args.path}.indicatorId`,
      message: `Indicator '${args.indicatorId}' was not found in the runtime catalog.`,
    });
    return issues;
  }

  const requiredParams = metadata.params.filter((param) => param.required);
  for (const param of requiredParams) {
    if (typeof args.params[param.name] === "undefined") {
      issues.push({
        code: "missing_required_indicator_param",
        path: `${args.path}.params.${param.name}`,
        message: `Required indicator param '${param.name}' is missing for '${targetId}'.`,
      });
    }
  }

  const paramMetaByName = new Map(metadata.params.map((param) => [param.name, param]));
  for (const [name, value] of Object.entries(args.params)) {
    const metaParam = paramMetaByName.get(name);
    if (!metaParam) continue;
    if (!isPrimitive(value)) {
      issues.push({
        code: "invalid_indicator_param_type",
        path: `${args.path}.params.${name}`,
        message: `Param '${name}' must be a primitive value.`,
      });
      continue;
    }
    const kind = metaParam.kind.toLowerCase();
    if ((kind === "int" || kind === "integer") && typeof value !== "number") {
      issues.push({
        code: "invalid_indicator_param_kind",
        path: `${args.path}.params.${name}`,
        message: `Param '${name}' must be a number (integer kind).`,
      });
    } else if ((kind === "float" || kind === "number") && typeof value !== "number") {
      issues.push({
        code: "invalid_indicator_param_kind",
        path: `${args.path}.params.${name}`,
        message: `Param '${name}' must be a number (float kind).`,
      });
    } else if ((kind === "bool" || kind === "boolean") && typeof value !== "boolean") {
      issues.push({
        code: "invalid_indicator_param_kind",
        path: `${args.path}.params.${name}`,
        message: `Param '${name}' must be a boolean.`,
      });
    } else if (kind === "string" && typeof value !== "string") {
      issues.push({
        code: "invalid_indicator_param_kind",
        path: `${args.path}.params.${name}`,
        message: `Param '${name}' must be a string.`,
      });
    }
  }

  for (const slot of metadata.visual.style_slots) {
    const slotPayload = args.styleSlots[slot.slot];
    if (!isRecord(slotPayload)) {
      issues.push({
        code: "missing_required_style_slot",
        path: `${args.path}.styleSlots.${slot.slot}`,
        message: `Style slot '${slot.slot}' is required by '${targetId}'.`,
      });
      continue;
    }
    if (typeof slotPayload.color !== "string" || !slotPayload.color.trim()) {
      issues.push({
        code: "invalid_style_slot_color",
        path: `${args.path}.styleSlots.${slot.slot}.color`,
        message: `Style slot '${slot.slot}' must provide a non-empty color.`,
      });
    }
  }
  return issues;
}

export function assertValidIndicatorPayloadAgainstCatalog(args: {
  catalog: readonly DiscoveredIndicator[];
  indicatorId: string;
  params: Record<string, unknown>;
  styleSlots: Record<string, StrictIndicatorStyleSlotConfig>;
  path: string;
}): void {
  const issues = validateIndicatorPayloadAgainstCatalog(args);
  if (issues.length === 0) return;
  const details = issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
  throw new Error(`Invalid indicator payload: ${details}`);
}

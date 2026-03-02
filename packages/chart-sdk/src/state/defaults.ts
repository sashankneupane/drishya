import type { DiscoveredIndicator, IndicatorStyleSlot } from "../wasm/contracts.js";
import type { IndicatorInstanceState, IndicatorStyleSlotState } from "./schema.js";
import {
  defaultProfileForIndicator,
  inferDefaultFromParamShape,
  type ExplicitIndicatorValue,
  DEFAULT_INDICATOR_STYLE_BY_KIND,
} from "./defaultProfiles.js";

interface MaterializeIndicatorDefaultsInput {
  indicatorId: string;
  metadata?: Pick<DiscoveredIndicator, "params" | "visual"> | null;
  params?: Record<string, unknown>;
  styleSlots?: Record<string, Partial<IndicatorStyleSlotState>>;
}

interface MaterializeIndicatorInstanceInput extends MaterializeIndicatorDefaultsInput {
  instanceId: string;
  paneId: string;
  visible?: boolean;
}

export interface ExplicitIndicatorPayload {
  indicatorId: string;
  params: Record<string, string | number | boolean>;
  styleSlots: Record<string, IndicatorStyleSlotState>;
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

const toPrimitive = (value: unknown): string | number | boolean | null => {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  return null;
};

const coerceParamValue = (
  value: unknown,
  fallback: ExplicitIndicatorValue,
  kind: string
): string | number | boolean => {
  const normalizedKind = kind.toLowerCase();
  if (normalizedKind === "int" || normalizedKind === "integer") {
    const n = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(n)) return typeof fallback === "number" ? Math.round(fallback) : 14;
    return Math.max(1, Math.round(n));
  }
  if (normalizedKind === "float" || normalizedKind === "number") {
    const n = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(n)) return typeof fallback === "number" ? fallback : 2;
    return n;
  }
  if (normalizedKind === "bool" || normalizedKind === "boolean") {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") return value.toLowerCase() === "true";
    return Boolean(value);
  }
  const primitive = toPrimitive(value);
  if (primitive === null) return String(fallback);
  return primitive;
};

const inferSlotKind = (slot: IndicatorStyleSlot): IndicatorStyleSlotState["kind"] => {
  if (slot.kind === "fill") return "fill";
  const lowered = slot.slot.toLowerCase();
  if (lowered.includes("hist")) return "histogram";
  if (lowered.includes("marker")) return "markers";
  return "stroke";
};

const withSlotDefaults = (kind: IndicatorStyleSlotState["kind"]): IndicatorStyleSlotState => ({
  kind,
  ...DEFAULT_INDICATOR_STYLE_BY_KIND[kind],
});

const materializeStyleSlot = (
  slot: IndicatorStyleSlot,
  override: Partial<IndicatorStyleSlotState> | undefined
): IndicatorStyleSlotState => {
  const kind = override?.kind ?? inferSlotKind(slot);
  const base = withSlotDefaults(kind);
  const patterned =
    slot.default.pattern === "solid" || slot.default.pattern === "dashed" || slot.default.pattern === "dotted"
      ? slot.default.pattern
      : undefined;
  const effectiveColor =
    typeof override?.color === "string" && override.color ? override.color : slot.default.color || base.color;
  return {
    ...base,
    width: typeof slot.default.width === "number" ? slot.default.width : base.width,
    opacity: typeof slot.default.opacity === "number" ? slot.default.opacity : base.opacity,
    pattern: patterned ?? base.pattern,
    ...override,
    kind,
    color: effectiveColor,
  };
};

export function materializeExplicitIndicatorPayload(
  input: MaterializeIndicatorDefaultsInput
): ExplicitIndicatorPayload {
  const indicatorId = canonicalIndicatorId(input.indicatorId);
  const params: Record<string, string | number | boolean> = {};
  const profile = defaultProfileForIndicator(indicatorId);
  for (const [key, value] of Object.entries(profile)) {
    params[key] = value;
  }

  for (const spec of input.metadata?.params ?? []) {
    if (params[spec.name] === undefined) {
      params[spec.name] = inferDefaultFromParamShape(spec.name, spec.kind);
    }
  }
  const metadataByName = new Map((input.metadata?.params ?? []).map((spec) => [spec.name, spec]));
  for (const [key, value] of Object.entries(input.params ?? {})) {
    const spec = metadataByName.get(key);
    const fallback = params[key] ?? inferDefaultFromParamShape(key, spec?.kind ?? "");
    params[key] = coerceParamValue(value, fallback, spec?.kind ?? "");
  }

  const styleSlots: Record<string, IndicatorStyleSlotState> = {};
  for (const slot of input.metadata?.visual?.style_slots ?? []) {
    styleSlots[slot.slot] = materializeStyleSlot(slot, input.styleSlots?.[slot.slot]);
  }
  for (const [slotKey, override] of Object.entries(input.styleSlots ?? {})) {
    if (!styleSlots[slotKey]) {
      const kind = override.kind ?? "stroke";
      styleSlots[slotKey] = {
        ...withSlotDefaults(kind),
        ...override,
        kind,
        color:
          typeof override.color === "string" && override.color
            ? override.color
            : withSlotDefaults(kind).color,
      };
    }
  }

  return {
    indicatorId,
    params,
    styleSlots,
  };
}

export function materializeIndicatorInstanceState(
  input: MaterializeIndicatorInstanceInput
): IndicatorInstanceState {
  const payload = materializeExplicitIndicatorPayload(input);
  return {
    id: input.instanceId,
    indicatorId: payload.indicatorId,
    paneId: input.paneId,
    visible: input.visible ?? true,
    params: payload.params,
    styleSlots: payload.styleSlots,
  };
}

import { materializeExplicitIndicatorPayload, materializeIndicatorInstanceState } from "./defaults.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function testExplicitParamAndStyleMaterialization() {
  const payload = materializeExplicitIndicatorPayload({
    indicatorId: "macd",
    metadata: {
      params: [
        { name: "source", kind: "string", required: true },
        { name: "fast_period", kind: "int", required: true },
        { name: "slow_period", kind: "int", required: true },
        { name: "signal_period", kind: "int", required: true },
      ],
      visual: {
        pane_hint: "separate_pane",
        scale_group: "oscillator",
        output_visuals: [],
        style_slots: [
          {
            slot: "macd_line",
            kind: "stroke",
            default: { color: "#00ffcc", width: 2, opacity: 1, pattern: "solid" },
          },
        ],
      },
    },
    params: {
      fast_period: "8",
    },
  });

  assert(payload.params.source === "close", "Expected explicit source default.");
  assert(payload.params.fast_period === 8, "Expected coerced integer override for fast_period.");
  assert(payload.params.slow_period === 26, "Expected explicit slow_period default.");
  assert(payload.params.signal_period === 9, "Expected explicit signal_period default.");
  assert(payload.styleSlots.macd_line?.kind === "stroke", "Expected explicit style slot kind.");
  assert(payload.styleSlots.macd_line?.color === "#00ffcc", "Expected explicit style slot color.");
}

function testInstanceStateShape() {
  const instance = materializeIndicatorInstanceState({
    instanceId: "ind-1",
    indicatorId: "bbands",
    paneId: "pane-a",
    metadata: {
      params: [
        { name: "period", kind: "int", required: true },
        { name: "std_mult", kind: "float", required: true },
      ],
      visual: {
        pane_hint: "price_overlay",
        scale_group: "price",
        output_visuals: [],
        style_slots: [],
      },
    },
    params: {
      period: 21,
    },
  });
  assert(instance.indicatorId === "bb", "Expected canonicalized indicator id.");
  assert(instance.params.period === 21, "Expected persisted explicit period.");
  assert(typeof instance.params.std_mult === "number", "Expected explicit std_mult default.");
  assert(typeof instance.styleSlots === "object", "Expected explicit style slot map.");
}

testExplicitParamAndStyleMaterialization();
testInstanceStateShape();

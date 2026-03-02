import type { DrishyaChartClient } from "../wasm/client.js";

export function createChartFacade(
  getActiveChart: () => DrishyaChartClient | null
): DrishyaChartClient {
  return new Proxy({} as DrishyaChartClient, {
    get(_target, prop: keyof DrishyaChartClient) {
      const activeChart = getActiveChart();
      if (!activeChart) return undefined;
      const value = (activeChart as any)[prop];
      if (typeof value === "function") {
        return (...args: unknown[]) => (activeChart as any)[prop](...args);
      }
      return value;
    },
  }) as DrishyaChartClient;
}


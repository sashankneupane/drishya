import type { ChartPaneRuntime } from "../../workspace/models/runtimeTypes.js";

interface CreateTileRuntimeRegistryOptions {
  createRuntimeForPane: (paneId: string) => ChartPaneRuntime;
  paneExists: (paneId: string) => boolean;
}

export interface TileRuntimeRegistry {
  map: Map<string, ChartPaneRuntime>;
  getRuntime: (paneId: string) => ChartPaneRuntime | null;
  getActiveRuntime: (activePaneId: string) => ChartPaneRuntime | null;
  getPrimaryRuntime: () => ChartPaneRuntime | null;
}

export function createTileRuntimeRegistry(
  options: CreateTileRuntimeRegistryOptions
): TileRuntimeRegistry {
  const map = new Map<string, ChartPaneRuntime>();

  const getRuntime = (paneId: string): ChartPaneRuntime | null => {
    if (map.has(paneId)) return map.get(paneId) ?? null;
    if (!options.paneExists(paneId)) return null;
    const created = options.createRuntimeForPane(paneId);
    map.set(paneId, created);
    return created;
  };

  const getActiveRuntime = (activePaneId: string): ChartPaneRuntime | null => {
    return getRuntime(activePaneId) ?? map.get("price") ?? null;
  };

  const getPrimaryRuntime = (): ChartPaneRuntime | null =>
    map.get("price") ?? map.values().next().value ?? null;

  return {
    map,
    getRuntime,
    getActiveRuntime,
    getPrimaryRuntime,
  };
}

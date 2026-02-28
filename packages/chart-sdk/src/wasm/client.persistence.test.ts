import { DrishyaChartClient } from "./client.js";
import type { ChartStateSnapshot, WasmChartLike } from "./contracts.js";

function testClientPersistenceMethods() {
  let restoredJson: string | null = null;

  const snapshot: ChartStateSnapshot = {
    saved_at_unix_ms: 1700000000000,
    chart_state: {
      viewport: { world_start_x: 0, world_end_x: 100, y_zoom_factor: 1, y_pan_offset: 0 },
      panes: { order: [], panes: [] },
      appearance: {
        theme: "dark",
        config: { background: "#030712", candle_up: "#22c55e", candle_down: "#ef4444" }
      },
      drawings: [],
      object_tree: { panes: [], series: [], layers: [], groups: [], drawings: [] },
      selection: null
    }
  };

  const wasm: WasmChartLike = {
    resize() { },
    draw() { },
    set_ohlcv_json() { },
    pan_pixels() { },
    zoom_at_x() { },
    chart_state_snapshot_json() {
      return JSON.stringify(snapshot);
    },
    restore_chart_state_json(json: string) {
      restoredJson = json;
    }
  };

  const client = new DrishyaChartClient(wasm);

  const exported = client.exportChartState();
  if (exported.saved_at_unix_ms !== snapshot.saved_at_unix_ms) {
    throw new Error("exportChartState should parse and return wasm snapshot payload");
  }

  client.importChartState(snapshot);
  if (restoredJson !== JSON.stringify(snapshot)) {
    throw new Error("importChartState should serialize and pass payload to wasm");
  }

  client.importChartStateJson("{\"saved_at_unix_ms\":1,\"chart_state\":{\"viewport\":{\"world_start_x\":0,\"world_end_x\":1},\"panes\":{\"order\":[],\"panes\":[]},\"appearance\":{\"theme\":\"dark\",\"config\":{}},\"drawings\":[],\"object_tree\":{\"panes\":[],\"series\":[],\"layers\":[],\"groups\":[],\"drawings\":[]}}}");
  if (restoredJson === null) {
    throw new Error("importChartStateJson should forward JSON string to wasm");
  }
}

testClientPersistenceMethods();

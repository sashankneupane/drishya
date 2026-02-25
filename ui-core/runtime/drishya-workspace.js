const EMPTY_OBJECT_TREE = {
  panes: [],
  series: [],
  drawings: [],
};

export class DrishyaChartClient {
  constructor(wasm) {
    this.wasm = wasm;
  }

  raw() {
    return this.wasm;
  }

  resize(width, height) {
    this.wasm.resize(width, height);
  }

  draw() {
    this.wasm.draw();
  }

  setCandles(candles) {
    this.wasm.set_ohlcv_json(JSON.stringify(candles));
  }

  appendCandle(candle) {
    if (typeof this.wasm.append_ohlcv_json === "function") {
      this.wasm.append_ohlcv_json(JSON.stringify(candle));
    }
  }

  pan(dx) {
    this.wasm.pan_pixels(dx);
  }

  pan2d(dx, dy, anchorY) {
    if (typeof this.wasm.pan_pixels_2d === "function") {
      this.wasm.pan_pixels_2d(dx, dy, anchorY);
      return;
    }
    this.wasm.pan_pixels(dx);
  }

  zoomX(anchorX, zoomFactor) {
    this.wasm.zoom_at_x(anchorX, zoomFactor);
  }

  zoomY(anchorY, zoomFactor) {
    if (typeof this.wasm.zoom_y_axis_at === "function") {
      this.wasm.zoom_y_axis_at(anchorY, zoomFactor);
    }
  }

  setCrosshair(x, y) {
    if (typeof this.wasm.set_crosshair_at === "function") {
      this.wasm.set_crosshair_at(x, y);
    }
  }

  clearCrosshair() {
    if (typeof this.wasm.clear_crosshair === "function") {
      this.wasm.clear_crosshair();
    }
  }

  setTheme(theme) {
    if (typeof this.wasm.set_theme === "function") {
      this.wasm.set_theme(theme);
    }
  }

  setDrawingTool(mode) {
    if (typeof this.wasm.set_drawing_tool_mode === "function") {
      this.wasm.set_drawing_tool_mode(mode);
    }
  }

  drawingToolMode() {
    if (typeof this.wasm.drawing_tool_mode === "function") {
      return this.wasm.drawing_tool_mode();
    }
    return "select";
  }

  drawingPointerDown(x, y) {
    if (typeof this.wasm.drawing_pointer_down === "function") {
      return this.wasm.drawing_pointer_down(x, y);
    }
    return false;
  }

  drawingPointerMove(x, y) {
    if (typeof this.wasm.drawing_pointer_move === "function") {
      return this.wasm.drawing_pointer_move(x, y);
    }
    return false;
  }

  drawingPointerUp(x, y) {
    if (typeof this.wasm.drawing_pointer_up === "function") {
      return this.wasm.drawing_pointer_up(x, y);
    }
    return false;
  }

  drawingCursorHint(x, y) {
    if (typeof this.wasm.drawing_cursor_hint === "function") {
      return this.wasm.drawing_cursor_hint(x, y) || "default";
    }
    return "default";
  }

  clearDrawings() {
    if (typeof this.wasm.clear_drawings === "function") {
      this.wasm.clear_drawings();
    }
  }

  addSmaOverlay(period) {
    if (typeof this.wasm.add_sma_overlay === "function") {
      this.wasm.add_sma_overlay(period);
    }
  }

  addBbandsOverlay(period, stdMult) {
    if (typeof this.wasm.add_bbands_overlay === "function") {
      this.wasm.add_bbands_overlay(period, stdMult);
    }
  }

  addRsiPaneIndicator(period) {
    if (typeof this.wasm.add_rsi_pane_indicator === "function") {
      this.wasm.add_rsi_pane_indicator(period);
    }
  }

  addMomentumHistogramOverlay() {
    if (typeof this.wasm.add_momentum_histogram_overlay === "function") {
      this.wasm.add_momentum_histogram_overlay();
    }
  }

  clearIndicatorOverlays() {
    if (typeof this.wasm.clear_indicator_overlays === "function") {
      this.wasm.clear_indicator_overlays();
    }
  }

  setPaneWeights(weightMap) {
    if (typeof this.wasm.set_pane_weights_json === "function") {
      this.wasm.set_pane_weights_json(JSON.stringify(weightMap));
    }
  }

  paneLayouts() {
    if (typeof this.wasm.pane_layouts_json !== "function") {
      return [];
    }
    const parsed = safeJsonParse(this.wasm.pane_layouts_json());
    return Array.isArray(parsed?.panes) ? parsed.panes : [];
  }

  objectTreeState() {
    if (typeof this.wasm.object_tree_state_json !== "function") {
      return EMPTY_OBJECT_TREE;
    }
    const parsed = safeJsonParse(this.wasm.object_tree_state_json());
    if (!parsed) return EMPTY_OBJECT_TREE;
    return {
      panes: Array.isArray(parsed.panes) ? parsed.panes : [],
      series: Array.isArray(parsed.series) ? parsed.series : [],
      drawings: Array.isArray(parsed.drawings) ? parsed.drawings : [],
    };
  }

  applyObjectTreeAction(action) {
    if (action.kind === "pane") {
      if (typeof this.wasm.set_pane_visible === "function") {
        this.wasm.set_pane_visible(action.id, action.visible);
      }
      return;
    }

    if (action.kind === "series") {
      if (action.type === "delete") {
        if (typeof this.wasm.delete_series === "function") {
          this.wasm.delete_series(action.id);
        }
      } else if (typeof this.wasm.set_series_visible === "function") {
        this.wasm.set_series_visible(action.id, action.visible);
      }
      return;
    }

    if (action.kind === "drawing") {
      const drawingId = Number(action.id);
      if (!Number.isFinite(drawingId)) return;
      if (action.type === "delete") {
        if (typeof this.wasm.remove_drawing === "function") {
          this.wasm.remove_drawing(drawingId);
        }
      } else if (typeof this.wasm.set_drawing_visible === "function") {
        this.wasm.set_drawing_visible(drawingId, action.visible);
      }
    }
  }
}

export function buildObjectTreeNodes(state) {
  const out = [];

  out.push({
    id: "header:data",
    label: "Data",
    kind: "header",
    depth: 0,
  });

  for (const pane of state.panes || []) {
    out.push({
      id: pane.id,
      label: `Pane: ${pane.id}`,
      kind: "pane",
      depth: 1,
      visible: !!pane.visible,
    });
  }

  for (const series of state.series || []) {
    if (series.deleted) continue;
    out.push({
      id: series.id,
      label: `Series: ${series.name} [${series.pane_id}]`,
      kind: "series",
      depth: 1,
      visible: !!series.visible,
      deletable: true,
    });
  }

  out.push({
    id: "header:drawings",
    label: "Drawings",
    kind: "header",
    depth: 0,
  });

  for (const drawing of state.drawings || []) {
    out.push({
      id: String(drawing.id),
      label: `${drawing.kind} #${drawing.id}`,
      kind: "drawing",
      depth: 1,
      visible: !!drawing.visible,
      deletable: true,
    });
  }

  return out;
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

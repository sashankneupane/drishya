import type { WorkspaceDocument, WorkspaceState } from "./schema.js";
import type { DiscoveredIndicator } from "../wasm/contracts.js";
import { validateIndicatorPayloadAgainstCatalog } from "./catalogValidation.js";

export interface ValidationIssue {
  code: string;
  path: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: ValidationIssue[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isStringRecord = (value: unknown): value is Record<string, unknown> => isRecord(value);
const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

const uniqueArray = (values: string[]): boolean => new Set(values).size === values.length;

const recordKeys = (value: Record<string, unknown>): string[] => Object.keys(value);

const sameKeys = (orderedIds: unknown, byId: unknown): boolean => {
  if (!isStringArray(orderedIds) || !isStringRecord(byId)) {
    return false;
  }
  const orderSet = new Set(orderedIds);
  const keySet = new Set(recordKeys(byId));
  if (orderSet.size !== orderedIds.length || orderSet.size !== keySet.size) {
    return false;
  }
  for (const id of orderSet) {
    if (!keySet.has(id)) {
      return false;
    }
  }
  return true;
};

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

function collectLeafTileIds(node: unknown, errors: ValidationIssue[], path: string): string[] {
  if (!isRecord(node)) {
    errors.push({
      code: "invalid_layout_node",
      path,
      message: "Layout node must be an object.",
    });
    return [];
  }
  if (node.type === "leaf") {
    if (typeof node.tileId !== "string") {
      errors.push({
        code: "invalid_layout_leaf_tile",
        path: `${path}.tileId`,
        message: "Leaf node tileId must be a string.",
      });
      return [];
    }
    return [node.tileId];
  }
  if (node.type !== "split") {
    errors.push({
      code: "invalid_layout_node_type",
      path: `${path}.type`,
      message: "Layout node type must be 'leaf' or 'split'.",
    });
    return [];
  }
  if (node.direction !== "row" && node.direction !== "column") {
    errors.push({
      code: "invalid_layout_direction",
      path: `${path}.direction`,
      message: "Split direction must be 'row' or 'column'.",
    });
  }
  if (!isFiniteNumber(node.ratio) || node.ratio <= 0 || node.ratio >= 1) {
    errors.push({
      code: "invalid_layout_ratio",
      path: `${path}.ratio`,
      message: "Split ratio must be a finite number strictly between 0 and 1.",
    });
  }
  const first = collectLeafTileIds(node.first, errors, `${path}.first`);
  const second = collectLeafTileIds(node.second, errors, `${path}.second`);
  return [...first, ...second];
}

function validateChartTileState(chart: unknown, tileId: string, errors: ValidationIssue[]): void {
  const chartPath = `workspace.tiles.${tileId}.chart`;
  if (!isRecord(chart)) {
    errors.push({
      code: "invalid_chart_tile_state",
      path: chartPath,
      message: "Chart state must be an object.",
    });
    return;
  }

  const tabOrder = chart.tabOrder;
  const tabs = chart.tabs;
  const indicatorOrder = chart.indicatorOrder;
  const indicators = chart.indicators;
  const paneOrder = chart.paneOrder;
  const panes = chart.panes;
  const activeTabId = chart.activeTabId;

  if (!sameKeys(tabOrder, tabs)) {
    errors.push({
      code: "tab_order_mismatch",
      path: `${chartPath}.tabOrder`,
      message: "tabOrder and tabs keys must match exactly.",
    });
  }
  if (!sameKeys(indicatorOrder, indicators)) {
    errors.push({
      code: "indicator_order_mismatch",
      path: `${chartPath}.indicatorOrder`,
      message: "indicatorOrder and indicators keys must match exactly.",
    });
  }
  if (!sameKeys(paneOrder, panes)) {
    errors.push({
      code: "pane_order_mismatch",
      path: `${chartPath}.paneOrder`,
      message: "paneOrder and panes keys must match exactly.",
    });
  }
  if (
    typeof activeTabId !== "string" ||
    !isStringRecord(tabs) ||
    typeof tabs[activeTabId] === "undefined"
  ) {
    errors.push({
      code: "missing_active_tab",
      path: `${chartPath}.activeTabId`,
      message: "activeTabId must reference an existing tab.",
    });
  }

  if (isStringRecord(tabs)) {
    for (const [tabId, tab] of Object.entries(tabs)) {
      if (!isRecord(tab)) {
        errors.push({
          code: "invalid_tab_state",
          path: `${chartPath}.tabs.${tabId}`,
          message: "Tab state must be an object.",
        });
        continue;
      }
      if (tab.id !== tabId) {
        errors.push({
          code: "tab_id_mismatch",
          path: `${chartPath}.tabs.${tabId}.id`,
          message: "Tab id must match its record key.",
        });
      }
    }
  }

  const paneIds = new Set(isStringRecord(panes) ? Object.keys(panes) : []);
  if (isStringRecord(indicators)) {
    for (const [indicatorId, indicator] of Object.entries(indicators)) {
      if (!isRecord(indicator)) {
        errors.push({
          code: "invalid_indicator_state",
          path: `${chartPath}.indicators.${indicatorId}`,
          message: "Indicator instance state must be an object.",
        });
        continue;
      }
      if (indicator.id !== indicatorId) {
        errors.push({
          code: "indicator_id_mismatch",
          path: `${chartPath}.indicators.${indicatorId}.id`,
          message: "Indicator id must match its record key.",
        });
      }
      if (typeof indicator.paneId !== "string" || !paneIds.has(indicator.paneId)) {
        errors.push({
          code: "missing_indicator_pane",
          path: `${chartPath}.indicators.${indicatorId}.paneId`,
          message: "Indicator paneId must reference an existing pane in the same tile.",
        });
      }
    }
  }

  if (isStringRecord(panes)) {
    for (const [paneId, pane] of Object.entries(panes)) {
      if (!isRecord(pane)) {
        errors.push({
          code: "invalid_pane_state",
          path: `${chartPath}.panes.${paneId}`,
          message: "Pane state must be an object.",
        });
        continue;
      }
      if (pane.id !== paneId) {
        errors.push({
          code: "pane_id_mismatch",
          path: `${chartPath}.panes.${paneId}.id`,
          message: "Pane id must match its record key.",
        });
      }
      if (!isFiniteNumber(pane.ratio) || pane.ratio <= 0) {
        errors.push({
          code: "invalid_pane_ratio",
          path: `${chartPath}.panes.${paneId}.ratio`,
          message: "Pane ratio must be a finite number greater than 0.",
        });
      }
    }
  }
}

function validateWorkspaceState(state: WorkspaceState, errors: ValidationIssue[]): void {
  const tileEntries = Object.entries(state.tiles);
  const tileKeys = tileEntries.map(([tileId]) => tileId);
  const layoutLeafTileIds = collectLeafTileIds(state.layoutTree, errors, "workspace.layoutTree");

  if (!uniqueArray(layoutLeafTileIds)) {
    errors.push({
      code: "layout_duplicate_leaf_tile",
      path: "workspace.layoutTree",
      message: "layoutTree contains duplicate leaf tile ids.",
    });
  }

  if (!sameKeys(layoutLeafTileIds, state.tiles)) {
    errors.push({
      code: "layout_tiles_mismatch",
      path: "workspace.layoutTree",
      message: "layoutTree leaf tile ids and workspace.tiles keys must match exactly.",
    });
  }

  if (state.activeTileId !== null && !tileKeys.includes(state.activeTileId)) {
    errors.push({
      code: "missing_active_tile",
      path: "workspace.activeTileId",
      message: "activeTileId must reference an existing tile or be null.",
    });
  }

  for (const [tileId, tile] of tileEntries) {
    if (!isRecord(tile)) {
      errors.push({
        code: "invalid_tile_state",
        path: `workspace.tiles.${tileId}`,
        message: "Tile state must be an object.",
      });
      continue;
    }
    if (tile.id !== tileId) {
      errors.push({
        code: "tile_id_mismatch",
        path: `workspace.tiles.${tileId}.id`,
        message: "Tile id must match its record key.",
      });
    }
    if (tile.kind === "chart") {
      if (!tile.chart) {
        errors.push({
          code: "missing_chart_tile_state",
          path: `workspace.tiles.${tileId}.chart`,
          message: "Chart tiles must define chart state.",
        });
        continue;
      }
      validateChartTileState(tile.chart, tileId, errors);
    }
  }

  for (const [assetId, drawings] of Object.entries(state.drawingsByAsset)) {
    if (!isStringRecord(drawings)) {
      errors.push({
        code: "invalid_asset_drawings_bucket",
        path: `workspace.drawingsByAsset.${assetId}`,
        message: "Asset drawing bucket must be an object keyed by drawing id.",
      });
      continue;
    }
    for (const [drawingId, drawing] of Object.entries(drawings)) {
      if (!isRecord(drawing)) {
        errors.push({
          code: "invalid_drawing_state",
          path: `workspace.drawingsByAsset.${assetId}.${drawingId}`,
          message: "Drawing state must be an object.",
        });
        continue;
      }
      if (drawing.id !== drawingId) {
        errors.push({
          code: "drawing_id_mismatch",
          path: `workspace.drawingsByAsset.${assetId}.${drawingId}.id`,
          message: "Drawing id must match its record key.",
        });
      }
      if (drawing.assetId !== assetId) {
        errors.push({
          code: "drawing_asset_mismatch",
          path: `workspace.drawingsByAsset.${assetId}.${drawingId}.assetId`,
          message: "Drawing assetId must match its containing asset bucket key.",
        });
      }
    }
  }
}

export function validateWorkspaceDocument(doc: unknown): ValidationResult {
  const errors: ValidationIssue[] = [];
  if (!isRecord(doc)) {
    return {
      ok: false,
      errors: [
        {
          code: "invalid_document",
          path: "",
          message: "Workspace document must be an object.",
        },
      ],
    };
  }

  const workspace = doc.workspace;
  if (!isRecord(workspace)) {
    return {
      ok: false,
      errors: [
        {
          code: "missing_workspace",
          path: "workspace",
          message: "Workspace document must include a workspace object.",
        },
      ],
    };
  }
  if (!isStringRecord(workspace.tiles)) {
    errors.push({
      code: "invalid_tiles",
      path: "workspace.tiles",
      message: "workspace.tiles must be a record of tiles.",
    });
  }
  if (!isRecord(workspace.layoutTree)) {
    errors.push({
      code: "invalid_layout_tree",
      path: "workspace.layoutTree",
      message: "workspace.layoutTree must be present.",
    });
  }
  if (!isStringRecord(workspace.drawingsByAsset)) {
    errors.push({
      code: "invalid_drawings_store",
      path: "workspace.drawingsByAsset",
      message: "workspace.drawingsByAsset must be an object keyed by asset id.",
    });
  }
  if (!isRecord(workspace.ui)) {
    errors.push({
      code: "invalid_workspace_ui",
      path: "workspace.ui",
      message: "workspace.ui must be present.",
    });
  }
  if (
    workspace.activeTileId !== null &&
    typeof workspace.activeTileId !== "string" &&
    workspace.activeTileId !== undefined
  ) {
    errors.push({
      code: "invalid_active_tile_id",
      path: "workspace.activeTileId",
      message: "workspace.activeTileId must be a tile id string or null.",
    });
  }

  if (errors.length === 0) {
    validateWorkspaceState(workspace as unknown as WorkspaceState, errors);
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}

export function assertValidWorkspaceDocument(doc: unknown): asserts doc is WorkspaceDocument {
  const result = validateWorkspaceDocument(doc);
  if (!result.ok) {
    const details = result.errors.map((error) => `${error.path}: ${error.message}`).join("; ");
    throw new Error(`Invalid workspace document: ${details}`);
  }
}

export function validateWorkspaceDocumentAgainstCatalog(
  doc: unknown,
  catalog: readonly DiscoveredIndicator[]
): ValidationResult {
  const baseResult = validateWorkspaceDocument(doc);
  if (!baseResult.ok) return baseResult;
  const parsed = doc as WorkspaceDocument;
  const errors: ValidationIssue[] = [...baseResult.errors];
  for (const [tileId, tile] of Object.entries(parsed.workspace.tiles)) {
    if (tile.kind !== "chart" || !tile.chart) continue;
    for (const indicatorId of tile.chart.indicatorOrder) {
      const indicator = tile.chart.indicators[indicatorId];
      if (!indicator) continue;
      const issues = validateIndicatorPayloadAgainstCatalog({
        catalog,
        indicatorId: indicator.indicatorId,
        params: indicator.params,
        styleSlots: indicator.styleSlots,
        path: `workspace.tiles.${tileId}.indicators.${indicatorId}`,
      });
      errors.push(...issues);
    }
  }
  return {
    ok: errors.length === 0,
    errors,
  };
}

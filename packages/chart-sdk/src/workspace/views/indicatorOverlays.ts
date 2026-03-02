import type { DrishyaChartClient } from "../../wasm/client.js";
import { DEFAULT_APPEARANCE_CONFIG } from "../models/constants.js";
import { createSymbolSearchModal } from "./SymbolSearchModal.js";
import { buildChartRootPaneIdSet } from "../models/chartPaneRoots.js";
import { decodeIndicatorToken } from "../services/indicatorIdentity.js";
import { createOverlayIconButton } from "./overlayIconButton.js";
import { buildPaneToTileOwnershipMap } from "../models/paneOwnership.js";
import { canonicalRuntimePaneId } from "../models/paneSpec.js";
import { resolveReadoutColor, resolveReadoutLabel } from "../utils/readoutStyle.js";
import { createOhlcvReadoutElement } from "./sourceReadout.js";
import type { WorkspaceController } from "../controllers/WorkspaceController.js";
import type { WorkspaceIntentController } from "../controllers/workspaceIntentController.js";
import type { CreateChartWorkspaceOptions } from "../models/types.js";

interface StageHost {
  stage: HTMLDivElement;
  chartLayer: HTMLDivElement;
}

interface RenderIndicatorOverlaysOptions {
  controller: WorkspaceController;
  paneHostByPaneId: Map<string, StageHost>;
  indicatorOverlayByPaneId: Map<string, HTMLDivElement>;
  getRuntime: (paneId: string) => { chart: DrishyaChartClient } | null;
  openIndicatorConfig: (
    target: { paneId?: string; seriesId?: string; indicatorId?: string },
    chartHint?: DrishyaChartClient | null
  ) => void;
  workspaceIntents: WorkspaceIntentController;
  draw: () => void;
  options: CreateChartWorkspaceOptions;
}

export const renderIndicatorOverlays = ({
  controller,
  paneHostByPaneId,
  indicatorOverlayByPaneId,
  getRuntime,
  openIndicatorConfig,
  workspaceIntents,
  draw,
  options,
}: RenderIndicatorOverlaysOptions): void => {
  const state = controller.getState();
  const paneToTileId = buildPaneToTileOwnershipMap(state.chartTiles);

  for (const [paneId, hostPane] of paneHostByPaneId) {
    const runtime = getRuntime(paneId);
    if (!runtime) continue;
    const chartTileId = paneToTileId.get(paneId);
    const indicatorTokens = chartTileId ? controller.getChartTileIndicatorTokens(chartTileId) : [];
    let overlay = indicatorOverlayByPaneId.get(paneId);
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.style.position = "absolute";
      overlay.style.left = "8px";
      overlay.style.top = "6px";
      overlay.style.zIndex = "30";
      overlay.style.pointerEvents = "none";
      overlay.style.whiteSpace = "nowrap";
      indicatorOverlayByPaneId.set(paneId, overlay);
    }
    if (overlay.parentElement !== hostPane.stage) {
      overlay.parentElement?.removeChild(overlay);
      hostPane.stage.appendChild(overlay);
    }
    overlay.innerHTML = "";

    const snapshot = runtime.chart.readoutSnapshot();
    const chartRootPaneIds = buildChartRootPaneIdSet(Object.keys(controller.getState().chartPanes));
    const source = state.chartPaneSources[paneId] ?? state.chartPaneSources.price ?? {};
    const symbol = source.symbol ?? options.marketControls?.selectedSymbol ?? "";
    const timeframe = source.timeframe ?? options.marketControls?.selectedTimeframe ?? "";
    const paneLayouts = runtime.chart.paneLayouts();
    const paneTopById = new Map<string, number>();
    const paneWidthById = new Map<string, number>();
    const runtimePaneIdSet = new Set<string>();
    for (const pane of paneLayouts) {
      const canonicalPaneId = canonicalRuntimePaneId(pane.id);
      runtimePaneIdSet.add(canonicalPaneId);
      paneTopById.set(canonicalPaneId, pane.y);
      paneWidthById.set(canonicalPaneId, pane.w);
    }
    const orderedPaneIds = state.paneLayout.order
      .map((id) => canonicalRuntimePaneId(id))
      .filter((id, idx, arr) => runtimePaneIdSet.has(id) && arr.indexOf(id) === idx);
    const paneOffsets = new Map<string, number>();
    const rowHeight = 24;
    const styleBySeriesId = new Map(
      runtime.chart.seriesStyleSnapshot().map((item) => [item.series_id, item] as const)
    );
    const mkOverlayIconBtn = (
      icon: "eye" | "eye-off" | "settings" | "trash" | "chevron-up" | "chevron-down",
      title: string,
      onClick: () => void,
      disabled = false
    ) =>
      createOverlayIconButton({
        icon,
        title,
        onClick,
        disabled,
        onAfterClick: () => draw(),
      });

    const hasPricePane = paneTopById.has("price");
    if (hasPricePane) {
      const priceTop = paneTopById.get("price") ?? 0;
      const pricePaneIndex = orderedPaneIds.indexOf("price");
      const canMovePriceUp = pricePaneIndex > 0;
      const canMovePriceDown = pricePaneIndex >= 0 && pricePaneIndex < orderedPaneIds.length - 1;
      const sourceRow = document.createElement("div");
      sourceRow.style.position = "absolute";
      sourceRow.style.left = "0";
      sourceRow.style.top = `${Math.max(0, Math.floor(priceTop))}px`;
      sourceRow.style.height = "22px";
      sourceRow.style.display = "flex";
      sourceRow.style.alignItems = "center";
      sourceRow.style.justifyContent = "space-between";
      sourceRow.style.gap = "12px";
      sourceRow.style.width = `${Math.max(220, (paneWidthById.get("price") ?? 240) - 16)}px`;
      sourceRow.style.paddingRight = "10px";
      sourceRow.style.pointerEvents = "auto";
      sourceRow.style.cursor = "default";
      sourceRow.style.whiteSpace = "nowrap";

      const sourceLeft = document.createElement("span");
      sourceLeft.style.display = "inline-flex";
      sourceLeft.style.alignItems = "center";
      sourceLeft.style.gap = "8px";
      sourceLeft.style.minWidth = "0";
      const sourceTextWrap = document.createElement("span");
      sourceTextWrap.style.display = "inline-flex";
      sourceTextWrap.style.alignItems = "center";
      sourceTextWrap.style.gap = "4px";
      const symbolText = document.createElement("span");
      symbolText.style.fontSize = "13px";
      symbolText.style.color = "#d4d4d8";
      symbolText.style.flexShrink = "0";
      symbolText.style.cursor = "pointer";
      symbolText.style.pointerEvents = "auto";
      symbolText.textContent = symbol || snapshot?.source_label || "";
      sourceTextWrap.appendChild(symbolText);
      if (timeframe) {
        const timeframeText = document.createElement("span");
        timeframeText.style.fontSize = "13px";
        timeframeText.style.color = "#a1a1aa";
        timeframeText.style.flexShrink = "0";
        timeframeText.textContent = `· ${timeframe}`;
        sourceTextWrap.appendChild(timeframeText);
      }
      sourceLeft.appendChild(sourceTextWrap);

      const ohlc = snapshot?.ohlcv ?? null;
      if (ohlc) {
        const appearance = runtime.chart.getAppearanceConfig() ?? DEFAULT_APPEARANCE_CONFIG;
        const values = createOhlcvReadoutElement(ohlc, appearance);
        sourceLeft.appendChild(values);
      }
      sourceRow.appendChild(sourceLeft);

      const pricePaneControls = document.createElement("div");
      pricePaneControls.style.display = "inline-flex";
      pricePaneControls.style.alignItems = "center";
      pricePaneControls.style.gap = "6px";
      pricePaneControls.style.flexShrink = "0";
      if (chartTileId && canMovePriceUp) {
        pricePaneControls.append(
          mkOverlayIconBtn("chevron-up", "Move pane up", () => {
            workspaceIntents.movePaneInTile(chartTileId, "price", "up");
          })
        );
      }
      if (chartTileId && canMovePriceDown) {
        pricePaneControls.append(
          mkOverlayIconBtn("chevron-down", "Move pane down", () => {
            workspaceIntents.movePaneInTile(chartTileId, "price", "down");
          })
        );
      }
      if (pricePaneControls.childElementCount > 0) {
        sourceRow.appendChild(pricePaneControls);
      }

      symbolText.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        const symbols = options.marketControls?.symbols ?? [];
        if (!symbols.length) return;
        createSymbolSearchModal({
          symbols,
          onSelect: async (nextSymbol) => {
            workspaceIntents.setPaneSource(paneId, { symbol: nextSymbol });
            await options.marketControls?.onChartPaneSourceChange?.(paneId, {
              symbol: nextSymbol,
              timeframe: controller.getState().chartPaneSources[paneId]?.timeframe,
            });
            await options.marketControls?.onSymbolChange?.(nextSymbol);
          },
          onClose: () => {},
        });
      };

      overlay.appendChild(sourceRow);
      paneOffsets.set("price", rowHeight + 6);
    }

    const paneOwnership = runtime.chart.paneChartPaneMap();
    const indicatorsInRuntime = (snapshot?.indicators ?? []).filter((item) => {
      const owner = paneOwnership[item.pane_id];
      if (owner) return owner === paneId;
      return true;
    });
    const indicatorsByPane = new Map<string, typeof indicatorsInRuntime>();
    for (const item of indicatorsInRuntime) {
      const indicatorPaneId = canonicalRuntimePaneId(item.pane_id);
      const arr = indicatorsByPane.get(indicatorPaneId) ?? [];
      arr.push(item);
      indicatorsByPane.set(indicatorPaneId, arr);
    }

    const indicatorOrder = new Map<string, number>();
    indicatorTokens.forEach((token, i) => {
      const id = decodeIndicatorToken(token).indicatorId;
      if (!indicatorOrder.has(id)) indicatorOrder.set(id, i);
    });

    for (const [indicatorPaneId, paneItems] of indicatorsByPane) {
      let rowIndex = 0;
      const baseTop = paneTopById.get(indicatorPaneId);
      if (baseTop === undefined) continue;
      const startOffset = paneOffsets.get(indicatorPaneId) ?? 2;
      const canonicalPaneId = canonicalRuntimePaneId(indicatorPaneId);
      const isDedicatedIndicatorPane = !chartRootPaneIds.has(canonicalPaneId);

      const sortedPaneItems = [...paneItems].sort((a, b) => {
        const abase = a.id.split(":")[0];
        const bbase = b.id.split(":")[0];
        return (indicatorOrder.get(abase) ?? 999) - (indicatorOrder.get(bbase) ?? 999);
      });

      for (const snapshotItem of sortedPaneItems) {
        const indicatorId = snapshotItem.id.split(":")[0];
        const isFirstIndicatorRow = rowIndex === 0;
        const row = document.createElement("div");
        row.style.position = "absolute";
        row.style.left = "0";
        row.style.top = `${Math.max(0, Math.floor(baseTop + startOffset + rowIndex * rowHeight))}px`;
        rowIndex += 1;
        row.style.height = `${rowHeight}px`;
        row.style.width = `${Math.max(220, (paneWidthById.get(indicatorPaneId) ?? 240) - 16)}px`;
        row.style.pointerEvents = "auto";
        row.style.cursor = "pointer";
        row.style.display = "flex";
        row.style.justifyContent = "space-between";
        row.style.alignItems = "center";
        row.style.gap = "6px";
        row.style.whiteSpace = "nowrap";
        row.style.paddingRight = "10px";

        const left = document.createElement("div");
        left.style.display = "inline-flex";
        left.style.alignItems = "center";
        left.style.minWidth = "0";
        left.style.flex = "1";
        left.style.gap = "6px";

        const label = document.createElement("span");
        label.style.fontSize = "13px";
        label.style.whiteSpace = "nowrap";
        label.style.overflow = "hidden";
        label.style.textOverflow = "ellipsis";
        const nameEl = document.createElement("span");
        nameEl.style.color = !snapshotItem.visible ? "#71717a" : "#d4d4d8";
        nameEl.textContent = `${resolveReadoutLabel(snapshotItem.id, snapshotItem.name)} `;
        const valueEl = document.createElement("span");
        valueEl.style.color = resolveReadoutColor(snapshotItem.id, styleBySeriesId, snapshotItem.visible);
        valueEl.textContent = Number.isFinite(snapshotItem.value) ? snapshotItem.value.toFixed(2) : "--";
        label.append(nameEl, valueEl);
        left.appendChild(label);

        const indicatorControls = document.createElement("div");
        indicatorControls.style.display = "inline-flex";
        indicatorControls.style.position = "static";
        indicatorControls.style.gap = "6px";
        indicatorControls.style.alignItems = "center";
        indicatorControls.style.marginLeft = "2px";
        indicatorControls.style.opacity = "0";
        indicatorControls.style.pointerEvents = "none";
        indicatorControls.style.transition = "opacity 120ms ease";

        const getMainSeriesId = () =>
          runtime.chart
            .objectTreeState()
            .series.find((s) => s.id.startsWith(`${indicatorId}:`) || s.id === indicatorId)?.id ?? null;
        const isVisible = () => {
          const id = getMainSeriesId();
          if (!id) return true;
          return runtime.chart.objectTreeState().series.find((s) => s.id === id)?.visible ?? true;
        };

        const paneControls = document.createElement("div");
        paneControls.style.display = "inline-flex";
        paneControls.style.gap = "6px";
        paneControls.style.alignItems = "center";
        paneControls.style.flexShrink = "0";
        const paneOrderIndex = orderedPaneIds.indexOf(canonicalRuntimePaneId(indicatorPaneId));
        const canMoveUp = paneOrderIndex > 0;
        const canMoveDown = paneOrderIndex >= 0 && paneOrderIndex < orderedPaneIds.length - 1;

        if (isFirstIndicatorRow && isDedicatedIndicatorPane) {
          if (canMoveUp) {
            paneControls.append(
              mkOverlayIconBtn("chevron-up", "Move pane up", () => {
                if (!chartTileId) return;
                workspaceIntents.movePaneInTile(chartTileId, indicatorPaneId, "up");
              })
            );
          }
          if (canMoveDown) {
            paneControls.append(
              mkOverlayIconBtn("chevron-down", "Move pane down", () => {
                if (!chartTileId) return;
                workspaceIntents.movePaneInTile(chartTileId, indicatorPaneId, "down");
              })
            );
          }
          paneControls.append(
            mkOverlayIconBtn("trash", "Delete pane", () => {
              if (!chartTileId) return;
              workspaceIntents.deletePaneInTile(chartTileId, indicatorPaneId, "indicator", runtime.chart);
            })
          );
        }

        indicatorControls.append(
          mkOverlayIconBtn(isVisible() ? "eye" : "eye-off", "Hide/show", () => {
            workspaceIntents.toggleVisibility(runtime.chart, "series", snapshotItem.id, !snapshotItem.visible);
          }),
          mkOverlayIconBtn("settings", "Configure", () => {
            openIndicatorConfig(
              {
                paneId: indicatorPaneId,
                seriesId: snapshotItem.id,
                indicatorId: snapshotItem.id.split(":")[0],
              },
              runtime.chart
            );
          }),
          mkOverlayIconBtn("trash", "Delete", () => {
            if (!chartTileId) return;
            workspaceIntents.deleteSeriesInTile(chartTileId, snapshotItem.id, runtime.chart);
          })
        );
        left.appendChild(indicatorControls);
        row.appendChild(left);
        if (isFirstIndicatorRow && isDedicatedIndicatorPane) row.appendChild(paneControls);
        row.onmouseenter = () => {
          indicatorControls.style.opacity = "1";
          indicatorControls.style.pointerEvents = "auto";
        };
        row.onmouseleave = () => {
          indicatorControls.style.opacity = "0";
          indicatorControls.style.pointerEvents = "none";
        };
        overlay.appendChild(row);
      }
    }
  }

  for (const [paneId, overlay] of indicatorOverlayByPaneId) {
    if (paneHostByPaneId.has(paneId)) continue;
    overlay.remove();
    indicatorOverlayByPaneId.delete(paneId);
  }
};

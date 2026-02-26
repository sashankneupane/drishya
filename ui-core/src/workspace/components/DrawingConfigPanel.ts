import { makeSvgIcon } from "../icons.js";
import type { DrawingConfig } from "../../wasm/contracts.js";
import type { DrishyaChartClient } from "../../wasm/client.js";

function toHexColor(s: string): string {
  const t = s.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(t)) return t;
  if (/^#[0-9a-fA-F]{3}$/.test(t)) {
    const r = t[1] + t[1], g = t[2] + t[2], b = t[3] + t[3];
    return `#${r}${g}${b}`;
  }
  return "#000000";
}

function hexToRgba(hex: string, alpha: number): string {
  const h = toHexColor(hex).slice(1);
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha))})`;
}

function drawStrokePreview(
  canvas: HTMLCanvasElement,
  color: string,
  width: number,
  style: "solid" | "dotted" | "dashed"
): void {
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const w = canvas.clientWidth || 80;
  const h = Math.max(16, Math.ceil(width * 3));
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  const cy = h / 2;
  ctx.strokeStyle = toHexColor(color);
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  if (style === "dotted") {
    ctx.setLineDash([2, 2]);
  } else if (style === "dashed") {
    ctx.setLineDash([6, 3]);
  } else {
    ctx.setLineDash([]);
  }
  ctx.beginPath();
  ctx.moveTo(4, cy);
  ctx.lineTo(w - 4, cy);
  ctx.stroke();
}

function createColorField(
  label: string,
  value: string,
  onChange: (v: string) => void
): HTMLElement {
  const row = document.createElement("div");
  row.className = "flex items-center gap-3 py-2";
  row.dataset.colorField = "true";

  const lbl = document.createElement("label");
  lbl.className = "text-xs text-zinc-500 w-24 shrink-0";
  lbl.textContent = label;

  const textInput = document.createElement("input");
  textInput.type = "text";
  textInput.value = value;
  textInput.className = "flex-1 h-8 px-3 bg-zinc-900 border border-workspace-border rounded text-sm text-zinc-100 outline-none focus:border-zinc-600";
  textInput.placeholder = "#000000";

  const colorPicker = document.createElement("input");
  colorPicker.type = "color";
  colorPicker.value = toHexColor(value);
  colorPicker.className = "w-8 h-8 rounded border border-workspace-border shrink-0 cursor-pointer p-0 bg-transparent [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded [&::-webkit-color-swatch]:border-none";

  const syncFromText = () => {
    const v = textInput.value.trim() || "#000000";
    onChange(v);
    const hex = toHexColor(v);
    if (colorPicker.value !== hex) colorPicker.value = hex;
  };
  const syncFromPicker = () => {
    const v = colorPicker.value;
    textInput.value = v;
    onChange(v);
  };

  textInput.addEventListener("input", syncFromText);
  colorPicker.addEventListener("input", syncFromPicker);
  syncFromText();

  row.append(lbl, textInput, colorPicker);
  return row;
}

function openDrawingConfigModal(
  options: {
    chart: DrishyaChartClient;
    drawingId: number;
    config: DrawingConfig;
    supportsFill: boolean;
    onApply: () => void;
    onClose: () => void;
  }
): void {
  let strokeColor = options.config.stroke_color ?? "#ffffff";
  let strokeWidth = options.config.stroke_width ?? 1;
  let strokeType = (options.config.stroke_type ?? "solid") as "solid" | "dotted" | "dashed";
  let fillColor = options.config.fill_color ?? "#ffffff";
  let fillOpacity = options.config.fill_opacity ?? 0.25;
  let fillTransparent = options.config.fill_color === null || options.config.fill_color === undefined;
  let locked = options.config.locked;

  const backdrop = document.createElement("div");
  backdrop.className = "fixed inset-0 bg-black/40 z-[100] flex items-center justify-center animate-in fade-in duration-200";

  const modal = document.createElement("div");
  modal.className = "w-[360px] bg-zinc-950 border border-workspace-border flex flex-col shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden";

  const header = document.createElement("div");
  header.className = "p-4 border-b border-workspace-border flex items-center justify-between bg-zinc-900/20";

  const title = document.createElement("span");
  title.className = "text-sm font-semibold text-zinc-100";
  title.textContent = "Drawing style";

  const closeBtn = document.createElement("button");
  closeBtn.className = "p-1 text-zinc-500 hover:text-white transition-colors border-none outline-none bg-transparent cursor-pointer";
  closeBtn.appendChild(makeSvgIcon("close", "h-4 w-4"));
  closeBtn.onclick = () => destroy();

  header.append(title, closeBtn);

  const body = document.createElement("div");
  body.className = "p-4 flex flex-col gap-1";

  const strokeWidthRow = document.createElement("div");
  strokeWidthRow.className = "flex items-center gap-3 py-2";
  const strokeWidthLabel = document.createElement("label");
  strokeWidthLabel.className = "text-xs text-zinc-500 w-24 shrink-0";
  strokeWidthLabel.textContent = "Stroke width";
  const strokeWidthWrap = document.createElement("div");
  strokeWidthWrap.className = "flex-1 flex items-center gap-2 min-w-0";
  const strokeWidthSlider = document.createElement("input");
  strokeWidthSlider.type = "range";
  strokeWidthSlider.min = "0.5";
  strokeWidthSlider.max = "10";
  strokeWidthSlider.step = "0.5";
  strokeWidthSlider.value = String(strokeWidth);
  strokeWidthSlider.className = "flex-1 max-w-[90px] min-w-0 h-1.5 bg-zinc-800 rounded appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-2 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-zinc-400";
  const strokeWidthValue = document.createElement("span");
  strokeWidthValue.className = "text-xs text-zinc-500 w-8 shrink-0 text-right";
  strokeWidthValue.textContent = String(strokeWidth);
  const strokeWidthPreview = document.createElement("canvas");
  strokeWidthPreview.className = "h-5 w-12 shrink-0 rounded border border-workspace-border bg-zinc-900";
  const onStrokeWidthChange = () => {
    const v = parseFloat(strokeWidthSlider.value);
    if (!Number.isNaN(v)) strokeWidth = Math.max(0.5, Math.min(10, v));
    strokeWidthValue.textContent = String(strokeWidth);
    updateAllPreviews();
  };
  strokeWidthSlider.addEventListener("input", onStrokeWidthChange);
  strokeWidthWrap.append(strokeWidthSlider, strokeWidthValue, strokeWidthPreview);
  strokeWidthRow.append(strokeWidthLabel, strokeWidthWrap);
  body.appendChild(strokeWidthRow);

  const strokeTypeRow = document.createElement("div");
  strokeTypeRow.className = "flex items-start gap-3 py-2";
  const strokeTypeLabel = document.createElement("label");
  strokeTypeLabel.className = "text-xs text-zinc-500 w-24 shrink-0 pt-1";
  strokeTypeLabel.textContent = "Stroke type";
  const strokeTypePreviews = document.createElement("div");
  strokeTypePreviews.className = "flex-1 flex gap-2";
  const strokeTypeCanvas: Record<"solid" | "dotted" | "dashed", HTMLCanvasElement> = {} as any;
  const strokeTypeBtn: Record<"solid" | "dotted" | "dashed", HTMLButtonElement> = {} as any;
  const strokeTypeBaseClass = "flex-1 min-w-0 h-10 rounded border border-workspace-border cursor-pointer overflow-hidden bg-zinc-900 transition-all";
  for (const opt of ["solid", "dotted", "dashed"] as const) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = strokeTypeBaseClass;
    const canvas = document.createElement("canvas");
    canvas.className = "w-full h-full block";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    btn.appendChild(canvas);
    strokeTypeCanvas[opt] = canvas;
    strokeTypeBtn[opt] = btn;
    btn.onclick = () => {
      strokeType = opt;
      updateStrokeTypeSelection();
      updateAllPreviews();
    };
    strokeTypePreviews.appendChild(btn);
  }
  const updateStrokeTypeSelection = () => {
    for (const opt of ["solid", "dotted", "dashed"] as const) {
      const btn = strokeTypeBtn[opt];
      if (strokeType === opt) {
        btn.classList.add("border-zinc-400", "ring-1", "ring-zinc-400");
        btn.classList.remove("border-workspace-border");
      } else {
        btn.classList.remove("border-zinc-400", "ring-1", "ring-zinc-400");
        btn.classList.add("border-workspace-border");
      }
    }
  };
  strokeTypeRow.append(strokeTypeLabel, strokeTypePreviews);
  body.appendChild(strokeTypeRow);

  const updateAllPreviews = () => {
    drawStrokePreview(strokeWidthPreview, strokeColor, strokeWidth, strokeType);
    for (const opt of ["solid", "dotted", "dashed"] as const) {
      drawStrokePreview(strokeTypeCanvas[opt], strokeColor, strokeWidth, opt);
    }
  };

  const strokeColorRow = createColorField("Stroke", strokeColor, (v) => {
    strokeColor = v;
    updateAllPreviews();
  });
  body.insertBefore(strokeColorRow, strokeWidthRow);

  if (options.supportsFill) {
    const fillRow = document.createElement("div");
    fillRow.className = "flex flex-col gap-2 py-2";
    fillRow.dataset.colorField = "true";

    const fillHeader = document.createElement("div");
    fillHeader.className = "flex items-center gap-3";
    const fillLabel = document.createElement("label");
    fillLabel.className = "text-xs text-zinc-500 w-24 shrink-0";
    fillLabel.textContent = "Fill";
    const transparentCheck = document.createElement("input");
    transparentCheck.type = "checkbox";
    transparentCheck.checked = fillTransparent;
    transparentCheck.className = "h-4 w-4 rounded border-workspace-border";
    const transparentLabel = document.createElement("label");
    transparentLabel.className = "text-xs text-zinc-500 cursor-pointer";
    transparentLabel.textContent = "Transparent";
    transparentLabel.onclick = () => transparentCheck.click();
    fillHeader.append(fillLabel, transparentCheck, transparentLabel);

    const fillControls = document.createElement("div");
    fillControls.className = "flex items-center gap-3 pl-24";
    const fillSwatchWrap = document.createElement("div");
    fillSwatchWrap.className = "relative w-8 h-8 shrink-0 cursor-pointer";
    const fillPreviewSwatchEl = document.createElement("div");
    fillPreviewSwatchEl.className = "w-8 h-8 rounded border border-workspace-border pointer-events-none";
    const fillColorPicker = document.createElement("input");
    fillColorPicker.type = "color";
    fillColorPicker.value = toHexColor(fillColor);
    fillColorPicker.className = "absolute inset-0 w-full h-full opacity-0 cursor-pointer";
    fillSwatchWrap.appendChild(fillPreviewSwatchEl);
    fillSwatchWrap.appendChild(fillColorPicker);
    const textInput = document.createElement("input");
    textInput.type = "text";
    textInput.value = fillColor;
    textInput.className = "flex-1 min-w-0 h-8 px-3 bg-zinc-900 border border-workspace-border rounded text-sm text-zinc-100 outline-none focus:border-zinc-600";
    textInput.placeholder = "#000000";

    const setFillDisabled = (disabled: boolean) => {
      textInput.disabled = disabled;
      fillColorPicker.disabled = disabled;
      fillSwatchWrap.classList.toggle("opacity-50", disabled);
      fillSwatchWrap.style.pointerEvents = disabled ? "none" : "";
    };
    const updateFillPreview = () => {
      if (fillTransparent) {
        fillPreviewSwatchEl.style.background =
          "linear-gradient(45deg,#3f3f46 25%,transparent 25%),linear-gradient(-45deg,#3f3f46 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#3f3f46 75%),linear-gradient(-45deg,transparent 75%,#3f3f46 75%)";
        fillPreviewSwatchEl.style.backgroundSize = "6px 6px";
        fillPreviewSwatchEl.style.backgroundPosition = "0 0,0 3px,3px -3px,-3px 0";
        fillPreviewSwatchEl.style.backgroundColor = "#18181b";
      } else {
        fillPreviewSwatchEl.style.background = "";
        fillPreviewSwatchEl.style.backgroundSize = "";
        fillPreviewSwatchEl.style.backgroundPosition = "";
        fillPreviewSwatchEl.style.backgroundColor = hexToRgba(fillColor, fillOpacity);
      }
    };
    setFillDisabled(fillTransparent);
    updateFillPreview();

    transparentCheck.onchange = () => {
      fillTransparent = transparentCheck.checked;
      setFillDisabled(fillTransparent);
      updateFillPreview();
    };

    textInput.addEventListener("input", () => {
      fillColor = textInput.value.trim() || "#000000";
      fillColorPicker.value = toHexColor(fillColor);
      updateFillPreview();
    });
    fillColorPicker.addEventListener("input", () => {
      fillColor = fillColorPicker.value;
      textInput.value = fillColor;
      updateFillPreview();
    });

    fillControls.append(fillSwatchWrap, textInput);
    fillRow.append(fillHeader, fillControls);
    body.appendChild(fillRow);

    const fillOpacityRow = document.createElement("div");
    fillOpacityRow.className = "flex items-center gap-3 py-2";
    const fillOpacityLabel = document.createElement("label");
    fillOpacityLabel.className = "text-xs text-zinc-500 w-24 shrink-0";
    fillOpacityLabel.textContent = "Fill opacity";
    const fillOpacitySlider = document.createElement("input");
    fillOpacitySlider.type = "range";
    fillOpacitySlider.min = "0";
    fillOpacitySlider.max = "100";
    fillOpacitySlider.value = String(Math.round((fillOpacity ?? 0.25) * 100));
    fillOpacitySlider.className = "flex-1 min-w-0 h-1.5 bg-zinc-800 rounded appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-2 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-zinc-400";
    const fillOpacityValue = document.createElement("span");
    fillOpacityValue.className = "text-xs text-zinc-500 w-10 text-right";
    fillOpacityValue.textContent = `${Math.round((fillOpacity ?? 0.25) * 100)}%`;
    fillOpacitySlider.oninput = () => {
      const pct = parseInt(fillOpacitySlider.value, 10) / 100;
      fillOpacity = pct;
      fillOpacityValue.textContent = `${Math.round(pct * 100)}%`;
      updateFillPreview();
    };
    fillOpacityRow.append(fillOpacityLabel, fillOpacitySlider, fillOpacityValue);
    body.appendChild(fillOpacityRow);
  }

  const lockRow = document.createElement("div");
  lockRow.className = "flex items-center gap-3 py-2";
  const lockLabel = document.createElement("label");
  lockLabel.className = "text-xs text-zinc-500 w-24 shrink-0";
  lockLabel.textContent = "Lock";
  const lockCheck = document.createElement("input");
  lockCheck.type = "checkbox";
  lockCheck.checked = locked;
  lockCheck.className = "h-4 w-4 rounded border-workspace-border";
  lockCheck.onchange = () => { locked = lockCheck.checked; };
  lockRow.append(lockLabel, lockCheck);
  body.appendChild(lockRow);

  const footer = document.createElement("div");
  footer.className = "p-4 border-t border-workspace-border flex items-center justify-end gap-2 bg-zinc-900/20";

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "h-8 px-3 text-xs font-medium text-zinc-500 hover:text-zinc-100 transition-colors border border-workspace-border rounded hover:bg-zinc-900";
  cancelBtn.textContent = "Cancel";
  cancelBtn.onclick = () => destroy();

  const applyBtn = document.createElement("button");
  applyBtn.className = "h-8 px-4 text-xs font-medium text-white bg-zinc-700 hover:bg-zinc-600 rounded transition-colors";
  applyBtn.textContent = "Apply";
  applyBtn.onclick = () => {
    options.chart.setDrawingConfig(options.drawingId, {
      stroke_color: strokeColor,
      stroke_width: strokeWidth,
      stroke_type: strokeType,
      fill_color: options.supportsFill
        ? (fillTransparent ? null : fillColor)
        : undefined,
      fill_opacity: options.supportsFill && !fillTransparent ? fillOpacity : undefined,
      locked
    });
    options.onApply();
    destroy();
  };

  footer.append(cancelBtn, applyBtn);
  modal.append(header, body, footer);
  backdrop.appendChild(modal);

  const destroy = () => {
    backdrop.remove();
    options.onClose();
  };

  backdrop.onclick = (e) => {
    if (e.target === backdrop) destroy();
  };

  // Initial previews (after modal DOM is mounted for canvas sizing)
  document.body.appendChild(backdrop);
  requestAnimationFrame(() => {
    updateStrokeTypeSelection();
    updateAllPreviews();
  });
}

export interface DrawingConfigPanelOptions {
  chart: DrishyaChartClient;
  drawingId: number;
  config: DrawingConfig;
  onMutate: () => void;
  onClose: () => void;
}

export function createDrawingConfigPanel(options: DrawingConfigPanelOptions): HTMLElement {
  const { chart, drawingId, config, onMutate, onClose } = options;

  let strokeColor = config.stroke_color ?? "#ffffff";
  let strokeWidth = config.stroke_width ?? 1;
  let strokeType = (config.stroke_type ?? "solid") as "solid" | "dotted" | "dashed";
  let fillColor = config.fill_color ?? "#ffffff";
  let fillOpacity = config.fill_opacity ?? 0.25;
  let fillTransparent = config.fill_color === null || config.fill_color === undefined;
  let locked = config.locked;
  const supportsFill = config.supports_fill;

  const updateFillSwatch = () => {
    if (!fillSwatch) return;
    if (fillTransparent || fillColor === null) {
      fillSwatch.style.background =
        "linear-gradient(45deg,#3f3f46 25%,transparent 25%),linear-gradient(-45deg,#3f3f46 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#3f3f46 75%),linear-gradient(-45deg,transparent 75%,#3f3f46 75%)";
      fillSwatch.style.backgroundSize = "6px 6px";
      fillSwatch.style.backgroundPosition = "0 0,0 3px,3px -3px,-3px 0";
      fillSwatch.style.backgroundColor = "#18181b";
    } else {
      fillSwatch.style.background = "";
      fillSwatch.style.backgroundSize = "";
      fillSwatch.style.backgroundPosition = "";
      fillSwatch.style.backgroundColor = fillColor;
    }
  };

  const syncFromConfig = (c: DrawingConfig) => {
    strokeColor = c.stroke_color ?? "#ffffff";
    strokeWidth = c.stroke_width ?? 1;
    strokeType = (c.stroke_type ?? "solid") as "solid" | "dotted" | "dashed";
    fillColor = c.fill_color ?? "#ffffff";
    fillOpacity = c.fill_opacity ?? 0.25;
    fillTransparent = c.fill_color === null || c.fill_color === undefined;
    locked = c.locked;
    strokeSwatch.style.backgroundColor = strokeColor;
    updateFillSwatch();
    lockBtn.title = locked ? "Unlock" : "Lock";
    const lockIconEl = lockBtn.querySelector("svg");
    if (lockIconEl) lockIconEl.replaceWith(makeSvgIcon(locked ? "lock" : "lock-open", "h-4 w-4"));
  };

  const BTN_BASE =
    "h-10 flex items-center justify-center px-3 transition-all cursor-pointer border-none outline-none bg-transparent border-r border-workspace-border last:border-r-0";
  const BTN_IDLE = "text-zinc-500 hover:text-zinc-100 hover:bg-zinc-900/50";

  const strip = document.createElement("div");
  strip.className =
    "absolute top-12 right-12 h-10 flex flex-row items-stretch overflow-hidden z-50 pointer-events-auto select-none bg-workspace-bg border border-workspace-border rounded shadow-2xl";

  const dragHandle = document.createElement("div");
  dragHandle.className =
    "flex items-center justify-center px-2 cursor-grab active:cursor-grabbing border-r border-workspace-border text-zinc-500 hover:text-zinc-100 hover:bg-zinc-900/50";
  dragHandle.appendChild(makeSvgIcon("grip-horizontal", "h-4 w-4"));
  dragHandle.title = "Drag to move";

  let dragStartX = 0;
  let dragStartY = 0;
  let stripStartLeft = 0;
  let stripStartTop = 0;

  const onDragMove = (e: MouseEvent) => {
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    stripStartLeft += dx;
    stripStartTop += dy;
    strip.style.left = `${stripStartLeft}px`;
    strip.style.top = `${stripStartTop}px`;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
  };

  const onDragEnd = () => {
    window.removeEventListener("mousemove", onDragMove);
    window.removeEventListener("mouseup", onDragEnd);
  };

  dragHandle.onmousedown = (e) => {
    e.preventDefault();
    const rect = strip.getBoundingClientRect();
    const parent = strip.parentElement?.getBoundingClientRect();
    stripStartLeft = parent ? rect.left - parent.left : rect.left;
    stripStartTop = parent ? rect.top - parent.top : rect.top;
    strip.style.left = `${stripStartLeft}px`;
    strip.style.top = `${stripStartTop}px`;
    strip.style.right = "auto";
    strip.style.bottom = "auto";
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    window.addEventListener("mousemove", onDragMove);
    window.addEventListener("mouseup", onDragEnd);
  };

  const strokeCell = document.createElement("button");
  strokeCell.type = "button";
  strokeCell.className = `${BTN_BASE} ${BTN_IDLE} flex flex-row items-center gap-2`;
  strokeCell.title = "Stroke color";

  const strokeSwatch = document.createElement("div");
  strokeSwatch.className = "w-4 h-4 rounded border border-workspace-border shrink-0";
  strokeSwatch.style.backgroundColor = strokeColor;

  const strokeLabel = document.createElement("span");
  strokeLabel.className = "text-[11px] text-zinc-500";
  strokeLabel.textContent = "Stroke";

  strokeCell.append(strokeSwatch, strokeLabel);
  strokeCell.onclick = () => {
    openDrawingConfigModal({
      chart,
      drawingId,
      config: {
        stroke_color: strokeColor,
        fill_color: fillTransparent ? null : fillColor,
        fill_opacity: supportsFill ? fillOpacity : null,
        stroke_width: strokeWidth,
        stroke_type: strokeType,
        locked,
        supports_fill: supportsFill
      },
      supportsFill,
      onApply: () => {
        const c = chart.getSelectedDrawingConfig();
        if (c) syncFromConfig(c);
        onMutate();
      },
      onClose: () => {}
    });
  };

  let fillCell: HTMLButtonElement | null = null;
  let fillSwatch: HTMLElement | null = null;

  if (supportsFill) {
    fillCell = document.createElement("button");
    fillCell.type = "button";
    fillCell.className = `${BTN_BASE} ${BTN_IDLE} flex flex-row items-center gap-2`;
    fillCell.title = "Fill color";

    fillSwatch = document.createElement("div");
    fillSwatch.className = "w-4 h-4 rounded border border-workspace-border shrink-0";
    updateFillSwatch();

    const fillLabel = document.createElement("span");
    fillLabel.className = "text-[11px] text-zinc-500";
    fillLabel.textContent = "Fill";

    fillCell.append(fillSwatch, fillLabel);
    fillCell.onclick = () => {
      openDrawingConfigModal({
        chart,
        drawingId,
        config: {
          stroke_color: strokeColor,
          fill_color: fillTransparent ? null : fillColor,
          fill_opacity: fillOpacity,
          stroke_width: strokeWidth,
          stroke_type: strokeType,
          locked,
          supports_fill: supportsFill
        },
        supportsFill,
        onApply: () => {
          const c = chart.getSelectedDrawingConfig();
          if (c) syncFromConfig(c);
          onMutate();
        },
        onClose: () => {}
      });
    };
  }

  const lockBtn = document.createElement("button");
  lockBtn.type = "button";
  lockBtn.className = `${BTN_BASE} ${BTN_IDLE}`;
  lockBtn.title = locked ? "Unlock" : "Lock";
  lockBtn.appendChild(makeSvgIcon(locked ? "lock" : "lock-open", "h-4 w-4"));
  lockBtn.onclick = () => {
    locked = !locked;
    chart.setDrawingConfig(drawingId, {
      stroke_color: strokeColor,
      stroke_width: strokeWidth,
      stroke_type: strokeType,
      fill_color: supportsFill ? (fillTransparent ? null : fillColor) : undefined,
      fill_opacity: supportsFill && !fillTransparent ? fillOpacity : undefined,
      locked
    });
    lockBtn.title = locked ? "Unlock" : "Lock";
    const icon = lockBtn.querySelector("svg");
    if (icon) icon.replaceWith(makeSvgIcon(locked ? "lock" : "lock-open", "h-4 w-4"));
    onMutate();
  };

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className =
    "h-10 flex items-center justify-center px-3 transition-all cursor-pointer border-none outline-none bg-transparent border-r border-workspace-border text-red-400 hover:text-red-300 hover:bg-zinc-900/50";
  deleteBtn.title = "Delete drawing";
  deleteBtn.appendChild(makeSvgIcon("trash", "h-4 w-4"));
  deleteBtn.onclick = () => {
    chart.deleteSelectedDrawing();
    onClose();
    onMutate();
  };

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = `${BTN_BASE} ${BTN_IDLE}`;
  closeBtn.title = "Close";
  closeBtn.appendChild(makeSvgIcon("close", "h-4 w-4"));
  closeBtn.onclick = onClose;

  strip.append(dragHandle, strokeCell);
  if (fillCell) strip.appendChild(fillCell);
  strip.append(lockBtn, deleteBtn, closeBtn);

  return strip;
}

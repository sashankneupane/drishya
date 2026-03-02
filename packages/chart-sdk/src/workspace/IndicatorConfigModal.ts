import { makeSvgIcon } from "./icons.js";
import type {
  DiscoveredIndicator,
  SeriesStyleOverride,
  SeriesStyleSnapshot,
} from "../wasm/contracts.js";

interface IndicatorConfigModalOptions {
  indicatorId: string;
  indicatorName: string;
  indicatorCatalogEntry?: DiscoveredIndicator | null;
  initialParams?: Record<string, string | number | boolean>;
  styleSeries?: SeriesStyleSnapshot[];
  onApplyParams?: (params: Record<string, string | number | boolean>) => void;
  onApplySeriesStyle?: (seriesId: string, style: SeriesStyleOverride) => void;
  onResetSeriesStyle?: (seriesId: string) => void;
  onClose?: () => void;
}

function toHexColor(s: string): string {
  const t = String(s || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(t)) return t;
  if (/^#[0-9a-fA-F]{3}$/.test(t)) {
    return `#${t[1]}${t[1]}${t[2]}${t[2]}${t[3]}${t[3]}`;
  }
  return "#000000";
}

function createColorField(
  label: string,
  value: string,
  onChange: (v: string) => void
): HTMLElement {
  const row = document.createElement("div");
  row.className = "flex items-center gap-3 py-1";

  const lbl = document.createElement("label");
  lbl.className = "text-xs text-zinc-500 w-24 shrink-0";
  lbl.textContent = label;

  const textInput = document.createElement("input");
  textInput.type = "text";
  textInput.value = value;
  textInput.className = "flex-1 h-8 px-2 bg-zinc-900 border border-zinc-700 text-xs text-zinc-100 outline-none";

  const colorPicker = document.createElement("input");
  colorPicker.type = "color";
  colorPicker.value = toHexColor(value);
  colorPicker.className =
    "w-8 h-8 border border-zinc-700 shrink-0 cursor-pointer p-0 bg-transparent [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-none";

  textInput.oninput = () => {
    const next = textInput.value.trim() || "#000000";
    onChange(next);
    colorPicker.value = toHexColor(next);
  };
  colorPicker.oninput = () => {
    textInput.value = colorPicker.value;
    onChange(colorPicker.value);
  };

  row.append(lbl, textInput, colorPicker);
  return row;
}

export function createIndicatorConfigModal(options: IndicatorConfigModalOptions): { destroy: () => void } {
  const backdrop = document.createElement("div");
  backdrop.className = "fixed inset-0 bg-black/40 z-[120] flex items-center justify-center animate-in fade-in duration-150";

  const modal = document.createElement("div");
  modal.className = "w-[520px] max-w-[calc(100vw-24px)] bg-zinc-950 border border-zinc-800 shadow-2xl";

  const header = document.createElement("div");
  header.className = "h-10 px-3 border-b border-zinc-800 flex items-center justify-between";

  const title = document.createElement("div");
  title.className = "text-[12px] font-semibold text-zinc-100 tracking-wide";
  title.textContent = `${options.indicatorName} Settings`;

  const closeBtn = document.createElement("button");
  closeBtn.className = "h-7 w-7 inline-flex items-center justify-center border-none bg-transparent text-zinc-500 hover:text-zinc-100 cursor-pointer";
  closeBtn.appendChild(makeSvgIcon("close", "h-4 w-4"));

  const body = document.createElement("div");
  body.className = "px-4 py-4 text-[12px] text-zinc-300 space-y-4 max-h-[72vh] overflow-y-auto";

  const idRow = document.createElement("div");
  idRow.className = "text-zinc-400";
  idRow.textContent = `Indicator: ${options.indicatorId}`;
  body.appendChild(idRow);

  const paramsSection = document.createElement("section");
  const paramsTitle = document.createElement("div");
  paramsTitle.className = "text-[11px] uppercase tracking-wide text-zinc-500 mb-2";
  paramsTitle.textContent = "Parameters";
  paramsSection.appendChild(paramsTitle);
  const paramInputs = new Map<string, HTMLInputElement | HTMLSelectElement>();
  const dirtyParams = new Set<string>();
  const catalog = options.indicatorCatalogEntry ?? null;
  const params = catalog?.params ?? [];
  for (const param of params) {
    const row = document.createElement("label");
    row.className = "flex items-center justify-between gap-3 py-1";
    const left = document.createElement("span");
    left.className = "text-zinc-300";
    left.textContent = param.name;
    row.appendChild(left);

    const initial = options.initialParams?.[param.name];
    const kind = String(param.kind || "").toLowerCase();
      if (param.name.toLowerCase() === "source") {
        const select = document.createElement("select");
      select.className = "w-44 h-8 px-2 bg-zinc-900 border border-zinc-700 text-zinc-100 text-[12px] outline-none";
      ["close", "open", "high", "low", "hl2", "hlc3", "ohlc4", "volume"].forEach((source) => {
        const opt = document.createElement("option");
        opt.value = source;
        opt.textContent = source.toUpperCase();
        select.appendChild(opt);
      });
      const v = String(initial ?? "close").toLowerCase();
      if (Array.from(select.options).some((o) => o.value === v)) {
        select.value = v;
      }
      row.appendChild(select);
      select.addEventListener("change", () => {
        dirtyParams.add(param.name);
      });
      paramInputs.set(param.name, select);
    } else if (kind === "boolean" || kind === "bool") {
      const input = document.createElement("input");
      input.type = "checkbox";
      input.className = "h-4 w-4 accent-zinc-200";
      input.checked = initial === true || String(initial) === "true";
      row.appendChild(input);
      input.addEventListener("change", () => {
        dirtyParams.add(param.name);
      });
      paramInputs.set(param.name, input);
    } else {
      const input = document.createElement("input");
      input.type = kind === "integer" || kind === "int" || kind === "float" || kind === "number" ? "number" : "text";
      input.className = "w-44 h-8 px-2 bg-zinc-900 border border-zinc-700 text-zinc-100 text-[12px] outline-none";
      if (initial != null) input.value = String(initial);
      row.appendChild(input);
      input.addEventListener("input", () => {
        dirtyParams.add(param.name);
      });
      paramInputs.set(param.name, input);
    }
    paramsSection.appendChild(row);
  }
  if (!params.length) {
    const empty = document.createElement("div");
    empty.className = "text-zinc-500";
    empty.textContent = "No editable runtime parameters for this indicator.";
    paramsSection.appendChild(empty);
  }
  body.appendChild(paramsSection);

  const stylesSection = document.createElement("section");
  const stylesTitle = document.createElement("div");
  stylesTitle.className = "text-[11px] uppercase tracking-wide text-zinc-500 mb-2";
  stylesTitle.textContent = "Styles";
  stylesSection.appendChild(stylesTitle);

  const styleDraft = new Map<string, SeriesStyleOverride>();
  const styleSeries = Array.from(
    new Map((options.styleSeries ?? []).map((item) => [item.series_id, item])).values()
  );
  if (!styleSeries.length) {
    const empty = document.createElement("div");
    empty.className = "text-zinc-500";
    empty.textContent = "No series style controls found for this indicator.";
    stylesSection.appendChild(empty);
  } else {
    const nameCount = new Map<string, number>();
    for (const item of styleSeries) {
      const card = document.createElement("div");
      card.className = "mb-3 p-3 border border-zinc-800 bg-zinc-900/40";
      const heading = document.createElement("div");
      heading.className = "text-zinc-200 text-[12px] mb-2 flex items-center justify-between";
      const baseName = item.series_name || options.indicatorName;
      const nextCount = (nameCount.get(baseName) ?? 0) + 1;
      nameCount.set(baseName, nextCount);
      heading.textContent = nextCount > 1 ? `${baseName} ${nextCount}` : baseName;

      const resetBtn = document.createElement("button");
      resetBtn.className = "h-6 px-2 border border-zinc-700 bg-transparent text-zinc-400 text-[11px] cursor-pointer";
      resetBtn.textContent = "Reset";
      resetBtn.onclick = () => {
        styleDraft.set(item.series_id, {});
        options.onResetSeriesStyle?.(item.series_id);
      };
      heading.appendChild(resetBtn);
      card.appendChild(heading);

      const draft: SeriesStyleOverride = {};
      styleDraft.set(item.series_id, draft);

      if (item.primitive_types.includes("line")) {
        card.appendChild(createColorField("Stroke", item.stroke_color ?? "#94a3b8", (v) => (draft.stroke_color = v)));

        const widthRow = document.createElement("div");
        widthRow.className = "flex items-center gap-3 py-1";
        widthRow.innerHTML = `<label class="text-xs text-zinc-500 w-24 shrink-0">Width</label>`;
        const width = document.createElement("input");
        width.type = "range";
        width.min = "0.5";
        width.max = "8";
        width.step = "0.5";
        width.value = String(item.stroke_width ?? 1.5);
        width.className = "flex-1 h-1.5 bg-zinc-800";
        const widthValue = document.createElement("span");
        widthValue.className = "text-xs text-zinc-500 w-8";
        widthValue.textContent = width.value;
        width.oninput = () => {
          widthValue.textContent = width.value;
          draft.stroke_width = Number(width.value);
        };
        widthRow.append(width, widthValue);
        card.appendChild(widthRow);

        const patternRow = document.createElement("div");
        patternRow.className = "flex items-center gap-3 py-1";
        patternRow.innerHTML = `<label class="text-xs text-zinc-500 w-24 shrink-0">Pattern</label>`;
        const patternWrap = document.createElement("div");
        patternWrap.className = "flex gap-2";
        const currentRaw = String(item.stroke_pattern ?? "solid");
        const currentPattern: "solid" | "dashed" | "dotted" =
          currentRaw === "dashed" || currentRaw === "dotted" ? (currentRaw as any) : "solid";
        let selected: "solid" | "dashed" | "dotted" = currentPattern;
        const mkBtn = (kind: "solid" | "dashed" | "dotted") => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "h-8 w-16 border border-zinc-700 bg-zinc-900 text-zinc-300 text-[11px] cursor-pointer";
          const canvas = document.createElement("canvas");
          canvas.width = 56;
          canvas.height = 18;
          canvas.className = "w-14 h-4";
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.clearRect(0, 0, 56, 18);
            ctx.strokeStyle = toHexColor(item.stroke_color ?? "#94a3b8");
            ctx.lineWidth = Math.max(1, Number(item.stroke_width ?? 1.5));
            if (kind === "dashed") ctx.setLineDash([6, 3]);
            if (kind === "dotted") ctx.setLineDash([2, 2]);
            ctx.beginPath();
            ctx.moveTo(4, 9);
            ctx.lineTo(52, 9);
            ctx.stroke();
          }
          btn.appendChild(canvas);
          const sync = () => {
            if (selected === kind) {
              btn.classList.add("ring-1", "ring-zinc-300", "border-zinc-300");
            } else {
              btn.classList.remove("ring-1", "ring-zinc-300", "border-zinc-300");
            }
          };
          btn.onclick = () => {
            selected = kind;
            draft.stroke_pattern = kind;
            sync();
            otherSync();
          };
          let otherSync = () => {};
          return { btn, sync, setOtherSync: (fn: () => void) => (otherSync = fn) };
        };
        const solid = mkBtn("solid");
        const dashed = mkBtn("dashed");
        const dotted = mkBtn("dotted");
        solid.setOtherSync(dashed.sync);
        dashed.setOtherSync(() => {
          solid.sync();
          dotted.sync();
        });
        dotted.setOtherSync(() => {
          solid.sync();
          dashed.sync();
        });
        solid.sync();
        dashed.sync();
        dotted.sync();
        patternWrap.append(solid.btn, dashed.btn, dotted.btn);
        patternRow.appendChild(patternWrap);
        card.appendChild(patternRow);
      }

      if (item.primitive_types.includes("band_fill")) {
        card.appendChild(createColorField("Fill", item.fill_color ?? "#22d3ee", (v) => (draft.fill_color = v)));
        const opacityRow = document.createElement("div");
        opacityRow.className = "flex items-center gap-3 py-1";
        opacityRow.innerHTML = `<label class="text-xs text-zinc-500 w-24 shrink-0">Opacity</label>`;
        const opacity = document.createElement("input");
        opacity.type = "range";
        opacity.min = "0";
        opacity.max = "1";
        opacity.step = "0.01";
        opacity.value = String(item.fill_opacity ?? 0.2);
        opacity.className = "flex-1 h-1.5 bg-zinc-800";
        const opacityValue = document.createElement("span");
        opacityValue.className = "text-xs text-zinc-500 w-10";
        opacityValue.textContent = opacity.value;
        opacity.oninput = () => {
          opacityValue.textContent = opacity.value;
          draft.fill_opacity = Number(opacity.value);
        };
        opacityRow.append(opacity, opacityValue);
        card.appendChild(opacityRow);
      }

      if (item.primitive_types.includes("histogram")) {
        card.appendChild(
          createColorField("Hist +", item.histogram_positive_color ?? "#22c55e", (v) => (draft.histogram_positive_color = v))
        );
        card.appendChild(
          createColorField("Hist -", item.histogram_negative_color ?? "#ef4444", (v) => (draft.histogram_negative_color = v))
        );
      }

      if (item.primitive_types.includes("markers")) {
        card.appendChild(createColorField("Marker", item.marker_color ?? "#f59e0b", (v) => (draft.marker_color = v)));
      }
      stylesSection.appendChild(card);
    }
  }
  body.appendChild(stylesSection);

  const footer = document.createElement("div");
  footer.className = "p-3 border-t border-zinc-800 flex items-center justify-end gap-2";

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "h-8 px-3 bg-transparent border border-zinc-700 text-zinc-300 text-[12px] cursor-pointer";
  cancelBtn.textContent = "Cancel";
  cancelBtn.onclick = () => destroy();

  const applyBtn = document.createElement("button");
  applyBtn.className = "h-8 px-3 bg-zinc-100 border-none text-zinc-900 text-[12px] font-semibold cursor-pointer";
  applyBtn.textContent = "Apply";
  applyBtn.onclick = () => {
    const nextParams: Record<string, string | number | boolean> = {};
    const fallback = options.initialParams ?? {};
    for (const param of params) {
      const input = paramInputs.get(param.name);
      if (!input) continue;
      const kind = String(param.kind || "").toLowerCase();
      if (input instanceof HTMLInputElement && input.type === "checkbox") {
        nextParams[param.name] = input.checked;
      } else if (kind === "integer" || kind === "int") {
        const parsed = Number.parseInt((input as HTMLInputElement | HTMLSelectElement).value || "", 10);
        const fb = Number(fallback[param.name]);
        nextParams[param.name] = Number.isFinite(parsed) ? parsed : (Number.isFinite(fb) ? fb : 0);
      } else if (kind === "float" || kind === "number") {
        const parsed = Number.parseFloat((input as HTMLInputElement | HTMLSelectElement).value || "");
        const fb = Number(fallback[param.name]);
        nextParams[param.name] = Number.isFinite(parsed) ? parsed : (Number.isFinite(fb) ? fb : 0);
      } else {
        nextParams[param.name] = (input as HTMLInputElement | HTMLSelectElement).value;
      }
    }
    const initial = options.initialParams ?? {};
    if (dirtyParams.size > 0) {
      options.onApplyParams?.(nextParams);
    }

    for (const [seriesId, style] of styleDraft) {
      const hasValues = Object.values(style).some((v) => v !== undefined && v !== null && v !== "");
      if (hasValues) options.onApplySeriesStyle?.(seriesId, style);
    }
    destroy();
  };

  footer.append(cancelBtn, applyBtn);

  header.append(title, closeBtn);
  modal.append(header, body, footer);
  backdrop.appendChild(modal);

  const destroy = () => {
    backdrop.remove();
    window.removeEventListener("keydown", onKeyDown);
    options.onClose?.();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") destroy();
  };
  closeBtn.onclick = destroy;
  backdrop.onclick = (event) => {
    if (event.target === backdrop) destroy();
  };
  window.addEventListener("keydown", onKeyDown);
  document.body.appendChild(backdrop);

  return { destroy };
}

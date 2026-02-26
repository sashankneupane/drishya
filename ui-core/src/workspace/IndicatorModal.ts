import { makeSvgIcon } from "./icons.js";
import type { DrishyaChartClient } from "../wasm/client.js";

export interface IndicatorDef {
    id: string;
    name: string;
    description: string;
    apply: (chart: DrishyaChartClient) => void;
}

export const AVAILABLE_INDICATORS: IndicatorDef[] = [
    {
        id: "sma",
        name: "Simple Moving Average",
        description: "Rolling average of price (20 period)",
        apply: (chart) => chart.addSmaOverlay(20)
    },
    {
        id: "bb",
        name: "Bollinger Bands",
        description: "Volatility bands around price",
        apply: (chart) => chart.addBbandsOverlay(20, 2.0)
    },
    {
        id: "rsi",
        name: "Relative Strength Index",
        description: "Momentum oscillator for overbought/oversold",
        apply: (chart) => chart.addRsiPaneIndicator(14)
    },
    {
        id: "mom",
        name: "Momentum Histogram",
        description: "Histogram showing rate of change",
        apply: (chart) => chart.addMomentumHistogramOverlay()
    }
];

export interface IndicatorModalOptions {
    chart: DrishyaChartClient;
    onClose: () => void;
    onApply?: () => void;
}

export function createIndicatorModal(options: IndicatorModalOptions) {
    const backdrop = document.createElement("div");
    backdrop.className = "fixed inset-0 bg-black/40 z-[100] flex items-center justify-center animate-in fade-in duration-200";

    const modal = document.createElement("div");
    modal.className = "w-[500px] max-h-[600px] bg-zinc-950 border border-workspace-border flex flex-col shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden";

    const header = document.createElement("div");
    header.className = "p-4 border-b border-workspace-border flex items-center justify-between bg-zinc-900/20";

    const title = document.createElement("span");
    title.className = "text-sm font-semibold text-zinc-100";
    title.textContent = "Indicators";

    const closeBtn = document.createElement("button");
    closeBtn.className = "p-1 text-zinc-500 hover:text-white transition-colors border-none outline-none bg-transparent cursor-pointer";
    closeBtn.appendChild(makeSvgIcon("close", "h-4 w-4"));
    closeBtn.onclick = () => destroy();

    header.append(title, closeBtn);

    const searchContainer = document.createElement("div");
    searchContainer.className = "px-4 py-3 border-b border-workspace-border flex items-center gap-3";

    const searchIcon = makeSvgIcon("search", "h-4 w-4 text-zinc-600");
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Search indicators...";
    input.className = "flex-1 bg-transparent border-none outline-none text-sm text-zinc-100 placeholder:text-zinc-600";

    searchContainer.append(searchIcon, input);

    const list = document.createElement("div");
    list.className = "flex-1 overflow-y-auto py-2 no-scrollbar min-h-[300px]";

    const renderList = (filter: string) => {
        list.innerHTML = "";
        const filtered = AVAILABLE_INDICATORS.filter(ind =>
            ind.name.toLowerCase().includes(filter.toLowerCase()) ||
            ind.description.toLowerCase().includes(filter.toLowerCase())
        );

        if (filtered.length === 0) {
            const empty = document.createElement("div");
            empty.className = "px-4 py-8 text-center text-xs text-zinc-600 italic";
            empty.textContent = "No indicators found";
            list.appendChild(empty);
            return;
        }

        filtered.forEach(ind => {
            const row = document.createElement("button");
            row.className = "w-full px-4 py-3 flex flex-col gap-0.5 text-left hover:bg-zinc-900 transition-colors border-none outline-none bg-transparent cursor-pointer group";

            const name = document.createElement("span");
            name.className = "text-[13px] font-medium text-zinc-300 group-hover:text-white";
            name.textContent = ind.name;

            const desc = document.createElement("span");
            desc.className = "text-[11px] text-zinc-600 group-hover:text-zinc-400";
            desc.textContent = ind.description;

            row.append(name, desc);
            row.onclick = () => {
                console.log(`[IndicatorModal] Applying ${ind.name} (id: ${ind.id})`);
                try {
                    ind.apply(options.chart);
                    console.log(`[IndicatorModal] Successfully applied ${ind.name}`);
                } catch (err) {
                    console.error(`[IndicatorModal] Failed to apply ${ind.name}:`, err);
                }

                console.log(`[IndicatorModal] Triggering redraw...`);
                options.onApply?.();
                destroy();
            };
            list.appendChild(row);
        });
    };

    input.oninput = (e) => {
        renderList((e.target as HTMLInputElement).value);
    };

    modal.append(header, searchContainer, list);
    backdrop.appendChild(modal);

    const destroy = () => {
        backdrop.remove();
        window.removeEventListener("keydown", onKeyDown);
        options.onClose();
    };

    const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") destroy();
    };

    backdrop.onclick = (e) => {
        if (e.target === backdrop) destroy();
    };

    window.addEventListener("keydown", onKeyDown);
    document.body.appendChild(backdrop);

    renderList("");
    setTimeout(() => input.focus(), 50);

    return { destroy };
}

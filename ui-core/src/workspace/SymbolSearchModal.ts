import { makeSvgIcon } from "./icons.js";

export interface SymbolSearchModalOptions {
    symbols: readonly string[];
    onSelect: (symbol: string) => void;
    onClose: () => void;
}

export function createSymbolSearchModal(options: SymbolSearchModalOptions) {
    const backdrop = document.createElement("div");
    backdrop.className = "fixed inset-0 bg-black/40 z-[100] flex items-center justify-center animate-in fade-in duration-200";

    const modal = document.createElement("div");
    modal.className = "w-[500px] max-h-[600px] bg-zinc-950 border border-workspace-border flex flex-col shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden";

    // Header with search
    const header = document.createElement("div");
    header.className = "p-4 border-b border-workspace-border flex items-center gap-3 bg-zinc-900/20";

    const searchIcon = makeSvgIcon("search", "h-4 w-4 text-zinc-500");

    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Search symbols...";
    input.className = "flex-1 bg-transparent border-none outline-none text-sm text-zinc-100 placeholder:text-zinc-600";

    header.append(searchIcon, input);

    const list = document.createElement("div");
    list.className = "flex-1 overflow-y-auto py-2 no-scrollbar min-h-[300px]";

    const renderList = (filter: string) => {
        list.innerHTML = "";
        const filtered = options.symbols.filter(s => s.toLowerCase().includes(filter.toLowerCase()));

        if (filtered.length === 0) {
            const empty = document.createElement("div");
            empty.className = "px-4 py-8 text-center text-xs text-zinc-600 italic";
            empty.textContent = "No symbols found";
            list.appendChild(empty);
            return;
        }

        filtered.forEach(symbol => {
            const row = document.createElement("button");
            row.className = "w-full px-4 py-3 flex items-center justify-between text-left text-sm text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors border-none outline-none bg-transparent cursor-pointer";

            const label = document.createElement("span");
            label.className = "font-medium";
            label.textContent = symbol;

            row.append(label);
            row.onclick = () => {
                options.onSelect(symbol);
                destroy();
            };
            list.appendChild(row);
        });
    };

    input.oninput = (e) => {
        renderList((e.target as HTMLInputElement).value);
    };

    modal.append(header, list);
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

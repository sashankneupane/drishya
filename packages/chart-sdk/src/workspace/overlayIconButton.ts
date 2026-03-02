import { makeSvgIcon } from "./icons.js";

interface CreateOverlayIconButtonOptions {
  icon: "eye" | "eye-off" | "settings" | "trash" | "chevron-up" | "chevron-down";
  title: string;
  onClick: () => void;
  disabled?: boolean;
  onAfterClick?: () => void;
}

export function createOverlayIconButton(
  options: CreateOverlayIconButtonOptions
): HTMLButtonElement {
  const disabled = options.disabled === true;
  const btn = document.createElement("button");
  btn.style.height = "20px";
  btn.style.width = "20px";
  btn.style.display = "inline-flex";
  btn.style.alignItems = "center";
  btn.style.justifyContent = "center";
  btn.style.color = disabled ? "#71717a" : "#e4e4e7";
  btn.style.border = "1px solid rgba(113,113,122,0.75)";
  btn.style.borderRadius = "4px";
  btn.style.background = "rgba(9,9,11,0.9)";
  btn.style.cursor = disabled ? "not-allowed" : "pointer";
  btn.style.padding = "0";
  btn.style.pointerEvents = disabled ? "none" : "auto";
  btn.style.opacity = disabled ? "0.45" : "1";
  btn.title = options.title;
  const iconEl = makeSvgIcon(options.icon);
  iconEl.style.width = "14px";
  iconEl.style.height = "14px";
  btn.appendChild(iconEl);
  if (!disabled) {
    btn.onmouseenter = () => {
      btn.style.color = "#ffffff";
      btn.style.borderColor = "rgba(161,161,170,0.95)";
      btn.style.background = "rgba(24,24,27,0.98)";
    };
    btn.onmouseleave = () => {
      btn.style.color = "#e4e4e7";
      btn.style.borderColor = "rgba(113,113,122,0.75)";
      btn.style.background = "rgba(9,9,11,0.9)";
    };
    btn.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      options.onClick();
      options.onAfterClick?.();
    };
  }
  return btn;
}


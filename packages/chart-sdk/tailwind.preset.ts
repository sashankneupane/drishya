import type { Config } from "tailwindcss";

const preset: Partial<Config> = {
  theme: {
    extend: {
      colors: {
        workspace: {
          bg: "var(--drishya-bg, #000000)", // pure black or very deep zinc
          panel: "var(--drishya-panel, #000000)",
          surface: "var(--drishya-surface, #09090b)", // zinc-950
          border: "var(--drishya-border, #18181b)", // zinc-900
          text: "var(--drishya-text, #e4e4e7)", // zinc-300
          muted: "var(--drishya-muted, #71717a)", // zinc-500
          primary: "var(--drishya-primary, #ffffff)", // simple white
          "primary-hover": "var(--drishya-primary-hover, #ffffff)"
        },
        chart: {
          bg: "var(--drishya-chart-bg, #000000)",
          grid: "var(--drishya-chart-grid, #18181b)",
          up: "#22c55e",
          down: "#ef4444"
        }
      },
      spacing: {
        "chart-strip": "40px",
        "top-strip": "40px",
        "object-tree": "450px"
      },
      fontSize: {
        xxs: "10px"
      }
    }
  }
};

export default preset;

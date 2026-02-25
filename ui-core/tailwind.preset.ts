import type { Config } from "tailwindcss";

const preset: Partial<Config> = {
  theme: {
    extend: {
      colors: {
        workspace: {
          bg: "#020617",
          panel: "#0b1220",
          border: "#1f2937",
          text: "#e5e7eb",
          muted: "#94a3b8"
        },
        chart: {
          bg: "#030712",
          grid: "#111827",
          up: "#22c55e",
          down: "#ef4444"
        }
      },
      spacing: {
        "chart-strip": "44px",
        "top-strip": "30px",
        "object-tree": "228px"
      }
    }
  }
};

export default preset;

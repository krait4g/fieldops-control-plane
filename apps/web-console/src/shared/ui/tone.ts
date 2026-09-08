import type { StatusTone } from "@/shared/lib/view-models";

export const toneColor: Record<StatusTone, string> = {
  neutral: "var(--text-secondary)",
  success: "var(--success)",
  warning: "var(--warning)",
  critical: "var(--critical)",
  info: "var(--info)",
  unknown: "var(--unknown)",
};

export const statusDotColor: Record<StatusTone, string> = {
  neutral: "#a7b4c6",
  success: "#22c55e",
  warning: "#f59e0b",
  critical: "#ff6b6b",
  info: "#38bdf8",
  unknown: "#a78bfa",
};

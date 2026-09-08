import type { Locale } from "./copy";

export type MetricValue = number | boolean | string | null;

export function intlLocale(locale: Locale): string {
  return locale === "ko" ? "ko-KR" : "en-US";
}

export function formatMetricValue(value: MetricValue, locale: Locale = "en"): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "—";
    return new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 2 }).format(value);
  }
  return value;
}

export function formatRatio(ratio: number | null | undefined, locale: Locale = "en"): string {
  if (ratio === null || ratio === undefined || Number.isNaN(ratio)) return "—";
  return new Intl.NumberFormat(intlLocale(locale), {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(ratio);
}

export function formatUnit(unit: string | null | undefined): string | undefined {
  if (!unit) return undefined;
  return unit;
}

import { catalogs, type Locale } from "./copy";
import type { MetricValue } from "./format";
import { formatMetricValue, intlLocale } from "./format";

export interface MetricDisplayMetadata {
  label: string;
  unit?: string;
}

export function metricDisplayMetadata(
  code: string,
  rawLabel: string,
  rawUnit: string | null | undefined,
  locale: Locale,
): MetricDisplayMetadata {
  switch (code) {
    case "soil.moisture.pct":
      return { label: catalogs[locale].domain.soilMoisture, unit: "%" };
    case "soil.temperature.c":
      return { label: catalogs[locale].domain.soilTemperature, unit: "°C" };
    default:
      return { label: rawLabel || code, unit: rawUnit || undefined };
  }
}

export function formatDomainMetricValue(
  code: string,
  value: MetricValue,
  locale: Locale,
): string {
  if (
    (code === "soil.moisture.pct" || code === "soil.temperature.c") &&
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return new Intl.NumberFormat(intlLocale(locale), {
      maximumFractionDigits: 1,
    }).format(value);
  }
  return formatMetricValue(value, locale);
}

export function deviceTypeDisplayLabel(
  typeCode: string,
  rawLabel: string,
  locale: Locale,
): string {
  if (typeCode === "SOIL_SENSOR") return catalogs[locale].domain.soilSensor;
  return rawLabel || typeCode;
}

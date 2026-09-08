import type {
  MetricQuality,
  TelemetrySeries,
  TelemetrySeriesResponse,
  TimeBucket,
  TimeRange,
} from "@/shared/api/types";
import { catalogs, formatCopy, type CopyCatalog, type Locale } from "./copy";
import { metricDisplayMetadata } from "./domain-display";

export type Aggregation = "RAW" | "AVG" | "MIN" | "MAX" | "LAST";

export interface TimeSeriesPointView {
  timestamp: string;
  value: number | null;
  quality: MetricQuality;
}

export interface TimeSeriesView {
  metricCode: string;
  label: string;
  unit: string;
  aggregation: Aggregation;
  axisId: string;
  points: TimeSeriesPointView[];
}

export interface SeriesContextView {
  timezone: string;
  range: TimeRange;
  bucket: TimeBucket;
  generatedAt?: string;
}

export function defaultBucketForRange(range: TimeRange): TimeBucket {
  switch (range) {
    case "PT1H":
      return "PT1M";
    case "P7D":
      return "PT1H";
    case "PT6H":
    case "PT24H":
    default:
      return "PT5M";
  }
}

/** Group series by unit; a chart renders at most two axis groups in M1. */
function assignAxisId(series: TelemetrySeries[]): Map<string, string> {
  const unitToAxis = new Map<string, string>();
  let nextAxis = 0;
  for (const item of series) {
    const unit = item.unit ?? "";
    if (!unitToAxis.has(unit)) {
      unitToAxis.set(unit, nextAxis === 0 ? "value" : "value2");
      nextAxis += 1;
    }
  }
  return unitToAxis;
}

export function mapTelemetrySeriesResponse(
  response: TelemetrySeriesResponse,
  locale: Locale = "en",
): { context: SeriesContextView; series: TimeSeriesView[] } {
  const displaySeries = response.series.map((item) => ({
    item,
    display: metricDisplayMetadata(item.metricCode, item.displayName, item.unit, locale),
  }));
  const axisById = assignAxisId(response.series.map((item, index) => ({
    ...item,
    unit: displaySeries[index]?.display.unit ?? "",
  })));
  return {
    context: {
      timezone: response.context.timezone,
      range: response.context.range,
      bucket: response.context.bucket,
      generatedAt: response.context.generatedAt,
    },
    series: displaySeries.map(({ item, display }) => ({
      metricCode: item.metricCode,
      label: display.label,
      unit: display.unit ?? "",
      aggregation: item.aggregation as Aggregation,
      axisId: axisById.get(display.unit ?? "") ?? "value",
      points: item.points.map((point) => ({
        timestamp: point.timestamp,
        value: typeof point.value === "number" ? point.value : null,
        quality: point.quality,
      })),
    })),
  };
}

/** Aggregate a series into a flat, screen-reader friendly summary string. */
export function seriesSummaryText(series: TimeSeriesView[], messages: CopyCatalog = catalogs.en): string {
  if (series.length === 0) return messages.chart.noSeries;
  return series
    .map((item) => {
      const count = item.points.filter((point) => point.value !== null).length;
      const missing = item.points.length - count;
      return formatCopy(messages.chart.seriesSummary, {
        label: item.label,
        unit: item.unit || messages.chart.noUnit,
        values: count,
        gaps: missing,
      });
    })
    .join("; ");
}

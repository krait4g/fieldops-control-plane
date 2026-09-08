"use client";

import { useEffect, useMemo, useRef } from "react";
import * as echarts from "echarts/core";
import { LineChart as EChartsLine } from "echarts/charts";
import {
  GridComponent,
  LegendComponent,
  TooltipComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { FileText } from "lucide-react";
import { seriesSummaryText, type TimeSeriesView } from "@/shared/lib/series";
import type { UiFailure } from "@/shared/lib/view-models";
import { ErrorView } from "./feedback";
import { Skeleton } from "./skeleton";
import { useI18n } from "@/shared/i18n";
import { formatCopy, type Locale } from "@/shared/lib/copy";
import { intlLocale } from "@/shared/lib/format";

echarts.use([EChartsLine, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer]);

function formatAxisTime(iso: string, timezone: string, locale: Locale): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone: timezone,
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatCompactAxisTime(iso: string, timezone: string, locale: Locale): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function lineColor(index: number): string {
  const palette = ["#2F6BFF", "#22C55E", "#F59E0B", "#A78BFA"];
  return palette[index % palette.length];
}

function buildOption(series: TimeSeriesView[], timezone: string, locale: Locale) {
  const categories = series[0]?.points.map((point) => formatAxisTime(point.timestamp, timezone, locale)) ?? [];
  const compactCategories = series[0]?.points.map((point) =>
    formatCompactAxisTime(point.timestamp, timezone, locale)) ?? [];
  const hasSecondAxis = series.some((item) => item.axisId === "value2");

  return {
    color: series.map((_, index) => lineColor(index)),
    tooltip: { trigger: "axis" as const },
    legend: { textStyle: { color: "#A7B4C6" }, top: 0 },
    grid: { left: 36, right: hasSecondAxis ? 36 : 24, top: 36, bottom: 32, containLabel: true },
    xAxis: {
      type: "category" as const,
      data: categories,
      boundaryGap: false,
      axisLine: { lineStyle: { color: "#26354A" } },
      axisLabel: { color: "#718096", hideOverlap: true },
    },
    yAxis: [
      {
        type: "value" as const,
        name: series.find((item) => item.axisId === "value")?.unit || "",
        axisLabel: { color: "#718096" },
        splitLine: { lineStyle: { color: "#162337" } },
      },
      ...(hasSecondAxis
        ? [
            {
              type: "value" as const,
              name: series.find((item) => item.axisId === "value2")?.unit || "",
              axisLabel: { color: "#718096" },
              splitLine: { show: false },
            },
          ]
        : []),
    ],
    series: series.map((item) => ({
      name: item.label,
      type: "line" as const,
      yAxisIndex: item.axisId === "value2" ? 1 : 0,
      symbol: "circle",
      symbolSize: 4,
      connectNulls: false,
      data: item.points.map((point) => point.value),
    })),
    media: [
      {
        query: { maxWidth: 480 },
        option: {
          legend: {
            top: 0,
            left: "center",
            itemWidth: 12,
            itemHeight: 8,
            itemGap: 10,
            textStyle: { color: "#A7B4C6", fontSize: 11 },
          },
          grid: { left: 8, right: 8, top: 54, bottom: 40, containLabel: true },
          xAxis: {
            data: compactCategories,
            boundaryGap: true,
            axisLabel: {
              color: "#718096",
              fontSize: 10,
              hideOverlap: true,
              interval: Math.max(0, categories.length - 2),
            },
          },
          yAxis: [
            { name: "", axisLabel: { color: "#718096", fontSize: 10 } },
            ...(hasSecondAxis
              ? [{ name: "", axisLabel: { color: "#718096", fontSize: 10 } }]
              : []),
          ],
          series: series.map(() => ({ symbolSize: 6 })),
        },
      },
    ],
  };
}

export interface TelemetryTrendChartProps {
  series: TimeSeriesView[];
  timezone: string;
  rangeLabel: string;
  loading: boolean;
  error?: UiFailure;
  onRetry?: () => void;
  emptyMessage: string;
  height?: number;
  testId?: string;
}

function ChartSummary({ series, timezone }: { series: TimeSeriesView[]; timezone: string }) {
  const { locale, messages } = useI18n();
  const first = series[0];
  const last = series[0]?.points[series[0].points.length - 1];
  return (
    <details className="text-xs text-text-muted">
      <summary className="cursor-pointer list-none underline-offset-2 hover:underline">
        <FileText className="mr-1 inline size-3" aria-hidden="true" />
        {messages.chart.dataSummary}
      </summary>
      <p className="mt-2">{seriesSummaryText(series, messages)}</p>
      {first && last ? (
        <p className="mt-1">
          {formatCopy(messages.chart.range, {
            from: formatAxisTime(first.points[0].timestamp, timezone, locale),
            to: formatAxisTime(last.timestamp, timezone, locale),
          })}
        </p>
      ) : null}
    </details>
  );
}

export function TelemetryTrendChart({
  series,
  timezone,
  rangeLabel,
  loading,
  error,
  onRetry,
  emptyMessage,
  height = 300,
  testId,
}: TelemetryTrendChartProps) {
  const { locale, messages } = useI18n();
  const container = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  const option = useMemo(() => buildOption(series, timezone, locale), [series, timezone, locale]);

  useEffect(() => {
    if (!container.current || loading || error) return;
    const chart = echarts.init(container.current);
    chartRef.current = chart;
    chart.setOption(option);
    const resize = new ResizeObserver(() => chart.resize());
    resize.observe(container.current);
    return () => {
      resize.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, [option, loading, error]);

  if (loading) {
    return <Skeleton className="h-[300px] w-full" />;
  }

  if (error) {
    return <ErrorView failure={error} onRetry={onRetry} compact />;
  }

  const totalPoints = series.reduce((sum, item) => sum + item.points.length, 0);
  const hasValues = series.some((item) => item.points.some((point) => point.value !== null));

  if (series.length === 0 || totalPoints === 0 || !hasValues) {
    return (
      <div className="flex h-[300px] items-center justify-center text-sm text-text-muted">
        {emptyMessage || messages.empty.noTelemetry}
      </div>
    );
  }

  return (
    <div>
      <div
        ref={container}
        role="img"
        aria-label={formatCopy(messages.chart.ariaLabel, { range: rangeLabel })}
        data-testid={testId}
        style={{ height, width: "100%" }}
      />
      <ChartSummary series={series} timezone={timezone} />
    </div>
  );
}

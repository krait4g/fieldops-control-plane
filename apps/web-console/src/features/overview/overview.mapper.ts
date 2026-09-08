import type {
  DeviceStatusCounts,
  MetricReading,
  OverviewResponse,
  WidgetMeta,
  ZoneCondition,
} from "@/shared/api/types";
import { formatRatio } from "@/shared/lib/format";
import { formatDomainMetricValue, metricDisplayMetadata } from "@/shared/lib/domain-display";
import { catalogs, type CopyCatalog, type Locale } from "@/shared/lib/copy";
import { toViewTimestamp } from "@/shared/lib/time";
import type { StatusTone, WidgetMetaView } from "@/shared/lib/view-models";
import type {
  CurrentConditionMetricView,
  CurrentConditionView,
  DeviceHealthView,
  KpiCardView,
  OverviewPageView,
  PlaceholderWidgetView,
} from "./overview.view";

function mapWidgetMeta(meta: WidgetMeta, timezone: string, locale: Locale): WidgetMetaView {
  return {
    availability: meta.status,
    source: meta.source,
    generatedAt: toViewTimestamp(meta.generatedAt, timezone, locale),
    staleAt: toViewTimestamp(meta.staleAt ?? undefined, timezone, locale),
    failure: meta.failure
      ? {
          code: meta.failure.code,
          title: meta.failure.message,
          message: meta.failure.message,
          traceId: meta.failure.traceId ?? undefined,
          retryable: meta.failure.retryable,
        }
      : undefined,
  };
}

function kpiTone(status: WidgetMetaView["availability"]): StatusTone {
  switch (status) {
    case "AVAILABLE":
      return "neutral";
    case "STALE":
      return "warning";
    case "UNAVAILABLE":
      return "critical";
    case "EMPTY":
      return "neutral";
    case "FORBIDDEN":
      return "unknown";
  }
}

function metricView(metric: MetricReading, timezone: string, locale: Locale): CurrentConditionMetricView {
  const display = metricDisplayMetadata(metric.code, metric.displayName, metric.unit, locale);
  return {
    code: metric.code,
    label: display.label,
    value: formatDomainMetricValue(metric.code, metric.value, locale),
    unit: display.unit,
    quality: metric.quality,
    observedAt: toViewTimestamp(metric.observedAt, timezone, locale),
  };
}

function zoneView(zone: ZoneCondition, timezone: string, locale: Locale): CurrentConditionView {
  return {
    zoneId: zone.zoneId,
    zoneName: zone.zoneName,
    metrics: zone.metrics.map((metric) => metricView(metric, timezone, locale)),
  };
}

function deviceHealthView(
  data: DeviceStatusCounts,
  meta: WidgetMetaView,
  locale: Locale,
): DeviceHealthView {
  const total = data.total;
  const segments = [
    { status: "ONLINE" as const, count: data.online },
    { status: "OFFLINE" as const, count: data.offline },
    { status: "DEGRADED" as const, count: data.degraded },
    { status: "UNKNOWN" as const, count: data.unknown },
  ].map((segment) => ({
    status: segment.status,
    count: segment.count,
    ratioLabel: total > 0 ? formatRatio(segment.count / total, locale) : formatRatio(0, locale),
  }));
  return { meta, total, segments };
}

export function mapOverviewResponse(
  response: OverviewResponse,
  timezone: string,
  locale: Locale = "en",
  messages: CopyCatalog = catalogs[locale],
): OverviewPageView {
  const widgets = response.widgets;
  const context = response.context;

  const deviceStatusMeta = mapWidgetMeta(widgets.deviceStatus.meta, timezone, locale);
  const activeAlarmsMeta = mapWidgetMeta(widgets.activeAlarms.meta, timezone, locale);
  const freshnessMeta = mapWidgetMeta(widgets.freshness.meta, timezone, locale);

  const deviceOnline = widgets.deviceStatus.data.online;
  const deviceTotal = widgets.deviceStatus.data.total;
  const freshnessRatio = widgets.freshness.data.ratio;
  const freshnessFresh = widgets.freshness.data.fresh;
  const freshnessMonitored = widgets.freshness.data.monitored;

  const kpis: KpiCardView[] = [
    {
      id: "deviceStatus",
      title: messages.overview.onlineDevices,
      primaryValue: String(deviceOnline),
      secondaryLabel: messages.overview.ofDevices.replace("{count}", String(deviceTotal)),
      tone: kpiTone(deviceStatusMeta.availability),
      meta: deviceStatusMeta,
    },
    {
      id: "activeAlarms",
      title: messages.overview.activeAlarms,
      primaryValue: String(widgets.activeAlarms.data.active),
      secondaryLabel: messages.overview.noAlarmRoute,
      tone: kpiTone(activeAlarmsMeta.availability),
      meta: activeAlarmsMeta,
    },
    {
      id: "offlineDevices",
      title: messages.overview.offlineDevices,
      primaryValue: String(widgets.deviceStatus.data.offline),
      secondaryLabel: messages.overview.ofDevices.replace("{count}", String(deviceTotal)),
      tone: widgets.deviceStatus.data.offline > 0 ? "critical" : kpiTone(deviceStatusMeta.availability),
      meta: deviceStatusMeta,
    },
    {
      id: "freshness",
      title: messages.overview.dataFreshness,
      primaryValue: freshnessMonitored > 0 ? formatRatio(freshnessRatio, locale) : "—",
      secondaryLabel:
        freshnessMonitored > 0
          ? messages.overview.devicesCurrent
              .replace("{fresh}", String(freshnessFresh))
              .replace("{monitored}", String(freshnessMonitored))
          : messages.overview.noMonitoredDevices,
      tone: kpiTone(freshnessMeta.availability),
      meta: freshnessMeta,
    },
  ];

  return {
    context: {
      tenantId: context.tenantId,
      siteId: context.siteId,
      siteName: context.siteName,
      timezone: context.timezone,
      range: context.range,
      generatedAt: toViewTimestamp(context.generatedAt, timezone, locale),
      dataVersion: context.dataVersion,
    },
    kpis,
    currentConditions: widgets.currentConditions.data.map((zone) =>
      zoneView(zone, timezone, locale),
    ),
    deviceHealth: deviceHealthView(widgets.deviceHealth.data, mapWidgetMeta(widgets.deviceHealth.meta, timezone, locale), locale),
    placeholders: (["activeAlarmList"] as const).map(
      (id): PlaceholderWidgetView => {
        const meta = widgets[id].meta;
        return {
          id,
          title: messages.overview.activeAlarms,
          meta: mapWidgetMeta(meta, timezone, locale),
          emptyMessage: messages.empty.noAlarms,
        };
      },
    ),
    partialFailures: response.partialFailures.map((failure) => ({
      source: failure.source,
      code: failure.code,
      retryable: failure.retryable,
    })),
  };
}

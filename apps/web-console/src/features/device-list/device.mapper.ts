import type {
  DeviceSummary,
  FreshnessStatus,
  MetricReading,
} from "@/shared/api/types";
import {
  deviceTypeDisplayLabel,
  formatDomainMetricValue,
  metricDisplayMetadata,
} from "@/shared/lib/domain-display";
import { toViewTimestamp, type ViewTimestamp } from "@/shared/lib/time";
import type { MetricQuality } from "@/shared/api/types";
import type { Locale } from "@/shared/lib/copy";

export interface DeviceLatestMetricView {
  label: string;
  value: string;
  unit?: string;
  quality: MetricQuality;
}

export interface DeviceRowView {
  id: string;
  name: string;
  externalId: string;
  typeLabel: string;
  siteLabel: string;
  zoneLabel?: string;
  protocol: string;
  connectivity: string;
  readiness: string;
  freshness: FreshnessStatus;
  latestMetric?: DeviceLatestMetricView;
  lastSeenAt?: ViewTimestamp;
  activeAlarmCount: number;
}

export function mapLatestMetric(metric: MetricReading | null, locale: Locale = "en"): DeviceLatestMetricView | undefined {
  if (!metric) return undefined;
  const display = metricDisplayMetadata(metric.code, metric.displayName, metric.unit, locale);
  return {
    label: display.label,
    value: formatDomainMetricValue(metric.code, metric.value, locale),
    unit: display.unit,
    quality: metric.quality,
  };
}

export function mapDeviceSummary(dto: DeviceSummary, timezone: string, locale: Locale = "en"): DeviceRowView {
  return {
    id: dto.id,
    name: dto.name,
    externalId: dto.externalId,
    typeLabel: deviceTypeDisplayLabel(dto.typeCode, dto.typeName, locale),
    siteLabel: dto.siteName,
    zoneLabel: dto.zoneName ?? undefined,
    protocol: dto.protocol,
    connectivity: dto.connectivity,
    readiness: dto.readiness,
    freshness: dto.freshness,
    latestMetric: mapLatestMetric(dto.latestMetric, locale),
    lastSeenAt: toViewTimestamp(dto.lastSeenAt, timezone, locale),
    activeAlarmCount: dto.activeAlarmCount,
  };
}

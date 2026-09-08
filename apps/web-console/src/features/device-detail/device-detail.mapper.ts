import type {
  DeviceDetailResponse,
  DeviceStateResponse,
  MetricReading,
} from "@/shared/api/types";
import {
  deviceTypeDisplayLabel,
  formatDomainMetricValue,
  metricDisplayMetadata,
} from "@/shared/lib/domain-display";
import { sourceLabel } from "@/shared/lib/labels";
import { toViewTimestamp, type ViewTimestamp } from "@/shared/lib/time";
import type { MetricQuality } from "@/shared/api/types";
import { catalogs, type CopyCatalog, type Locale } from "@/shared/lib/copy";

export interface DeviceMetricView {
  code: string;
  label: string;
  value: string;
  unit?: string;
  quality: MetricQuality;
  observedAt?: ViewTimestamp;
}

export interface DeviceConnectionView {
  adapterType: string;
  status: string;
  lastConnectedAt?: ViewTimestamp;
  lastDisconnectedAt?: ViewTimestamp;
  reasonCode?: string;
  sessionIdMasked?: string;
}

export interface DeviceDetailView {
  id: string;
  name: string;
  externalId: string;
  typeLabel: string;
  siteLabel: string;
  zoneLabel?: string;
  protocol: string;
  primaryMetricCodes: string[];
  connectivity?: string;
  readiness?: string;
  freshness?: string;
  source?: string;
  sourceLabel: string;
  stateVersion?: number;
  observedAt?: ViewTimestamp;
  receivedAt?: ViewTimestamp;
  staleAt?: ViewTimestamp;
  metrics: DeviceMetricView[];
  connection: DeviceConnectionView;
  registryUpdatedAt?: ViewTimestamp;
}

function mapMetric(metric: MetricReading, timezone: string, locale: Locale): DeviceMetricView {
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

export function mapDeviceDetail(
  detail: DeviceDetailResponse,
  state: DeviceStateResponse | null | undefined,
  timezone: string,
  locale: Locale = "en",
  messages: CopyCatalog = catalogs[locale],
): DeviceDetailView {
  return {
    id: detail.id,
    name: detail.name,
    externalId: detail.externalId,
    typeLabel: deviceTypeDisplayLabel(detail.typeCode, detail.typeName, locale),
    siteLabel: detail.siteName,
    zoneLabel: detail.zoneName ?? undefined,
    protocol: detail.protocol,
    primaryMetricCodes: detail.primaryMetricCodes,
    connectivity: state?.connectivity,
    readiness: state?.readiness,
    freshness: state?.freshness,
    source: state?.source,
    sourceLabel: sourceLabel(state?.source, messages),
    stateVersion: state?.stateVersion,
    observedAt: toViewTimestamp(state?.observedAt, timezone, locale),
    receivedAt: toViewTimestamp(state?.receivedAt, timezone, locale),
    staleAt: toViewTimestamp(state?.staleAt, timezone, locale),
    metrics: state ? state.metrics.map((metric) => mapMetric(metric, timezone, locale)) : [],
    connection: {
      adapterType: detail.connection.adapterType,
      status: detail.connection.status,
      lastConnectedAt: toViewTimestamp(detail.connection.lastConnectedAt, timezone, locale),
      lastDisconnectedAt: toViewTimestamp(detail.connection.lastDisconnectedAt, timezone, locale),
      reasonCode: detail.connection.reasonCode ?? undefined,
      sessionIdMasked: detail.connection.sessionIdMasked ?? undefined,
    },
    registryUpdatedAt: toViewTimestamp(detail.updatedAt, timezone, locale),
  };
}

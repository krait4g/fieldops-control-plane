import type { MetricQuality, TimeRange } from "@/shared/api/types";
import type { StatusTone, WidgetMetaView } from "@/shared/lib/view-models";
import type { ViewTimestamp } from "@/shared/lib/time";

export interface OverviewContextView {
  tenantId: string;
  siteId: string;
  siteName: string;
  timezone: string;
  range: TimeRange;
  generatedAt?: ViewTimestamp;
  dataVersion: string;
}

export interface KpiCardView {
  id: string;
  title: string;
  primaryValue: string;
  secondaryLabel?: string;
  tone: StatusTone;
  meta: WidgetMetaView;
  onClick?: () => void;
}

export interface CurrentConditionMetricView {
  code: string;
  label: string;
  value: string;
  unit?: string;
  quality: MetricQuality;
  observedAt?: ViewTimestamp;
}

export interface CurrentConditionView {
  zoneId: string;
  zoneName: string;
  metrics: CurrentConditionMetricView[];
}

export interface DeviceHealthSegmentView {
  status: "ONLINE" | "OFFLINE" | "DEGRADED" | "UNKNOWN";
  count: number;
  ratioLabel: string;
}

export interface DeviceHealthView {
  meta: WidgetMetaView;
  total: number;
  segments: DeviceHealthSegmentView[];
}

export interface PlaceholderWidgetView {
  id: string;
  title: string;
  meta: WidgetMetaView;
  emptyMessage: string;
}

export interface OverviewPageView {
  context: OverviewContextView;
  kpis: KpiCardView[];
  currentConditions: CurrentConditionView[];
  deviceHealth: DeviceHealthView;
  placeholders: PlaceholderWidgetView[];
  partialFailures: Array<{
    source: string;
    code: string;
    retryable: boolean;
  }>;
}
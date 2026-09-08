"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useSessionContext } from "@/features/session";
import { isHttpError, problemTitle } from "@/shared/api/http/problem";
import { defaultBucketForRange, mapTelemetrySeriesResponse } from "@/shared/lib/series";
import { connectivityStatus, freshnessStatus, readinessStatus } from "@/shared/lib/labels";
import { StatusBadge } from "@/shared/ui/badge";
import { MetricCard } from "@/shared/ui/metric-card";
import { TelemetryTrendChart } from "@/shared/ui/chart";
import { WidgetFrame } from "@/shared/ui/card";
import { ErrorView, NotFoundView, PermissionView, StaleBanner } from "@/shared/ui/feedback";
import { Skeleton } from "@/shared/ui/skeleton";
import { mapDeviceDetail, type DeviceDetailView } from "./device-detail.mapper";
import { useDeviceQuery, useDeviceSeriesQuery, useDeviceStateQuery } from "./use-device";
import { useRequiredSnapshot } from "@/shared/realtime/snapshot-coordinator";
import { PageHeading } from "@/shared/ui/page-heading";
import { useI18n } from "@/shared/i18n";

function HeaderRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <dl className="flex flex-col gap-0.5">
      <dt className="text-[11px] uppercase tracking-wide text-text-muted">{label}</dt>
      <dd className="text-sm text-text-primary">{children}</dd>
    </dl>
  );
}

function ConnectionPanel({ device }: { device: DeviceDetailView }) {
  const conn = device.connection;
  const { messages } = useI18n();
  const statusLabel = conn.status === "CONNECTED" ? messages.deviceDetail.connected : conn.status === "DEGRADED" ? messages.states.degraded : conn.status === "UNKNOWN" ? messages.states.unknown : messages.deviceDetail.disconnected;
  return (
    <WidgetFrame title={messages.deviceDetail.connection}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <HeaderRow label={messages.deviceDetail.adapter}>{conn.adapterType}</HeaderRow>
        <HeaderRow label={messages.deviceDetail.status}>{statusLabel}</HeaderRow>
        <HeaderRow label={messages.deviceDetail.sessionId}>{conn.sessionIdMasked ?? "—"}</HeaderRow>
        <HeaderRow label={messages.deviceDetail.lastConnected}>{conn.lastConnectedAt?.absoluteLabel ?? "—"}</HeaderRow>
        <HeaderRow label={messages.deviceDetail.lastDisconnected}>{conn.lastDisconnectedAt?.absoluteLabel ?? "—"}</HeaderRow>
        <HeaderRow label={messages.deviceDetail.reasonCode}>{conn.reasonCode ? <span className="mono">{conn.reasonCode}</span> : "—"}</HeaderRow>
      </div>
    </WidgetFrame>
  );
}

export function DeviceDetailScreen({ deviceId }: { deviceId: string }) {
  const { tenantId, siteId, range } = useSessionContext();
  const { locale, messages } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab") === "connection" ? "connection" : "overview";

  const detailQuery = useDeviceQuery(tenantId, siteId, deviceId);
  const stateQuery = useDeviceStateQuery(tenantId, siteId, deviceId);
  const primaryMetrics = detailQuery.data?.primaryMetricCodes ?? [];
  const bucket = defaultBucketForRange(range);
  const seriesQuery = useDeviceSeriesQuery(tenantId, siteId, deviceId, range, primaryMetrics, bucket);
  useRequiredSnapshot({
    routeKey: `device:${tenantId}:${siteId}:${deviceId}`,
    ready: detailQuery.isSuccess && stateQuery.isSuccess,
    revalidate: async () => {
      const [detail, state] = await Promise.all([detailQuery.refetch(), stateQuery.refetch()]);
      return detail.isSuccess && state.isSuccess;
    },
  });

  if (
    (detailQuery.isLoading && !detailQuery.data) ||
    (stateQuery.isLoading && !stateQuery.data)
  ) {
    return <DeviceDetailSkeleton />;
  }

  if (detailQuery.isError && !detailQuery.data) {
    const error = detailQuery.error;
    if (isHttpError(error) && error.status === 404) return <NotFoundView />;
    if (isHttpError(error) && error.status === 403) return <PermissionView />;
    return (
      <ErrorView
        failure={{
          code: "DEVICE_DETAIL_FAILED",
          title: isHttpError(error) ? problemTitle(error.problem, messages) : messages.errors.genericTitle,
          message: isHttpError(error) && error.problem?.detail ? error.problem.detail : messages.deviceDetail.loadFailed,
          traceId: isHttpError(error) ? error.traceId : undefined,
          retryable: true,
        }}
        onRetry={() => detailQuery.refetch()}
      />
    );
  }

  if (!detailQuery.data) return null;

  const timezone = "UTC";
  const device = mapDeviceDetail(detailQuery.data, stateQuery.data, timezone, locale, messages);
  const seriesView = seriesQuery.data ? mapTelemetrySeriesResponse(seriesQuery.data, locale).series : null;
  const hasGaps = seriesView?.some((series) => series.points.some((point) => point.value === null)) ?? false;

  const sourceLabel = device.sourceLabel;
  const stale = device.freshness === "STALE";

  const setTab = (next: "overview" | "connection") => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "connection") params.set("tab", "connection");
    else params.delete("tab");
    const qs = params.toString();
    router.replace(`/devices/${deviceId}${qs ? `?${qs}` : ""}`, { scroll: false });
  };

  const connectivity = connectivityStatus(device.connectivity as never, messages);
  const readiness = readinessStatus(device.readiness as never, messages);
  const freshness = freshnessStatus(device.freshness as never, messages);

  return (
    <div data-testid="device-detail-page" className="space-y-6">
      <header className="space-y-4 border-b border-border-subtle/70 pb-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <PageHeading focusKey={`device:${deviceId}`} className="flex items-center gap-2 text-2xl font-bold tracking-tight">
              {device.name}
            </PageHeading>
            <p className="mono mt-1 text-sm text-text-muted">{device.externalId}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge label={connectivity.label} tone={connectivity.tone} size="sm" description={messages.devices.connectivity} />
            <StatusBadge label={readiness.label} tone={readiness.tone} size="sm" showDot={false} description={messages.devices.readiness} />
            <StatusBadge label={freshness.label} tone={freshness.tone} size="sm" showDot={false} description={messages.devices.freshness} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <HeaderRow label={messages.deviceDetail.type}>{device.typeLabel}</HeaderRow>
          <HeaderRow label={messages.deviceDetail.site}>{device.siteLabel}</HeaderRow>
          <HeaderRow label={messages.deviceDetail.zone}>{device.zoneLabel ?? "—"}</HeaderRow>
          <HeaderRow label={messages.deviceDetail.protocol}>{device.protocol.replace("_", " ")}</HeaderRow>
          <HeaderRow label={messages.deviceDetail.lastReceived}>{device.receivedAt?.relativeLabel ?? "—"}</HeaderRow>
          <HeaderRow label={messages.deviceDetail.stateVersion}>
            <span className="mono">{device.stateVersion ?? "—"}</span>
          </HeaderRow>
        </div>

        {stale ? <StaleBanner lastUpdatedAt={device.receivedAt} /> : null}
      </header>

      <div className="flex items-center gap-1 border-b border-border-subtle">
        {(["overview", "connection"] as const).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setTab(item)}
            aria-pressed={tab === item}
            className={
              tab === item
                ? "border-b-2 border-accent-primary px-3 py-2 text-sm font-semibold text-text-primary"
                : "border-b-2 border-transparent px-3 py-2 text-sm text-text-muted hover:text-text-primary"
            }
          >
            {item === "overview" ? messages.deviceDetail.overview : messages.deviceDetail.connection}
          </button>
        ))}
      </div>

      {tab === "connection" ? (
        <ConnectionPanel device={device} />
      ) : (
        <div className="space-y-6">
          {stateQuery.isError && !stateQuery.data ? (
            <WidgetFrame title={messages.deviceDetail.latestState}>
              <ErrorView
                failure={{
                  code: "STATE_UNAVAILABLE",
                  title: messages.deviceDetail.latestStateUnavailable,
                  message: messages.deviceDetail.latestStateLoadFailed,
                  retryable: true,
                }}
                onRetry={() => stateQuery.refetch()}
                compact
              />
            </WidgetFrame>
          ) : (
            <section aria-label={messages.deviceDetail.metrics} className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {device.metrics.length === 0 ? (
                <p className="text-sm text-text-muted">{messages.empty.noTelemetry}</p>
              ) : (
                device.metrics.map((metric) => (
                  <MetricCard
                    key={metric.code}
                    code={metric.code}
                    label={metric.label}
                    value={metric.value}
                    unit={metric.unit}
                    quality={metric.quality}
                    observedAt={metric.observedAt}
                    sourceLabel={sourceLabel}
                  />
                ))
              )}
            </section>
          )}

          <WidgetFrame title={messages.deviceDetail.telemetryTrend}>
            <TelemetryTrendChart
              testId="device-telemetry-chart"
              series={seriesView ?? []}
              timezone={timezone}
              rangeLabel={range}
              loading={seriesQuery.isLoading}
              error={
                seriesQuery.isError
                  ? {
                      code: "SERIES_UNAVAILABLE",
                      title: isHttpError(seriesQuery.error) ? problemTitle(seriesQuery.error.problem, messages) : messages.deviceDetail.chartUnavailable,
                      message: messages.deviceDetail.historyLoadFailed,
                      traceId: isHttpError(seriesQuery.error) ? seriesQuery.error.traceId : undefined,
                      retryable: true,
                    }
                  : undefined
              }
              onRetry={() => seriesQuery.refetch()}
              emptyMessage={messages.empty.noTelemetry}
              height={340}
            />
            {hasGaps ? (
              <p className="rounded-lg border border-border-subtle bg-console-surface-2/60 px-3 py-2 text-xs text-text-muted">
                {messages.deviceDetail.noDataExplanation}
              </p>
            ) : null}
          </WidgetFrame>
        </div>
      )}
    </div>
  );
}

function DeviceDetailSkeleton() {
  return (
    <div className="space-y-6" aria-hidden="true">
      <Skeleton className="h-10 w-64" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-12" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-28" />
        ))}
      </div>
      <Skeleton className="h-[380px]" />
    </div>
  );
}

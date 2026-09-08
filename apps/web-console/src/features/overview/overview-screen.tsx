"use client";

import { useRouter } from "next/navigation";
import { useRequiredSnapshot } from "@/shared/realtime/snapshot-coordinator";
import { PageHeading } from "@/shared/ui/page-heading";
import { useSessionContext } from "@/features/session";
import { formatCopy } from "@/shared/lib/copy";
import { useI18n } from "@/shared/i18n";
import { connectivityStatus } from "@/shared/lib/labels";
import { defaultBucketForRange, mapTelemetrySeriesResponse } from "@/shared/lib/series";
import { isHttpError, problemTitle } from "@/shared/api/http/problem";
import { TelemetryTrendChart } from "@/shared/ui/chart";
import { KpiCard } from "@/shared/ui/kpi-card";
import { WidgetFrame } from "@/shared/ui/card";
import { ErrorView, EmptyView, StaleBanner } from "@/shared/ui/feedback";
import { mapOverviewResponse } from "./overview.mapper";
import type { KpiCardView } from "./overview.view";
import { useEnvironmentSeriesQuery, useOverviewQuery } from "./use-overview";

function qualityColor(quality: string): string {
  switch (quality) {
    case "BAD":
      return "var(--critical)";
    case "UNCERTAIN":
      return "var(--warning)";
    case "MISSING":
      return "var(--unknown)";
    default:
      return "var(--success)";
  }
}

function drilldownUrl(tenantId: string, siteId: string, extra: Record<string, string>): string {
  const query = new URLSearchParams({ tenant: tenantId, site: siteId, ...extra });
  return `/devices?${query.toString()}`;
}

function PlaceholderWidget({
  id,
  title,
  emptyMessage,
  failure,
}: {
  id: string;
  title: string;
  emptyMessage: string;
  failure?: { title: string; message: string; traceId?: string; retryable: boolean; code: string };
}) {
  return (
    <WidgetFrame title={title} id={id}>
      {failure ? <ErrorView failure={failure} compact /> : <EmptyView title={emptyMessage} />}
    </WidgetFrame>
  );
}

export function OverviewScreen() {
  const { tenantId, siteId, range } = useSessionContext();
  const { locale, messages } = useI18n();
  const router = useRouter();
  const bucket = defaultBucketForRange(range);

  const overviewQuery = useOverviewQuery(tenantId, siteId, range);
  const seriesQuery = useEnvironmentSeriesQuery(tenantId, siteId, range, bucket);
  useRequiredSnapshot({
    routeKey: `overview:${tenantId}:${siteId}`,
    ready: overviewQuery.isSuccess,
    revalidate: async () => (await overviewQuery.refetch()).isSuccess,
  });

  if (overviewQuery.isLoading && !overviewQuery.data) {
    return <OverviewSkeleton />;
  }

  if (overviewQuery.isError && !overviewQuery.data) {
    const error = overviewQuery.error;
    return (
      <ErrorView
        failure={{
          code: "OVERVIEW_LOAD_FAILED",
          title: isHttpError(error) ? problemTitle(error.problem, messages) : messages.errors.genericTitle,
          message: isHttpError(error) && error.problem?.detail ? error.problem.detail : messages.overview.loadFailed,
          traceId: isHttpError(error) ? error.traceId : undefined,
          retryable: true,
        }}
        onRetry={() => overviewQuery.refetch()}
      />
    );
  }

  if (!overviewQuery.data) return null;

  const timezone = overviewQuery.data.context.timezone;
  const view = mapOverviewResponse(overviewQuery.data, timezone, locale, messages);
  const seriesView = seriesQuery.data ? mapTelemetrySeriesResponse(seriesQuery.data, locale) : null;

  const stale =
    view.context.generatedAt &&
    overviewQuery.data.widgets.deviceStatus.meta.status === "STALE";

  const kpiOnClick = (kpi: KpiCardView) => {
    if (kpi.id === "deviceStatus") {
      router.push(drilldownUrl(tenantId, siteId, { connectivity: "ONLINE" }));
    } else if (kpi.id === "offlineDevices") {
      router.push(drilldownUrl(tenantId, siteId, { connectivity: "OFFLINE" }));
    } else if (kpi.id === "freshness") {
      router.push(drilldownUrl(tenantId, siteId, { freshness: "STALE" }));
    }
  };

  return (
    <div data-testid="overview-page" className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border-subtle/70 pb-5">
        <div>
          <PageHeading focusKey={`overview:${tenantId}:${siteId}`} className="text-2xl font-bold tracking-tight">
            {view.context.siteName}
          </PageHeading>
          <p className="text-xs text-text-muted">
            {formatCopy(messages.overview.lastUpdated, { time: view.context.generatedAt?.relativeLabel ?? "—" })} · {messages.overview.snapshot}{" "}
            <span className="mono">{view.context.dataVersion}</span>
          </p>
        </div>
        {stale ? <StaleBanner lastUpdatedAt={view.context.generatedAt} /> : null}
      </header>

      {view.partialFailures.length > 0 ? (
        <div
          role="status"
          className="rounded-lg border border-status-warning/30 bg-status-warning/10 px-3 py-2 text-xs text-status-warning"
        >
          {view.partialFailures.length === 1
            ? messages.overview.partialFailureOne
            : formatCopy(messages.overview.partialFailureMany, { count: view.partialFailures.length })}
        </div>
      ) : null}

      <section aria-label={messages.overview.keyMetrics} className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {view.kpis.map((kpi) => {
          const clickable = kpi.id === "deviceStatus" || kpi.id === "offlineDevices" || kpi.id === "freshness";
          return (
            <KpiCard
              key={kpi.id}
              id={kpi.id}
              title={kpi.title}
              primaryValue={kpi.primaryValue}
              secondaryLabel={kpi.secondaryLabel}
              tone={kpi.tone}
              meta={kpi.meta}
              onClick={clickable ? () => kpiOnClick(kpi) : undefined}
              actionLabel={
                kpi.id === "deviceStatus"
                  ? messages.overview.viewOnlineDevices
                  : kpi.id === "offlineDevices"
                    ? messages.overview.viewOfflineDevices
                    : messages.overview.viewStaleDevices
              }
            />
          );
        })}
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <WidgetFrame
          title={messages.overview.environmentTrend}
          id="environmentTrend"
          className="xl:col-span-8"
        >
          <TelemetryTrendChart
            testId="environment-trend-chart"
            series={seriesView?.series ?? []}
            timezone={timezone}
            rangeLabel={range}
            loading={seriesQuery.isLoading}
            error={
              seriesQuery.isError
                ? {
                    code: "SERIES_LOAD_FAILED",
                    title: isHttpError(seriesQuery.error) ? problemTitle(seriesQuery.error.problem, messages) : messages.overview.chartUnavailable,
                    message: messages.overview.historyLoadFailed,
                    traceId: isHttpError(seriesQuery.error) ? seriesQuery.error.traceId : undefined,
                    retryable: true,
                  }
                : undefined
            }
            onRetry={() => seriesQuery.refetch()}
            emptyMessage={messages.empty.noTelemetry}
            height={320}
          />
        </WidgetFrame>

        <WidgetFrame title={messages.overview.currentConditions} id="currentConditions" className="xl:col-span-4">
          <div className="flex flex-col gap-4">
            {view.currentConditions.length === 0 ? (
              <EmptyView title={messages.empty.noTelemetry} />
            ) : (
              view.currentConditions.map((zone) => (
                <div key={zone.zoneId} className="rounded-lg bg-console-surface-2 p-3">
                  <p className="text-xs font-semibold text-text-secondary">{zone.zoneName}</p>
                  <ul className="mt-2 flex flex-col gap-1.5">
                    {zone.metrics.map((metric) => (
                      <li key={metric.code} className="flex items-center justify-between gap-2 text-xs">
                        <span className="text-text-muted">{metric.label}</span>
                        <span className="numeral flex items-center gap-1.5 text-text-primary">
                          {metric.value}
                          {metric.unit ? <span className="text-text-muted">{metric.unit}</span> : null}
                          <span
                            role="img"
                            aria-label={formatCopy(messages.overview.quality, { quality: messages.quality[metric.quality] })}
                            className="inline-block size-1.5 rounded-full"
                            style={{ backgroundColor: qualityColor(metric.quality) }}
                          />
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}
          </div>
        </WidgetFrame>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="xl:col-span-7">
          {view.placeholders
            .filter((placeholder) => placeholder.id === "activeAlarmList")
            .map((placeholder) => (
              <PlaceholderWidget
                key={placeholder.id}
                id={placeholder.id}
                title={placeholder.title}
                emptyMessage={placeholder.meta.failure ? placeholder.meta.failure.title : placeholder.emptyMessage}
                failure={placeholder.meta.failure}
              />
            ))}
        </div>

        <WidgetFrame title={messages.overview.deviceHealth} id="deviceHealth" className="xl:col-span-5">
          <div className="flex flex-col gap-2" role="list">
            <p className="text-xs text-text-muted">
              {view.deviceHealth.total === 1
                ? messages.overview.deviceCountOne
                : formatCopy(messages.overview.deviceCountMany, { count: view.deviceHealth.total })}
            </p>
            {view.deviceHealth.segments.map((segment) => (
              <div key={segment.status} role="listitem">
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-2 text-text-secondary">
                    <span
                      aria-hidden="true"
                      className="inline-block size-2 rounded-full"
                      style={{
                        backgroundColor:
                          segment.status === "ONLINE"
                            ? "var(--success)"
                            : segment.status === "OFFLINE"
                              ? "var(--critical)"
                              : segment.status === "DEGRADED"
                                ? "var(--warning)"
                                : "var(--unknown)",
                      }}
                    />
                    {connectivityStatus(segment.status, messages).label}
                  </span>
                  <span className="numeral text-text-primary">
                    {segment.count} · {segment.ratioLabel}
                  </span>
                </div>
                <div className="mt-1 h-1.5 w-full rounded-full bg-console-surface-2">
                  <div
                    className="h-1.5 rounded-full"
                    style={{
                      width: segment.ratioLabel,
                      backgroundColor:
                        segment.status === "ONLINE"
                          ? "var(--success)"
                          : segment.status === "OFFLINE"
                            ? "var(--critical)"
                            : segment.status === "DEGRADED"
                              ? "var(--warning)"
                              : "var(--unknown)",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </WidgetFrame>
      </section>

    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div className="space-y-6" aria-hidden="true">
      <div className="h-10 w-64 animate-pulse rounded-lg bg-console-surface-2" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-28 animate-pulse rounded-2xl bg-console-surface-1" />
        ))}
      </div>
      <div className="h-[380px] animate-pulse rounded-2xl bg-console-surface-1" />
    </div>
  );
}

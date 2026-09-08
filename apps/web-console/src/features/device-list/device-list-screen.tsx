"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { SearchX } from "lucide-react";
import { useSessionContext } from "@/features/session";
import { isHttpError, problemTitle } from "@/shared/api/http/problem";
import { connectivityStatus, readinessStatus } from "@/shared/lib/labels";
import { useI18n } from "@/shared/i18n";
import { DataTable, type DataTableColumn } from "@/shared/ui/data-table";
import { StatusBadge } from "@/shared/ui/badge";
import { ErrorView, EmptyView } from "@/shared/ui/feedback";
import { Button } from "@/shared/ui/button";
import { Skeleton } from "@/shared/ui/skeleton";
import { mapDeviceSummary, type DeviceRowView } from "./device.mapper";
import { useDevicesQuery } from "./use-devices";
import { useDeviceListFilters, type DeviceFilterKey } from "./use-device-filters";
import { useRequiredSnapshot } from "@/shared/realtime/snapshot-coordinator";
import { PageHeading } from "@/shared/ui/page-heading";

function FilterChips({
  filters,
  setFilter,
  clearFilters,
}: {
  filters: ReturnType<typeof useDeviceListFilters>["filters"];
  setFilter: (key: DeviceFilterKey, value: string | undefined) => void;
  clearFilters: () => void;
}) {
  const { messages } = useI18n();
  const [queryInput, setQueryInput] = useState(filters.query ?? "");
  const [typeInput, setTypeInput] = useState(filters.deviceType ?? "");
  const [queryUrlValue, setQueryUrlValue] = useState(filters.query);
  const [typeUrlValue, setTypeUrlValue] = useState(filters.deviceType);

  if (filters.query !== queryUrlValue) {
    setQueryUrlValue(filters.query);
    setQueryInput(filters.query ?? "");
  }

  if (filters.deviceType !== typeUrlValue) {
    setTypeUrlValue(filters.deviceType);
    setTypeInput(filters.deviceType ?? "");
  }

  useEffect(() => {
    const nextQuery = queryInput || undefined;
    if (nextQuery === filters.query) return;

    const scheduledPathname = window.location.pathname;
    const timer = window.setTimeout(() => {
      if (window.location.pathname !== scheduledPathname) return;
      setFilter("query", nextQuery);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [filters.query, queryInput, setFilter]);

  useEffect(() => {
    const nextDeviceType = typeInput || undefined;
    if (nextDeviceType === filters.deviceType) return;

    const scheduledPathname = window.location.pathname;
    const timer = window.setTimeout(() => {
      if (window.location.pathname !== scheduledPathname) return;
      setFilter("deviceType", nextDeviceType);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [filters.deviceType, setFilter, typeInput]);

  const selectClass =
    "min-h-9 rounded-lg border border-border-subtle bg-console-bg px-2 py-1.5 text-sm text-text-primary focus:outline-none";

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border-subtle bg-console-surface-1/70 p-3 sm:p-4">
      <label className="flex flex-col gap-1 text-sm text-text-secondary">
        {messages.devices.search}
        <input
          type="search"
          value={queryInput}
          onChange={(event) => setQueryInput(event.target.value)}
          placeholder={messages.devices.searchPlaceholder}
          className="min-h-9 w-52 rounded-lg border border-border-subtle bg-console-bg px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-text-secondary">
        {messages.devices.deviceType}
        <input
          type="text"
          value={typeInput}
          onChange={(event) => setTypeInput(event.target.value)}
          placeholder={messages.devices.deviceTypePlaceholder}
          className="min-h-9 w-40 rounded-lg border border-border-subtle bg-console-bg px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-text-secondary">
        {messages.devices.protocol}
        <select
          className={selectClass}
          value={filters.protocol ?? ""}
          onChange={(event) => setFilter("protocol", event.target.value || undefined)}
        >
          <option value="">{messages.devices.all}</option>
          <option value="MQTT">MQTT</option>
          <option value="TCP_BINARY">TCP Binary</option>
          <option value="HTTP_POLLING">HTTP Polling</option>
          <option value="ONVIF">ONVIF</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm text-text-secondary">
        {messages.devices.connectivity}
        <select
          className={selectClass}
          value={filters.connectivity ?? ""}
          onChange={(event) => setFilter("connectivity", event.target.value || undefined)}
        >
          <option value="">{messages.devices.all}</option>
          <option value="ONLINE">{messages.states.online}</option>
          <option value="OFFLINE">{messages.states.offline}</option>
          <option value="DEGRADED">{messages.states.degraded}</option>
          <option value="UNKNOWN">{messages.states.unknown}</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm text-text-secondary">
        {messages.devices.readiness}
        <select
          className={selectClass}
          value={filters.readiness ?? ""}
          onChange={(event) => setFilter("readiness", event.target.value || undefined)}
        >
          <option value="">{messages.devices.all}</option>
          <option value="READY">{messages.states.ready}</option>
          <option value="NOT_READY">{messages.states.notReady}</option>
          <option value="FAULTED">{messages.states.faulted}</option>
          <option value="MAINTENANCE">{messages.states.maintenance}</option>
          <option value="UNKNOWN">{messages.states.unknown}</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm text-text-secondary">
        {messages.devices.freshness}
        <select
          className={selectClass}
          value={filters.freshness ?? ""}
          onChange={(event) => setFilter("freshness", event.target.value || undefined)}
        >
          <option value="">{messages.devices.all}</option>
          <option value="FRESH">{messages.freshness.FRESH}</option>
          <option value="STALE">{messages.freshness.STALE}</option>
          <option value="UNKNOWN">{messages.freshness.UNKNOWN}</option>
        </select>
      </label>
      <Button variant="ghost" size="sm" onClick={clearFilters}>
        <SearchX className="size-4" aria-hidden="true" />
        {messages.actions.clearFilters}
      </Button>
    </div>
  );
}

export function DeviceListScreen() {
  const { tenantId, siteId } = useSessionContext();
  const { locale, messages } = useI18n();
  const { filters, cursor, hasActiveFilters, setFilter, clearFilters, setCursor } =
    useDeviceListFilters();

  const query = useDevicesQuery(tenantId, siteId, filters, cursor);
  useRequiredSnapshot({
    routeKey: `devices:${tenantId}:${siteId}`,
    ready: query.isSuccess && !query.isPlaceholderData,
    revalidate: async () => (await query.refetch()).isSuccess,
  });

  const timezone = "UTC";
  const rows = useMemo(
    () => (query.data ? query.data.items.map((item) => mapDeviceSummary(item, timezone, locale)) : []),
    [query.data, timezone, locale],
  );

  if (query.isLoading && !query.data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  const permissionFailure =
    query.isError &&
    isHttpError(query.error) &&
    (query.error.status === 401 || query.error.status === 403);

  if (query.isError && (!query.data || permissionFailure)) {
    const error = query.error;
    return (
      <ErrorView
        failure={{
          code: "DEVICE_LIST_FAILED",
          title: isHttpError(error) ? problemTitle(error.problem, messages) : messages.errors.genericTitle,
          message: isHttpError(error) && error.problem?.detail ? error.problem.detail : messages.devices.loadFailed,
          traceId: isHttpError(error) ? error.traceId : undefined,
          retryable: true,
        }}
        onRetry={() => query.refetch()}
      />
    );
  }

  const columns: DataTableColumn<DeviceRowView>[] = [
    {
      id: "name",
      header: messages.devices.nameExternalId,
      cell: (row) => (
        <Link
          href={`/devices/${row.id}?tenant=${tenantId}&site=${siteId}`}
          className="group flex flex-col rounded-sm"
        >
          <span className="text-sm font-semibold text-text-primary group-hover:text-accent-primary group-focus-visible:text-accent-primary">{row.name}</span>
          <span className="mono text-xs text-text-muted">{row.externalId}</span>
        </Link>
      ),
    },
    { id: "type", header: messages.devices.deviceType, cell: (row) => row.typeLabel },
    {
      id: "site",
      header: messages.devices.siteZone,
      cell: (row) => (
        <div className="flex flex-col">
          <span>{row.siteLabel}</span>
          <span className="text-[11px] text-text-muted">{row.zoneLabel ?? "—"}</span>
        </div>
      ),
    },
    { id: "protocol", header: messages.devices.protocol, cell: (row) => row.protocol.replace("_", " ") },
    {
      id: "connectivity",
      header: messages.devices.connectivity,
      cell: (row) => {
        const s = connectivityStatus(row.connectivity as never, messages);
        return <StatusBadge label={s.label} tone={s.tone} size="sm" />;
      },
    },
    {
      id: "readiness",
      header: messages.devices.readiness,
      cell: (row) => {
        const s = readinessStatus(row.readiness as never, messages);
        return <StatusBadge label={s.label} tone={s.tone} size="sm" showDot={false} />;
      },
    },
    {
      id: "latest",
      header: messages.devices.latestMetric,
      cell: (row) =>
        row.latestMetric ? (
          <span className="numeral">
            {row.latestMetric.value}
            {row.latestMetric.unit ? ` ${row.latestMetric.unit}` : ""}
          </span>
        ) : (
          "—"
        ),
    },
    {
      id: "lastSeen",
      header: messages.devices.lastSeen,
      cell: (row) => (row.lastSeenAt ? row.lastSeenAt.relativeLabel : "—"),
      hideBelow: "lg",
    },
    {
      id: "alarms",
      header: messages.devices.activeAlarms,
      align: "right",
      cell: (row) => <span className="numeral">{row.activeAlarmCount}</span>,
      hideBelow: "lg",
    },
  ];

  const emptyView = hasActiveFilters ? (
    <EmptyView title={messages.empty.noDeviceMatches} action={<Button variant="secondary" size="sm" onClick={clearFilters}>{messages.actions.clearFilters}</Button>} />
  ) : (
    <EmptyView title={messages.empty.noDevices} />
  );

  return (
    <div className="space-y-4">
      <header>
        <PageHeading focusKey={`devices:${tenantId}:${siteId}`} className="text-2xl font-bold tracking-tight">{messages.devices.title}</PageHeading>
        <p className="mt-1 text-sm text-text-muted">{messages.devices.subtitle}</p>
      </header>
      <div className="space-y-4 rounded-2xl border border-border-subtle/70 bg-console-surface-1/30 p-3 sm:p-4" data-testid="device-table">
        <FilterChips filters={filters} setFilter={setFilter} clearFilters={clearFilters} />
        <DataTable
          rows={rows}
          columns={columns}
          getRowId={(row) => row.id}
          emptyView={emptyView}
          loading={false}
          nextCursor={query.data?.page.hasNext ? query.data.page.nextCursor : null}
          onNextPage={() => setCursor(query.data?.page.nextCursor ?? undefined)}
          ariaLabel={messages.devices.table}
        />
      </div>
    </div>
  );
}

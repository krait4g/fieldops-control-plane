"use client";

import { useEffect, useMemo, useState } from "react";
import { useSessionContext } from "@/features/session";
import { isHttpError, problemTitle } from "@/shared/api/http/problem";
import { memberStatusLabelOf } from "@/shared/lib/labels";
import { DataTable, type DataTableColumn } from "@/shared/ui/data-table";
import { StatusBadge } from "@/shared/ui/badge";
import { ErrorView, EmptyView, PermissionView } from "@/shared/ui/feedback";
import { Button } from "@/shared/ui/button";
import { Skeleton } from "@/shared/ui/skeleton";
import { mapMemberSummary, type MemberRowView } from "./member.mapper";
import { useMembersQuery } from "./use-members";
import { useMemberListFilters, type MemberFilterKey } from "./use-member-filters";
import { PageHeading } from "@/shared/ui/page-heading";
import { useI18n } from "@/shared/i18n";

function MemberFiltersBar({
  filters,
  sites,
  setFilter,
  clearFilters,
}: {
  filters: ReturnType<typeof useMemberListFilters>["filters"];
  sites: Array<{ id: string; label: string }>;
  setFilter: (key: MemberFilterKey, value: string | undefined) => void;
  clearFilters: () => void;
}) {
  const [queryInput, setQueryInput] = useState(filters.query ?? "");
  const { messages } = useI18n();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setFilter("query", queryInput || undefined);
    }, 300);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryInput]);

  const selectClass =
    "min-h-10 w-full rounded-lg border border-border-subtle bg-console-bg px-3 py-2 text-sm text-text-primary focus:outline-none sm:w-auto";

  return (
    <div className="grid grid-cols-1 gap-3 rounded-xl border border-border-subtle bg-console-surface-1/70 p-3 sm:flex sm:flex-wrap sm:items-end sm:p-4">
      <label className="flex min-w-0 flex-col gap-1 text-sm text-text-secondary">
        {messages.members.search}
        <input
          type="search"
          value={queryInput}
          onChange={(event) => setQueryInput(event.target.value)}
          placeholder={messages.members.searchPlaceholder}
          className="min-h-10 w-full rounded-lg border border-border-subtle bg-console-bg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none sm:w-56"
        />
      </label>
      <label className="flex min-w-0 flex-col gap-1 text-sm text-text-secondary">
        {messages.members.role}
        <select className={selectClass} value={filters.role ?? ""} onChange={(event) => setFilter("role", event.target.value || undefined)}>
          <option value="">{messages.members.all}</option>
          <option value="TENANT_VIEWER">{messages.roles.TENANT_VIEWER}</option>
          <option value="SITE_OPERATOR">{messages.roles.SITE_OPERATOR}</option>
          <option value="COMMAND_APPROVER">{messages.roles.COMMAND_APPROVER}</option>
          <option value="TENANT_ADMIN">{messages.roles.TENANT_ADMIN}</option>
          <option value="PLATFORM_ADMIN">{messages.roles.PLATFORM_ADMIN}</option>
        </select>
      </label>
      <label className="flex min-w-0 flex-col gap-1 text-sm text-text-secondary">
        {messages.members.status}
        <select className={selectClass} value={filters.status ?? ""} onChange={(event) => setFilter("status", event.target.value || undefined)}>
          <option value="">{messages.members.all}</option>
          <option value="ACTIVE">{messages.memberStates.ACTIVE}</option>
          <option value="SUSPENDED">{messages.memberStates.SUSPENDED}</option>
          <option value="INVITED">{messages.memberStates.INVITED}</option>
        </select>
      </label>
      <label className="flex min-w-0 flex-col gap-1 text-sm text-text-secondary">
        {messages.members.site}
        <select className={selectClass} value={filters.siteId ?? ""} onChange={(event) => setFilter("siteId", event.target.value || undefined)}>
          <option value="">{messages.members.allSites}</option>
          {sites.map((site) => (
            <option key={site.id} value={site.id}>
              {site.label}
            </option>
          ))}
        </select>
      </label>
      <Button variant="ghost" size="sm" onClick={clearFilters}>
        {messages.actions.clearFilters}
      </Button>
    </div>
  );
}

export function MemberListScreen() {
  const { tenantId, permissions, sites } = useSessionContext();
  const { locale, messages } = useI18n();
  const { filters, cursor, hasActiveFilters, setFilter, clearFilters, setCursor } =
    useMemberListFilters();

  const canView = permissions.includes("MEMBER_READ");

  const query = useMembersQuery(tenantId, filters, cursor);
  const rows = useMemo(
    () => (query.data ? query.data.items.map((item) => mapMemberSummary(item, "UTC", locale, messages)) : []),
    [query.data, locale, messages],
  );

  if (!canView) {
    return <PermissionView />;
  }

  if (query.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  if (query.isError) {
    const error = query.error;
    if (isHttpError(error) && error.status === 403) return <PermissionView />;
    return (
      <ErrorView
        failure={{
          code: "MEMBER_LIST_FAILED",
          title: isHttpError(error) ? problemTitle(error.problem, messages) : messages.errors.genericTitle,
          message: isHttpError(error) && error.problem?.detail ? error.problem.detail : messages.members.loadFailed,
          traceId: isHttpError(error) ? error.traceId : undefined,
          retryable: true,
        }}
        onRetry={() => query.refetch()}
      />
    );
  }

  const columns: DataTableColumn<MemberRowView>[] = [
    {
      id: "name",
      header: messages.members.name,
      cell: (row) => <span className="font-medium text-text-primary">{row.displayName}</span>,
    },
    { id: "email", header: messages.members.email, cell: (row) => <span className="mono text-xs">{row.email}</span> },
    { id: "role", header: messages.members.role, cell: (row) => row.roleLabel },
    {
      id: "scope",
      header: messages.members.siteScope,
      cell: (row) => row.siteScopeLabel,
      minWidth: 200,
    },
    {
      id: "status",
      header: messages.members.status,
      cell: (row) => {
        const s = memberStatusLabelOf(row.status, messages);
        return <StatusBadge label={s.label} tone={s.tone} size="sm" />;
      },
    },
    { id: "lastLogin", header: messages.members.lastLogin, cell: (row) => row.lastLoginAtLabel, hideBelow: "lg" },
    { id: "updatedBy", header: messages.members.updatedBy, cell: (row) => row.updatedByLabel, hideBelow: "xl" },
  ];

  const emptyView = hasActiveFilters ? (
    <EmptyView title={messages.members.noMatches} action={<Button variant="secondary" size="sm" onClick={clearFilters}>{messages.actions.clearFilters}</Button>} />
  ) : (
    <EmptyView title={messages.empty.noMembers} />
  );

  return (
    <div className="space-y-4">
      <header>
        <PageHeading focusKey={`members:${tenantId}`} className="max-w-full text-2xl font-bold tracking-tight">{messages.members.title}</PageHeading>
        <p className="mt-1 text-sm text-text-muted">{messages.members.subtitle}</p>
      </header>
      <div className="min-w-0 space-y-4" data-testid="member-table">
        <MemberFiltersBar filters={filters} sites={sites} setFilter={setFilter} clearFilters={clearFilters} />
        <div className="hidden sm:block">
          <DataTable
            rows={rows}
            columns={columns}
            getRowId={(row) => row.id}
            emptyView={emptyView}
            loading={false}
            nextCursor={query.data?.page.hasNext ? query.data.page.nextCursor : null}
            onNextPage={() => setCursor(query.data?.page.nextCursor ?? undefined)}
            ariaLabel={messages.members.table}
          />
        </div>
        <div className="grid min-w-0 gap-3 sm:hidden" role="list" aria-label={messages.members.table}>
          {rows.length === 0 ? emptyView : rows.map((row) => {
            const status = memberStatusLabelOf(row.status, messages);
            return (
              <article key={row.id} role="listitem" className="min-w-0 rounded-xl border border-border-subtle bg-console-surface-1 p-4">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-semibold text-text-primary">{row.displayName}</h2>
                    <p className="mono truncate text-xs text-text-muted">{row.email}</p>
                  </div>
                  <StatusBadge label={status.label} tone={status.tone} size="sm" />
                </div>
                <dl className="mt-4 grid gap-3 text-sm">
                  <div><dt className="text-xs text-text-muted">{messages.members.role}</dt><dd className="mt-0.5 text-text-primary">{row.roleLabel}</dd></div>
                  <div><dt className="text-xs text-text-muted">{messages.members.siteScope}</dt><dd className="mt-0.5 break-words text-text-primary">{row.siteScopeLabel}</dd></div>
                </dl>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}

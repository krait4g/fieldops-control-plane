"use client";

import { Suspense, useCallback, useEffect, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { CopyCatalog } from "@/shared/lib/copy";
import { roleLabel } from "@/shared/lib/labels";
import { useI18n } from "@/shared/i18n";
import type {
  AppShellUserView,
  ContextOptionView,
  NavigationItemView,
  TimeRange,
} from "@/shared/lib/view-models";
import { isHttpError } from "@/shared/api/http/problem";
import { fieldOpsClient } from "@/shared/api/http/client";
import { getQueryClient } from "@/shared/providers/query-client";
import { usesMock } from "@/shared/api/bootstrap";
import type { SessionMembership, SessionResponse } from "@/shared/api/types";
import { AppShell } from "@/widgets/app-shell";
import { ErrorView, PermissionView } from "@/shared/ui/feedback";
import { Skeleton } from "@/shared/ui/skeleton";
import { SessionContext, type SessionContextValue } from "./session-context";
import { useSessionQuery } from "./use-session";
import { membershipForTenant, resolveContext, type ResolvedContext } from "./context-resolution";
import { parseRange } from "./url-state";
import { cameraCopy } from "@/shared/lib/camera-copy";
import { useSiteEvents } from "@/shared/realtime/use-site-events";
import {
  RequiredSnapshotProvider,
  useRequiredSnapshotCoordinator,
} from "@/shared/realtime/snapshot-coordinator";

function buildNavigation(permissions: string[], messages: CopyCatalog, cameraLabel: string): NavigationItemView[] {
  const entries = [
    { id: "overview", label: messages.navigation.overview, href: "/overview", iconName: "overview", required: "OVERVIEW_READ" },
    { id: "devices", label: messages.navigation.devices, href: "/devices", iconName: "devices", required: "DEVICE_READ" },
    { id: "cameras", label: cameraLabel, href: "/cameras", iconName: "cameras", required: "CAMERA_READ" },
    { id: "members", label: messages.navigation.members, href: "/admin/members", iconName: "members", required: "MEMBER_READ" },
  ];
  return entries.map((entry) => ({
    id: entry.id,
    label: entry.label,
    href: entry.href,
    iconName: entry.iconName,
    active: false,
    disabled: false,
    hidden: !permissions.includes(entry.required),
  }));
}

function buildContextPath(
  pathname: string,
  params: { tenant?: string; site?: string | null; range?: string },
): string {
  const query: string[] = [];
  if (params.tenant) query.push(`tenant=${encodeURIComponent(params.tenant)}`);
  if (params.site) query.push(`site=${encodeURIComponent(params.site)}`);
  if (params.range) query.push(`range=${encodeURIComponent(params.range)}`);
  return query.length > 0 ? `${pathname}?${query.join("&")}` : pathname;
}

function isRangeRoute(pathname: string): boolean {
  return pathname === "/overview" || /^\/devices\/[^/]+$/.test(pathname);
}

function isRealtimeRoute(pathname: string): boolean {
  return pathname === "/overview" || pathname === "/devices" || /^\/devices\/[^/]+$/.test(pathname);
}

interface AuthedShellProps {
  session: SessionResponse;
  membership: SessionMembership;
  resolved: ResolvedContext;
  pathname: string;
  range: TimeRange;
  revalidateSession: () => Promise<boolean>;
  children: React.ReactNode;
}

function AuthedShell({
  session,
  membership,
  resolved,
  pathname,
  range,
  revalidateSession,
  children,
}: AuthedShellProps) {
  const router = useRouter();
  const { locale, messages } = useI18n();
  const { snapshotReady, revalidateRequiredSnapshot } = useRequiredSnapshotCoordinator();

  const realtime = useSiteEvents({
    tenantId: resolved.tenantId,
    siteId: resolved.siteId ?? "",
    enabled:
      isRealtimeRoute(pathname) &&
      (pathname === "/overview"
        ? membership.permissions.includes("OVERVIEW_READ")
        : membership.permissions.includes("DEVICE_READ")),
    snapshotReady,
    revalidateRequiredSnapshot,
    revalidateSession,
  });

  const logout = useCallback(async () => {
    realtime.close();
    try {
      await fieldOpsClient.logout();
    } finally {
      getQueryClient().clear();
      router.replace("/login");
    }
  }, [router, realtime]);

  const user: AppShellUserView = {
    displayName: session.user.displayName,
    email: session.user.email,
    roleLabel: roleLabel(membership.role, messages),
  };

  const tenants: ContextOptionView[] = session.memberships.map((item) => ({
    id: item.tenant.id,
    label: item.tenant.name,
    disabled: item.tenant.id !== resolved.tenantId && item.sites.length === 0,
  }));

  const sites: ContextOptionView[] = membership.sites.map((site) => ({
    id: site.id,
    label: site.name,
  }));

  const setTenant = useCallback(
    (tenantId: string) => {
      const next = membershipForTenant(session, tenantId);
      if (!next) return;
      realtime.close();
      const firstSite = next.sites[0]?.id ?? "";
      router.replace(
        buildContextPath(pathname, {
          tenant: tenantId,
          site: firstSite,
          range: isRangeRoute(pathname) ? range : undefined,
        }),
        { scroll: false },
      );
    },
    [session, pathname, range, router, realtime],
  );

  const setSite = useCallback(
    (siteId: string) => {
      realtime.close();
      router.replace(
        buildContextPath(pathname, {
          tenant: resolved.tenantId,
          site: siteId,
          range: isRangeRoute(pathname) ? range : undefined,
        }),
        { scroll: false },
      );
    },
    [resolved, pathname, range, router, realtime],
  );

  const setRange = useCallback(
    (nextRange: TimeRange) => {
      router.replace(
        buildContextPath(pathname, {
          tenant: resolved.tenantId,
          site: resolved.siteId ?? "",
          range: nextRange,
        }),
        { scroll: false },
      );
    },
    [resolved, pathname, router],
  );

  const rangeVisible = isRangeRoute(pathname);

  const sectionLabel = pathname.startsWith("/admin/members")
    ? messages.navigation.members
    : pathname.startsWith("/cameras")
      ? cameraCopy[locale].navigation
    : pathname.startsWith("/devices")
      ? messages.navigation.devices
      : messages.navigation.overview;

  const value: SessionContextValue = {
    session,
    tenantId: resolved.tenantId,
    siteId: resolved.siteId ?? "",
    tenants,
    sites,
    user,
    permissions: membership.permissions,
    range,
    rangeVisible,
    liveStatus: realtime.status,
    snapshotStale: realtime.snapshotStale,
    setTenant,
    setSite,
    setRange,
  };

  return (
    <SessionContext.Provider value={value}>
      <AppShell
        navigation={buildNavigation(membership.permissions, messages, cameraCopy[locale].navigation)}
        breadcrumb={[{ label: sectionLabel }]}
        tenants={tenants}
        sites={sites}
        selectedTenantId={resolved.tenantId}
        selectedSiteId={resolved.siteId}
        selectedRange={range}
        liveStatus={realtime.status}
        user={user}
        rangeVisible={rangeVisible}
        onTenantChange={setTenant}
        onSiteChange={setSite}
        onRangeChange={setRange}
        onRetryLive={realtime.retry}
        onLogout={usesMock() ? undefined : logout}
        snapshotStale={realtime.snapshotStale}
        dataModeLabel={usesMock() ? messages.shell.demoData : undefined}
      >
        {children}
      </AppShell>
    </SessionContext.Provider>
  );
}

function SessionGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { messages } = useI18n();

  const tenantParam = searchParams.get("tenant");
  const siteParam = searchParams.get("site");
  const rangeParam = searchParams.get("range");
  const range = parseRange(rangeParam);

  const sessionQuery = useSessionQuery();
  const session = sessionQuery.data;
  const revalidateSession = useCallback(async () => {
    const result = await sessionQuery.refetch();
    return result.isSuccess;
  }, [sessionQuery]);

  const resolved = useMemo(
    () => (session ? resolveContext(session, tenantParam, siteParam) : null),
    [session, tenantParam, siteParam],
  );

  useEffect(() => {
    if (!session || !resolved || !resolved.hasAccessibleSite) return;
    const site = resolved.siteId ?? "";
    const rangeMatches = isRangeRoute(pathname) ? rangeParam === range : true;
    if (tenantParam === resolved.tenantId && siteParam === site && rangeMatches) return;
    router.replace(
      buildContextPath(pathname, {
        tenant: resolved.tenantId,
        site,
        range: isRangeRoute(pathname) ? range : undefined,
      }),
      { scroll: false },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, resolved, tenantParam, siteParam, range, pathname, router]);

  useEffect(() => {
    if (sessionQuery.isError && isHttpError(sessionQuery.error) && sessionQuery.error.status === 401) {
      const qs = searchParams.toString();
      const returnTo = encodeURIComponent(pathname + (qs ? `?${qs}` : ""));
      router.replace(`/login?returnTo=${returnTo}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionQuery.isError, sessionQuery.error, pathname, router]);

  if (sessionQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-console-bg p-6">
        <div className="w-full max-w-xl space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-56 w-full" />
        </div>
      </div>
    );
  }

  if (sessionQuery.isError) {
    const error = sessionQuery.error;
    if (isHttpError(error) && error.status === 401) return null;
    return (
      <div className="flex min-h-screen items-center justify-center bg-console-bg p-6">
        <ErrorView
          failure={{
            code: "SESSION_LOAD_FAILED",
            title: isHttpError(error) && error.problem?.title ? error.problem.title : messages.errors.genericTitle,
            message: messages.common.sessionLoadFailed,
            traceId: isHttpError(error) ? error.traceId : undefined,
            retryable: true,
          }}
          onRetry={() => sessionQuery.refetch()}
        />
      </div>
    );
  }

  if (!session || !resolved) return null;

  if (!resolved.hasAccessibleSite) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-console-bg p-6 text-center">
        <PermissionView />
        <p className="text-sm text-text-muted">
          {messages.common.noAccessibleSite}
        </p>
      </div>
    );
  }

  const membership = membershipForTenant(session, resolved.tenantId);
  if (!membership) return null;

  const snapshotScopeKey = `${resolved.tenantId}:${resolved.siteId ?? ""}:${pathname}`;
  return (
    <RequiredSnapshotProvider key={snapshotScopeKey}>
      <AuthedShell
        session={session}
        membership={membership}
        resolved={resolved}
        pathname={pathname}
        range={range}
        revalidateSession={revalidateSession}
      >
        {children}
      </AuthedShell>
    </RequiredSnapshotProvider>
  );
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <SessionGate>{children}</SessionGate>
    </Suspense>
  );
}

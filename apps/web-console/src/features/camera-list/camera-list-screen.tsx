"use client";

import Link from "next/link";
import { Camera, MapPin } from "lucide-react";
import { useSessionContext } from "@/features/session";
import { useI18n } from "@/shared/i18n";
import { cameraCopy } from "@/shared/lib/camera-copy";
import { isHttpError, problemTitle } from "@/shared/api/http/problem";
import { Card } from "@/shared/ui/card";
import { EmptyView, ErrorView, PermissionView } from "@/shared/ui/feedback";
import { PageHeading } from "@/shared/ui/page-heading";
import { Skeleton } from "@/shared/ui/skeleton";
import { StatusBadge } from "@/shared/ui/badge";
import { useCamerasQuery } from "./use-cameras";

export function CameraListScreen() {
  const { tenantId, siteId } = useSessionContext();
  const { locale, messages } = useI18n();
  const copy = cameraCopy[locale];
  const query = useCamerasQuery(tenantId, siteId);

  if (query.isLoading) {
    return <div className="space-y-4"><Skeleton className="h-12 w-64" /><Skeleton className="h-48 w-full" /></div>;
  }
  if (query.isError) {
    if (isHttpError(query.error) && query.error.status === 403) return <PermissionView />;
    return <ErrorView failure={{
      code: "CAMERA_LIST_FAILED",
      title: isHttpError(query.error) ? problemTitle(query.error.problem, messages) : messages.errors.genericTitle,
      message: copy.loadFailed,
      traceId: isHttpError(query.error) ? query.error.traceId : undefined,
      retryable: true,
    }} onRetry={() => query.refetch()} />;
  }

  return (
    <div className="space-y-5" data-testid="camera-list-screen">
      <header>
        <PageHeading focusKey={`cameras:${tenantId}:${siteId}`} className="text-2xl font-bold tracking-tight">
          {copy.title}
        </PageHeading>
        <p className="mt-1 text-sm text-text-muted">{copy.subtitle}</p>
      </header>
      {query.data?.items.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {query.data.items.map((camera) => (
            <Link key={camera.id} href={`/cameras/${camera.id}?tenant=${tenantId}&site=${siteId}`} className="group">
              <Card className="h-full transition-colors group-hover:border-accent-primary/60">
                <div className="mb-5 flex items-start justify-between gap-3">
                  <span className="inline-flex size-10 items-center justify-center rounded-xl bg-accent-primary/15 text-accent-primary">
                    <Camera className="size-5" aria-hidden="true" />
                  </span>
                  <StatusBadge label={camera.previewState === "READY" ? messages.states.live : messages.states.disconnected}
                    tone={camera.previewState === "READY" ? "success" : "critical"} size="sm" />
                </div>
                <h2 className="text-base font-semibold group-hover:text-accent-primary">{camera.name}</h2>
                <p className="mono mt-1 text-xs text-text-muted">{camera.id}</p>
                <div className="mt-4 flex items-center gap-2 text-sm text-text-secondary">
                  <MapPin className="size-4" aria-hidden="true" />
                  <span>{camera.zoneName}</span>
                </div>
                <div className="mt-4 border-t border-border-subtle pt-3 text-xs text-text-muted">
                  {copy.controlState}: {camera.controlState === "AVAILABLE" ? copy.available
                    : camera.controlState === "HELD" ? copy.held : copy.unavailable}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      ) : <EmptyView title={copy.empty} />}
    </div>
  );
}

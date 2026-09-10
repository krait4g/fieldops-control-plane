"use client";

import { useState } from "react";
import { Clock3, ShieldCheck, TerminalSquare } from "lucide-react";
import { useSessionContext } from "@/features/session";
import type { DurableCommandStatus } from "@/shared/api/types";
import { useI18n } from "@/shared/i18n";
import { commandCopy } from "@/shared/lib/command-copy";
import { Button } from "@/shared/ui/button";
import { Card, WidgetFrame } from "@/shared/ui/card";
import { EmptyView, ErrorView, PermissionView } from "@/shared/ui/feedback";
import { PageHeading } from "@/shared/ui/page-heading";
import { Skeleton } from "@/shared/ui/skeleton";
import { StatusBadge } from "@/shared/ui/badge";
import { isHttpError } from "@/shared/api/http/problem";
import { useCommandActions, useCommands } from "./use-commands";

function tone(status: DurableCommandStatus) {
  if (status === "SUCCEEDED") return "success" as const;
  if (status === "FAILED" || status === "REJECTED") return "critical" as const;
  if (status === "UNKNOWN") return "unknown" as const;
  if (status === "ACKNOWLEDGED") return "info" as const;
  return "warning" as const;
}

export function CommandListScreen() {
  const { tenantId, siteId, permissions } = useSessionContext();
  const { locale, messages } = useI18n();
  const copy = commandCopy[locale];
  const query = useCommands(tenantId, siteId);
  const actions = useCommandActions(tenantId, siteId);
  const [scenario, setScenario] = useState<"SUCCESS" | "REJECT" | "HANG">("SUCCESS");
  const canRequest = permissions.includes("DEVICE_COMMAND_REQUEST");
  const canApprove = permissions.includes("DEVICE_COMMAND_APPROVE");
  const error = actions.request.error ?? actions.approve.error ?? actions.reject.error;

  if (query.isLoading) return <div className="space-y-4"><Skeleton className="h-12 w-72" /><Skeleton className="h-64 w-full" /></div>;
  if (query.isError) {
    if (isHttpError(query.error) && query.error.status === 403) return <PermissionView />;
    return <ErrorView failure={{ code: "COMMAND_LIST_FAILED", title: messages.errors.genericTitle,
      message: copy.loadFailed, retryable: true }} onRetry={() => query.refetch()} />;
  }

  const request = (type: "OPEN" | "CLOSE") => actions.request.mutate({
    key: `b05-${crypto.randomUUID()}`,
    command: { siteId: "site-a", deviceId: "valve-a-01", type, scenario },
  });

  return <div className="space-y-5" data-testid="command-list-screen">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <PageHeading focusKey={`commands:${tenantId}:${siteId}`} className="text-2xl font-bold tracking-tight">
          {copy.title}
        </PageHeading>
        <p className="mt-1 text-sm text-text-muted">{copy.subtitle}</p>
      </div>
      <span className="text-xs text-text-muted">{copy.durableBoundary}</span>
    </header>

    {canRequest ? <WidgetFrame title={copy.request} id="command-request-panel">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm text-text-secondary">{copy.scenario}
          <select aria-label={copy.scenario} value={scenario} onChange={(event) => setScenario(event.target.value as typeof scenario)}
            className="mt-1 block h-9 rounded-lg border border-border-subtle bg-console-bg px-3 text-text-primary">
            <option value="SUCCESS">{copy.success}</option><option value="REJECT">{copy.rejectScenario}</option>
            <option value="HANG">{copy.hang}</option>
          </select>
        </label>
        <Button onClick={() => request("OPEN")} disabled={actions.request.isPending}>{copy.open}</Button>
        <Button variant="secondary" onClick={() => request("CLOSE")} disabled={actions.request.isPending}>{copy.close}</Button>
      </div>
      <p className="text-xs text-text-muted">{copy.pendingNotice}</p>
    </WidgetFrame> : null}

    {error ? <p role="alert" className="rounded-lg border border-status-critical/40 bg-status-critical/10 p-3 text-sm text-status-critical">
      {isHttpError(error) && error.problem?.detail ? error.problem.detail
        : canApprove ? copy.decisionFailed : copy.requestFailed}
    </p> : null}

    {query.data?.items.length ? <div className="space-y-4">
      {query.data.items.map((command) => <Card key={command.commandId} data-testid={`command-${command.commandId}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex gap-3"><span className="inline-flex size-10 items-center justify-center rounded-xl bg-accent-primary/15 text-accent-primary">
            <TerminalSquare className="size-5" aria-hidden="true" /></span><div>
            <h2 className="font-semibold">{command.type} · {command.deviceId}</h2>
            <p className="mono mt-1 text-xs text-text-muted">{command.commandId}</p>
          </div></div>
          <StatusBadge label={command.status} tone={tone(command.status)} />
        </div>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          <div><dt className="text-xs text-text-muted">{copy.requester}</dt><dd className="mono mt-1">{command.requester}</dd></div>
          <div><dt className="text-xs text-text-muted">{copy.approver}</dt><dd className="mono mt-1">{command.approver ?? "—"}</dd></div>
          <div><dt className="text-xs text-text-muted">Scenario</dt><dd className="mt-1">{command.scenario}</dd></div>
        </dl>
        {canApprove && command.status === "PENDING_APPROVAL" ? <div className="mt-4 flex gap-2">
          <Button onClick={() => actions.approve.mutate(command.commandId)} disabled={actions.approve.isPending}>
            <ShieldCheck className="size-4" />{copy.approve}</Button>
          <Button variant="danger" onClick={() => actions.reject.mutate(command.commandId)} disabled={actions.reject.isPending}>{copy.reject}</Button>
        </div> : null}
        <div className="mt-5 border-t border-border-subtle pt-4">
          <h3 className="text-sm font-semibold">{copy.timeline}</h3>
          <ol className="mt-3 space-y-2" data-testid="command-timeline">
            {command.transitions.map((transition) => <li key={transition.sequence} className="flex gap-3 text-xs">
              <Clock3 className="mt-0.5 size-3.5 shrink-0 text-text-muted" aria-hidden="true" />
              <span className="mono w-6 text-text-muted">{transition.sequence}</span>
              <span className="font-medium">{transition.toStatus}</span>
              <span className="text-text-muted">{transition.reason ?? "—"}</span>
            </li>)}
          </ol>
        </div>
      </Card>)}
    </div> : <EmptyView title={copy.noCommands} />}
  </div>;
}

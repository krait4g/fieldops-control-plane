"use client";

import { useCallback, useState } from "react";
import { CircleAlert, Clock3, Inbox, ShieldAlert } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { useI18n } from "@/shared/i18n";
import type { UiFailure } from "@/shared/lib/view-models";
import type { ViewTimestamp } from "@/shared/lib/time";
import { Button } from "./button";

export interface EmptyViewProps {
  title: string;
  message?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyView({ title, message, action, className }: EmptyViewProps) {
  return (
    <div
      className={cn("flex flex-col items-center justify-center gap-2 py-8 text-center", className)}
    >
      <Inbox className="size-8 text-text-muted" aria-hidden="true" />
      <p className="text-sm font-semibold text-text-secondary">{title}</p>
      {message ? <p className="max-w-sm text-xs text-text-muted">{message}</p> : null}
      {action}
    </div>
  );
}

function TraceId({ traceId }: { traceId?: string }) {
  const [copied, setCopied] = useState(false);
  const { messages } = useI18n();

  const copyTrace = useCallback(async () => {
    if (!traceId) return;
    try {
      await navigator.clipboard.writeText(traceId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard is best-effort.
    }
  }, [traceId]);

  if (!traceId) return null;
  return (
    <div className="flex items-center gap-2">
      <span className="mono text-xs text-text-muted">{messages.common.trace}: {traceId}</span>
      <button
        type="button"
        onClick={copyTrace}
        className="text-xs text-accent-primary underline-offset-2 hover:underline"
      >
        {copied ? messages.actions.copied : messages.actions.copyTraceId}
      </button>
    </div>
  );
}

export interface ErrorViewProps {
  failure: UiFailure;
  onRetry?: () => void;
  compact?: boolean;
  className?: string;
}

export function ErrorView({ failure, onRetry, compact, className }: ErrorViewProps) {
  const { messages } = useI18n();
  return (
    <div
      role="alert"
      className={cn("flex flex-col items-center justify-center gap-2 py-8 text-center", className)}
    >
      <CircleAlert className="size-8 text-status-critical" aria-hidden="true" />
      <p className="text-sm font-semibold text-text-secondary">{failure.title}</p>
      {!compact ? (
        <p className="max-w-sm text-xs text-text-muted">{failure.message}</p>
      ) : null}
      {failure.traceId ? <TraceId traceId={failure.traceId} /> : null}
      {failure.retryable && onRetry ? (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          {messages.actions.retry}
        </Button>
      ) : null}
    </div>
  );
}

export function PermissionView({ className }: { className?: string }) {
  const { messages } = useI18n();
  return (
    <div
      className={cn("flex flex-col items-center justify-center gap-2 py-12 text-center", className)}
    >
      <ShieldAlert className="size-8 text-text-muted" aria-hidden="true" />
      <p className="text-sm font-semibold text-text-secondary">
        {messages.errors.permissionTitle}
      </p>
    </div>
  );
}

export function NotFoundView({ className }: { className?: string }) {
  const { messages } = useI18n();
  return (
    <div
      className={cn("flex flex-col items-center justify-center gap-2 py-12 text-center", className)}
    >
      <CircleAlert className="size-8 text-text-muted" aria-hidden="true" />
      <p className="text-sm font-semibold text-text-secondary">
        {messages.errors.notFoundTitle}
      </p>
    </div>
  );
}

export interface StaleBannerProps {
  lastUpdatedAt?: ViewTimestamp;
  message?: string;
}

export function StaleBanner({ lastUpdatedAt, message }: StaleBannerProps) {
  const { messages } = useI18n();
  return (
    <div className="flex items-center gap-2 rounded-lg border border-status-warning/30 bg-status-warning/10 px-3 py-2 text-xs text-status-warning">
      <Clock3 className="size-4 shrink-0" aria-hidden="true" />
      <span>{message ?? messages.errors.staleMessage}</span>
      {lastUpdatedAt ? (
        <span className="numeral ml-auto shrink-0">{lastUpdatedAt.relativeLabel}</span>
      ) : null}
    </div>
  );
}

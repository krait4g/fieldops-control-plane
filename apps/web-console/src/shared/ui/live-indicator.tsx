"use client";

import { RefreshCw } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { catalogs, type CopyCatalog } from "@/shared/lib/copy";
import { useI18n } from "@/shared/i18n";
import type { ViewTimestamp } from "@/shared/lib/time";
import type { LiveConnectionStatus, StatusTone } from "@/shared/lib/view-models";
import { statusDotColor } from "./tone";

interface LiveView {
  label: string;
  tone: StatusTone;
  pulse: boolean;
}

export function liveStatusView(status: LiveConnectionStatus, messages: CopyCatalog = catalogs.en): LiveView {
  switch (status) {
    case "SNAPSHOT":
      return { label: messages.states.snapshot, tone: "neutral", pulse: false };
    case "CONNECTING":
      return { label: messages.states.connecting, tone: "info", pulse: true };
    case "LIVE":
      return { label: messages.states.live, tone: "success", pulse: true };
    case "RECONNECTING":
      return { label: messages.states.reconnecting, tone: "warning", pulse: true };
    case "STALE":
      return { label: messages.states.stale, tone: "warning", pulse: false };
    case "SNAPSHOT_REQUIRED":
      return { label: messages.states.reloading, tone: "warning", pulse: true };
    case "DISCONNECTED":
      return { label: messages.states.disconnected, tone: "critical", pulse: false };
  }
}

export interface LiveIndicatorProps {
  status: LiveConnectionStatus;
  lastEventAt?: ViewTimestamp;
  onRetry?: () => void;
  className?: string;
}

export function LiveIndicator({ status, lastEventAt, onRetry, className }: LiveIndicatorProps) {
  const { messages } = useI18n();
  const view = liveStatusView(status, messages);
  return (
    <span
      data-testid="live-indicator"
      className={cn("inline-flex items-center gap-1.5 text-xs font-medium", className)}
      style={{ color: statusDotColor[view.tone] }}
      title={lastEventAt ? `Last event at ${lastEventAt.absoluteLabel}` : undefined}
    >
      <span
        aria-hidden="true"
        className={cn("inline-block size-1.5 rounded-full", view.pulse && "animate-pulse")}
        style={{ backgroundColor: statusDotColor[view.tone] }}
      />
      <span>{view.label}</span>
      {status === "DISCONNECTED" && onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="ml-1 inline-flex items-center gap-1 rounded border border-border-subtle px-1.5 py-0.5 text-text-secondary hover:text-text-primary"
        >
          <RefreshCw className="size-3" aria-hidden="true" />
          {messages.actions.retry}
        </button>
      ) : null}
    </span>
  );
}

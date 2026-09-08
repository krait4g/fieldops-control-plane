"use client";

import { ChevronRight } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import type { StatusTone, WidgetMetaView } from "@/shared/lib/view-models";
import { Card } from "./card";
import { sourceLabel } from "@/shared/lib/labels";
import { useI18n } from "@/shared/i18n";

export interface KpiCardProps {
  id: string;
  title: string;
  primaryValue: string;
  secondaryLabel?: string;
  tone: StatusTone;
  meta: WidgetMetaView;
  onClick?: () => void;
  actionLabel?: string;
}

const primaryTone: Record<StatusTone, string> = {
  neutral: "text-text-primary",
  success: "text-status-success",
  warning: "text-status-warning",
  critical: "text-status-critical",
  info: "text-status-info",
  unknown: "text-status-unknown",
};

export function KpiCard({
  id,
  title,
  primaryValue,
  secondaryLabel,
  tone,
  meta,
  onClick,
  actionLabel,
}: KpiCardProps) {
  const { messages } = useI18n();
  const interactive = Boolean(onClick);
  const unavailable = meta.availability === "UNAVAILABLE";
  const valueText = unavailable ? "—" : primaryValue;

  const content = (
    <>
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">{title}</h3>
        {interactive ? <ChevronRight className="size-4 text-text-muted" aria-hidden="true" /> : null}
      </div>
      <p className={cn("numeral text-4xl font-bold leading-none tracking-tight", primaryTone[tone])}>{valueText}</p>
      {secondaryLabel ? <p className="text-xs text-text-muted">{secondaryLabel}</p> : null}
      <p className="mt-auto pt-2 text-[11px] text-text-muted">
        {meta.availability === "STALE" ? `${messages.states.stale} · ` : ""}
        {sourceLabel(meta.source, messages)}
      </p>
    </>
  );

  if (interactive) {
    return (
      <Card
        id={id}
        className={cn(
          "flex min-h-36 cursor-pointer flex-col gap-2 transition-colors hover:border-accent-primary/40 hover:bg-console-surface-2",
          meta.availability === "STALE" && "border-status-warning/40",
        )}
      >
        <button
          type="button"
          data-testid="kpi-card"
          onClick={onClick}
          aria-label={actionLabel ?? `View ${title}`}
          className="flex flex-1 flex-col gap-1 text-left"
        >
          {content}
        </button>
      </Card>
    );
  }

  return (
    <Card
      id={id}
      data-testid="kpi-card"
      role="group"
      aria-label={title}
      className={cn(
        "flex min-h-36 flex-col gap-2",
        meta.availability === "STALE" && "border-status-warning/40",
      )}
    >
      {content}
    </Card>
  );
}

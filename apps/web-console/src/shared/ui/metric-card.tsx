"use client";

import { metricQualityStatus } from "@/shared/lib/labels";
import type { MetricQuality } from "@/shared/api/types";
import type { ViewTimestamp } from "@/shared/lib/time";
import { Card } from "./card";
import { StatusBadge } from "./badge";
import { useI18n } from "@/shared/i18n";
import { formatCopy } from "@/shared/lib/copy";

export interface MetricCardProps {
  code: string;
  label: string;
  value: string;
  unit?: string;
  quality: MetricQuality;
  observedAt?: ViewTimestamp;
  receivedAt?: ViewTimestamp;
  sourceLabel: string;
}

export function MetricCard({
  code,
  label,
  value,
  unit,
  quality,
  observedAt,
  sourceLabel,
}: MetricCardProps) {
  const { messages } = useI18n();
  const status = metricQualityStatus(quality, messages);
  return (
    <Card className="flex min-h-36 flex-col gap-2 border-border-subtle/90">
      <div className="flex items-center justify-between gap-2">
        <h3 className="truncate text-xs font-semibold text-text-secondary" title={code}>
          {label}
        </h3>
        <StatusBadge label={status.label} tone={status.tone} size="sm" showDot />
      </div>
      <p className="numeral text-3xl font-bold leading-tight tracking-tight text-text-primary">
        {value}
        {unit ? <span className="ml-1 text-sm font-normal text-text-muted">{unit}</span> : null}
      </p>
      <div className="mt-auto flex flex-col gap-0.5 pt-2 text-[11px] text-text-muted">
        <span>
          {sourceLabel}
          {observedAt ? ` · ${formatCopy(messages.common.observed, { time: observedAt.relativeLabel })}` : ""}
        </span>
      </div>
    </Card>
  );
}

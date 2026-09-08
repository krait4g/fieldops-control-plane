import { cn } from "@/shared/lib/cn";
import type { ViewTimestamp } from "@/shared/lib/time";
import type { StatusTone } from "@/shared/lib/view-models";
import { statusDotColor, toneColor } from "./tone";

export interface StatusBadgeProps {
  label: string;
  tone: StatusTone;
  description?: string;
  timestamp?: ViewTimestamp;
  size?: "sm" | "md";
  showDot?: boolean;
  className?: string;
}

export function StatusBadge({
  label,
  tone,
  description,
  timestamp,
  size = "md",
  showDot = true,
  className,
}: StatusBadgeProps) {
  const color = toneColor[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-console-surface-2 font-medium",
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-xs",
        className,
      )}
      style={{ color }}
      title={description ?? `${label}${timestamp ? ` · ${timestamp.absoluteLabel}` : ""}`}
    >
      {showDot ? (
        <span
          aria-hidden="true"
          className="inline-block size-1.5 rounded-full"
          style={{ backgroundColor: statusDotColor[tone] }}
        />
      ) : null}
      <span>{label}</span>
      {timestamp ? (
        <span className="numeral text-text-muted">{timestamp.relativeLabel}</span>
      ) : null}
    </span>
  );
}
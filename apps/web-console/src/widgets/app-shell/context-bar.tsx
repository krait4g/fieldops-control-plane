"use client";

import { ChevronDown } from "lucide-react";
import type { ContextOptionView, TimeRange } from "@/shared/lib/view-models";
import { useI18n } from "@/shared/i18n";

const rangeOptions: Array<{ value: TimeRange; label: string }> = [
  { value: "PT1H", label: "1h" },
  { value: "PT6H", label: "6h" },
  { value: "PT24H", label: "24h" },
  { value: "P7D", label: "7d" },
];

function Select({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  options: ContextOptionView[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-text-muted">
      <span className="sr-only">{label}</span>
      <span className="relative inline-flex items-center">
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled || options.length === 0}
          className="appearance-none rounded-lg border border-border-subtle bg-console-surface-2 py-1.5 pl-3 pr-8 text-xs text-text-primary focus:outline-none disabled:opacity-50"
        >
          {options.map((option) => (
            <option key={option.id} value={option.id} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2 size-3.5 text-text-muted" aria-hidden="true" />
      </span>
    </label>
  );
}

export interface ContextBarProps {
  tenants: ContextOptionView[];
  sites: ContextOptionView[];
  selectedTenantId: string;
  selectedSiteId: string | null;
  selectedRange: TimeRange;
  rangeVisible: boolean;
  onTenantChange: (tenantId: string) => void;
  onSiteChange: (siteId: string) => void;
  onRangeChange: (range: TimeRange) => void;
}

export function ContextBar({
  tenants,
  sites,
  selectedTenantId,
  selectedSiteId,
  selectedRange,
  rangeVisible,
  onTenantChange,
  onSiteChange,
  onRangeChange,
}: ContextBarProps) {
  const { messages } = useI18n();
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <Select
        label={messages.shell.tenant}
        value={selectedTenantId}
        options={tenants}
        onChange={onTenantChange}
      />
      <Select
        label={messages.shell.site}
        value={selectedSiteId ?? ""}
        options={sites}
        onChange={onSiteChange}
        disabled={sites.length === 0}
      />
      {rangeVisible ? (
        <div className="flex items-center gap-1 rounded-lg border border-border-subtle bg-console-surface-2 p-0.5">
          {rangeOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onRangeChange(option.value)}
              aria-pressed={selectedRange === option.value}
              className={
                selectedRange === option.value
                  ? "rounded-md bg-accent-primary px-2.5 py-1 text-xs font-semibold text-console-bg"
                  : "rounded-md px-2.5 py-1 text-xs text-text-muted hover:text-text-primary"
              }
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

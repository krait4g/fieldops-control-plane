import { catalogs, type Locale } from "./copy";
import { intlLocale } from "./format";

export interface ViewTimestamp {
  iso: string;
  absoluteLabel: string;
  relativeLabel: string;
}

export function formatRelativeTime(iso: string, locale: Locale, now: Date = new Date()): string {
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return "—";
  const diffSeconds = Math.round((value.getTime() - now.getTime()) / 1000);
  const abs = Math.abs(diffSeconds);
  if (abs <= 10) return catalogs[locale].common.justNow;
  const relativeFormatter = new Intl.RelativeTimeFormat(intlLocale(locale), { numeric: "always" });
  if (abs < 60) return relativeFormatter.format(diffSeconds, "second");
  if (abs < 3600) return relativeFormatter.format(Math.round(diffSeconds / 60), "minute");
  if (abs < 86400) return relativeFormatter.format(Math.round(diffSeconds / 3600), "hour");
  return relativeFormatter.format(Math.round(diffSeconds / 86400), "day");
}

export function toViewTimestamp(
  iso: string | null | undefined,
  timezone = "UTC",
  locale: Locale = "en",
): ViewTimestamp | undefined {
  if (!iso) return undefined;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return undefined;
  const absoluteLabel = new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone: timezone,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
  return { iso, absoluteLabel, relativeLabel: formatRelativeTime(iso, locale) };
}

export function formatIsoTime(iso: string | null | undefined, locale: Locale = "en"): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(intlLocale(locale), {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

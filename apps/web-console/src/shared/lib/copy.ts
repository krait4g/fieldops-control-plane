import englishCatalog from "../../../../../contracts/ui/m1-copy.en.json";
import koreanCatalog from "../../../../../contracts/ui/m1-copy.ko.json";

export type Locale = "ko" | "en";
export type CopyCatalog = typeof englishCatalog;

const checkedKoreanCatalog: CopyCatalog = koreanCatalog;

export const catalogs: Record<Locale, CopyCatalog> = {
  ko: checkedKoreanCatalog,
  en: englishCatalog,
};

export const defaultLocale: Locale = "ko";
export const localeCookieName = "fieldops-locale";

export function isLocale(value: string | null | undefined): value is Locale {
  return value === "ko" || value === "en";
}

export function copyFor(locale: Locale): CopyCatalog {
  return catalogs[locale];
}

export function formatCopy(
  template: string,
  values: Record<string, string | number>,
): string {
  return template.replace(/\{([^}]+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match,
  );
}

export function copyKeys(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return [prefix];
  }
  return Object.entries(value).flatMap(([key, child]) =>
    copyKeys(child, prefix ? `${prefix}.${key}` : key),
  );
}

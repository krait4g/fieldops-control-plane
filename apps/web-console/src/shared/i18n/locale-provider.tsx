"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  catalogs,
  defaultLocale,
  localeCookieName,
  type CopyCatalog,
  type Locale,
} from "@/shared/lib/copy";

interface LocaleContextValue {
  locale: Locale;
  messages: CopyCatalog;
  setLocale: (locale: Locale) => void;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({
  initialLocale = defaultLocale,
  children,
}: {
  initialLocale?: Locale;
  children: React.ReactNode;
}) {
  const [locale, updateLocale] = useState<Locale>(initialLocale);

  const setLocale = useCallback((nextLocale: Locale) => {
    updateLocale(nextLocale);
    document.documentElement.lang = nextLocale;
    document.cookie = `${localeCookieName}=${nextLocale}; Path=/; Max-Age=31536000; SameSite=Lax`;
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    window.localStorage.setItem(localeCookieName, locale);
  }, [locale]);

  const value = useMemo(
    () => ({ locale, messages: catalogs[locale], setLocale }),
    [locale, setLocale],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useI18n(): LocaleContextValue {
  const value = useContext(LocaleContext);
  if (!value) throw new Error("useI18n must be used within a LocaleProvider");
  return value;
}

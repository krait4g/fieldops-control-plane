"use client";

import { useEffect, useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { getQueryClient } from "./query-client";
import { enableMocking, usesMock } from "@/shared/api/bootstrap";
import { LocaleProvider } from "@/shared/i18n";
import type { Locale } from "@/shared/lib/copy";

export function Providers({ children, initialLocale }: { children: React.ReactNode; initialLocale: Locale }) {
  const [queryClient] = useState(() => getQueryClient());
  const [mswReady, setMswReady] = useState(() => !usesMock());

  useEffect(() => {
    if (mswReady) return;
    let active = true;
    enableMocking()
      .catch((error: unknown) => {
        // Mock transport boot failures are surfaced as page errors by the
        // query layer. Do not silently fall back to remote.
        if (process.env.NODE_ENV !== "production") {
          console.error("[mock] failed to start MSW", error);
        }
      })
      .finally(() => {
        if (active) setMswReady(true);
      });
    return () => {
      active = false;
    };
  }, [mswReady]);

  if (!mswReady) {
    return null;
  }

  return (
    <LocaleProvider initialLocale={initialLocale}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </LocaleProvider>
  );
}

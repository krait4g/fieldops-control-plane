import type { Metadata } from "next";
import { cookies } from "next/headers";
import { assertProductionMode } from "@/shared/config/data-mode";
import { Providers } from "@/shared/providers";
import { defaultLocale, isLocale, localeCookieName } from "@/shared/lib/copy";
import "./globals.css";

assertProductionMode();

export const metadata: Metadata = {
  title: "FieldOps Console",
  description: "FieldOps Control Plane — Operations Console",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const storedLocale = (await cookies()).get(localeCookieName)?.value;
  const locale = isLocale(storedLocale) ? storedLocale : defaultLocale;

  return (
    <html lang={locale}>
      <body>
        <Providers initialLocale={locale}>{children}</Providers>
      </body>
    </html>
  );
}

import Link from "next/link";
import { cookies } from "next/headers";
import { catalogs, defaultLocale, isLocale, localeCookieName } from "@/shared/lib/copy";

export default async function NotFound() {
  const storedLocale = (await cookies()).get(localeCookieName)?.value;
  const locale = isLocale(storedLocale) ? storedLocale : defaultLocale;
  const messages = catalogs[locale];
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-console-bg p-6 text-text-primary">
      <h1 className="text-xl font-bold">{messages.common.pageNotFound}</h1>
      <p className="text-text-secondary">
        {messages.errors.notFoundTitle}
      </p>
      <Link
        href="/overview"
        className="rounded-lg bg-accent-primary px-4 py-2 text-sm font-semibold text-console-bg hover:bg-accent-hover"
      >
        {messages.actions.goToOverview}
      </Link>
    </div>
  );
}

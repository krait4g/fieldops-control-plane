"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/shared/lib/cn";
import type { NavigationItemView } from "@/shared/lib/view-models";
import { navIcon } from "./nav-icons";
import { useI18n } from "@/shared/i18n";

export function Sidebar({
  navigation,
  onNavigate,
}: {
  navigation: NavigationItemView[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const { messages } = useI18n();
  const visible = navigation.filter((item) => !item.hidden);

  return (
    <nav aria-label={messages.shell.mainNavigation} className="flex w-full flex-col gap-1 p-3 lg:px-2 min-[1440px]:px-3">
      {visible.map((item) => {
        const Icon = navIcon(item.iconName);
        const active = item.active || (item.href ? pathname.startsWith(item.href) : false);
        const disabled = item.disabled || !item.href;
        if (disabled) {
          return (
            <span
              key={item.id}
              aria-disabled="true"
              className="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2 text-sm text-text-muted"
            >
              <Icon className="size-4" aria-hidden="true" />
              {item.label}
            </span>
          );
        }
        return (
          <Link
            key={item.id}
            href={item.href ?? "#"}
            aria-current={active ? "page" : undefined}
            aria-label={item.label}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors lg:justify-center lg:px-2 min-[1440px]:justify-start min-[1440px]:px-3",
              active
                ? "bg-console-surface-2 font-semibold text-text-primary"
                : "text-text-secondary hover:bg-console-surface-2 hover:text-text-primary",
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
            <span className="lg:hidden min-[1440px]:inline">{item.label}</span>
            {item.badge ? (
              <span className="ml-auto rounded-full bg-accent-primary/20 px-2 text-xs text-accent-primary lg:hidden min-[1440px]:inline">
                {item.badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

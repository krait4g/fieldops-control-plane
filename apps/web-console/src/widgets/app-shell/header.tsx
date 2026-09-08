"use client";

import type { RefObject } from "react";
import Link from "next/link";
import { ChevronRight, Menu } from "lucide-react";
import type { AppShellUserView, LiveConnectionStatus } from "@/shared/lib/view-models";
import { LiveIndicator } from "@/shared/ui/live-indicator";
import { UserMenu } from "./user-menu";
import { useI18n } from "@/shared/i18n";

export interface HeaderProps {
  breadcrumb: Array<{ label: string; href?: string }>;
  liveStatus: LiveConnectionStatus;
  user: AppShellUserView;
  onRetryLive?: () => void;
  onLogout?: () => void;
  dataModeLabel?: string;
  onOpenNavigation?: () => void;
  navigationButtonRef?: RefObject<HTMLButtonElement | null>;
}

export function Header({
  breadcrumb,
  liveStatus,
  user,
  onRetryLive,
  onLogout,
  dataModeLabel,
  onOpenNavigation,
  navigationButtonRef,
}: HeaderProps) {
  const { messages } = useI18n();
  return (
    <header className="flex h-16 items-center justify-between gap-3 border-b border-border-subtle bg-console-surface-1 px-4 lg:px-6">
      <div className="flex min-w-0 items-center gap-2">
        {onOpenNavigation ? (
          <button
            ref={navigationButtonRef}
            type="button"
            aria-label={messages.shell.openNavigation}
            onClick={onOpenNavigation}
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-text-secondary hover:bg-console-surface-2 hover:text-text-primary lg:hidden"
          >
            <Menu className="size-5" aria-hidden="true" />
          </button>
        ) : null}
        <nav aria-label={messages.shell.breadcrumb} className="flex min-w-0 items-center gap-1 text-sm">
        {breadcrumb.map((crumb, index) => {
          const isLast = index === breadcrumb.length - 1;
          return (
            <span key={`${crumb.label}-${index}`} className="flex min-w-0 items-center gap-1">
              {index > 0 ? (
                <ChevronRight className="size-3.5 shrink-0 text-text-muted" aria-hidden="true" />
              ) : null}
              {crumb.href && !isLast ? (
                <Link
                  href={crumb.href}
                  className="truncate text-text-muted hover:text-text-primary"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span className={isLast ? "truncate font-semibold text-text-primary" : "text-text-muted"}>
                  {crumb.label}
                </span>
              )}
            </span>
          );
        })}
        </nav>
      </div>

      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        {dataModeLabel ? (
          <span className="hidden rounded-full border border-status-warning/40 px-2 py-0.5 text-[11px] text-status-warning sm:inline-flex">
            {dataModeLabel}
          </span>
        ) : null}
        <LiveIndicator status={liveStatus} onRetry={onRetryLive} />
        <UserMenu user={user} onLogout={onLogout} />
      </div>
    </header>
  );
}

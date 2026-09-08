"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type { AppShellProps } from "@/shared/lib/view-models";
import { Sidebar } from "./sidebar";
import { Header } from "./header";
import { ContextBar } from "./context-bar";
import { useI18n } from "@/shared/i18n";

export interface AppShellFullProps extends AppShellProps {
  onRetryLive?: () => void;
  onLogout?: () => void;
  dataModeLabel?: string;
  snapshotStale?: boolean;
}

export function AppShell({
  navigation,
  breadcrumb,
  tenants,
  sites,
  selectedTenantId,
  selectedSiteId,
  selectedRange,
  liveStatus,
  user,
  rangeVisible,
  onTenantChange,
  onSiteChange,
  onRangeChange,
  onRetryLive,
  onLogout,
  dataModeLabel,
  snapshotStale,
  children,
}: AppShellFullProps) {
  const { messages } = useI18n();
  const [navigationOpen, setNavigationOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const navigationButtonRef = useRef<HTMLButtonElement>(null);
  const navigationDialogRef = useRef<HTMLElement>(null);

  const closeNavigation = useCallback(() => {
    setNavigationOpen(false);
    window.requestAnimationFrame(() => navigationButtonRef.current?.focus());
  }, []);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    const closeAtDesktop = (event: MediaQueryListEvent) => {
      if (event.matches) setNavigationOpen(false);
    };
    desktop.addEventListener("change", closeAtDesktop);
    return () => desktop.removeEventListener("change", closeAtDesktop);
  }, []);

  useEffect(() => {
    if (!navigationOpen) return;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeNavigation();
        return;
      }

      if (event.key !== "Tab") return;
      const dialog = navigationDialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.hasAttribute("hidden"));
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) {
        event.preventDefault();
        return;
      }
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousBodyOverflow;
    };
  }, [closeNavigation, navigationOpen]);

  return (
    <div className="flex min-h-screen bg-console-bg text-text-primary">
      <aside
        aria-hidden={navigationOpen || undefined}
        inert={navigationOpen}
        className="hidden w-[72px] shrink-0 border-r border-border-subtle bg-console-surface-1 lg:block min-[1440px]:w-60"
      >
        <div className="flex h-16 items-center justify-center gap-2 border-b border-border-subtle px-4 min-[1440px]:justify-start">
          <span className="text-sm font-bold min-[1440px]:hidden" aria-hidden="true">F</span>
          <span className="hidden text-sm font-bold min-[1440px]:inline">FieldOps</span>
        </div>
        <Sidebar navigation={navigation} />
      </aside>

      {navigationOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label={messages.shell.closeNavigationOverlay}
            tabIndex={-1}
            className="absolute inset-0 bg-black/60"
            onClick={closeNavigation}
          />
          <aside
            ref={navigationDialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={messages.shell.navigationDrawer}
            className="relative h-full w-60 border-r border-border-subtle bg-console-surface-1 shadow-2xl"
          >
            <div className="flex h-16 items-center justify-between border-b border-border-subtle px-4">
              <span className="text-sm font-bold">FieldOps</span>
              <button
                ref={closeButtonRef}
                type="button"
                aria-label={messages.shell.closeNavigation}
                onClick={closeNavigation}
                className="inline-flex size-9 items-center justify-center rounded-lg text-text-secondary hover:bg-console-surface-2 hover:text-text-primary"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>
            <Sidebar navigation={navigation} onNavigate={() => setNavigationOpen(false)} />
          </aside>
        </div>
      ) : null}

      <div
        data-testid="app-shell-content"
        aria-hidden={navigationOpen || undefined}
        inert={navigationOpen}
        className="flex min-w-0 flex-1 flex-col"
      >
        <Header
          breadcrumb={breadcrumb}
          liveStatus={liveStatus}
          user={user}
          onRetryLive={onRetryLive}
          onLogout={onLogout}
          dataModeLabel={dataModeLabel}
          onOpenNavigation={() => setNavigationOpen(true)}
          navigationButtonRef={navigationButtonRef}
        />
        <div className="border-b border-border-subtle bg-console-surface-1 px-4 py-2 lg:px-6">
          <ContextBar
            tenants={tenants}
            sites={sites}
            selectedTenantId={selectedTenantId}
            selectedSiteId={selectedSiteId}
            selectedRange={selectedRange}
            rangeVisible={rangeVisible}
            onTenantChange={onTenantChange}
            onSiteChange={onSiteChange}
            onRangeChange={onRangeChange}
          />
        </div>
        <main className="flex-1 p-4 lg:p-6">
          <div className="mx-auto w-full max-w-[1600px]">
            {snapshotStale ? (
              <div
                role="status"
                data-testid="snapshot-stale-banner"
                className="mb-4 rounded-lg border border-status-warning/40 bg-status-warning/10 px-3 py-2 text-xs text-status-warning"
              >
                {messages.shell.snapshotStale}
              </div>
            ) : null}
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

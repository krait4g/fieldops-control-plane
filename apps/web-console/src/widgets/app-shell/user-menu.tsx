"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Languages, LogOut } from "lucide-react";
import type { AppShellUserView } from "@/shared/lib/view-models";
import { useI18n } from "@/shared/i18n";
import { formatCopy, type Locale } from "@/shared/lib/copy";

export function UserMenu({
  user,
  onLogout,
}: {
  user: AppShellUserView;
  onLogout?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { locale, messages, setLocale } = useI18n();

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={formatCopy(messages.shell.openUserMenu, { name: user.displayName })}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-console-surface-2"
      >
        <span
          className="flex size-7 items-center justify-center rounded-full bg-accent-primary text-xs font-bold text-console-bg"
          aria-hidden="true"
        >
          {user.displayName.charAt(0).toUpperCase()}
        </span>
        <span className="hidden sm:block">
          <span className="block text-xs font-semibold text-text-primary">{user.displayName}</span>
          <span className="block text-[11px] text-text-muted">{user.roleLabel}</span>
        </span>
      </button>

      {open ? (
        <div
          role="menu"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setOpen(false);
              triggerRef.current?.focus();
            }
          }}
          className="absolute right-0 z-20 mt-2 w-56 rounded-xl border border-border-subtle bg-console-surface-1 p-1 shadow-xl"
        >
          <div className="border-b border-border-subtle px-3 py-2">
            <p className="text-sm font-semibold text-text-primary">{user.displayName}</p>
            <p className="truncate text-xs text-text-muted">{user.email}</p>
          </div>
          <div className="border-b border-border-subtle px-1 py-1.5">
            <p className="flex items-center gap-2 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
              <Languages className="size-3.5" aria-hidden="true" />
              {messages.shell.language}
            </p>
            {(["ko", "en"] as Locale[]).map((option) => (
              <button
                key={option}
                type="button"
                role="menuitemradio"
                aria-checked={locale === option}
                onClick={() => setLocale(option)}
                className="flex min-h-9 w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm text-text-secondary hover:bg-console-surface-2 hover:text-text-primary focus-visible:bg-console-surface-2"
              >
                <span>{option === "ko" ? messages.shell.korean : messages.shell.english}</span>
                {locale === option ? <Check className="size-4 text-accent-primary" aria-hidden="true" /> : null}
              </button>
            ))}
          </div>
          {onLogout ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onLogout();
              }}
              className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-text-secondary hover:bg-console-surface-2 hover:text-text-primary"
            >
              <LogOut className="size-4" aria-hidden="true" />
              {messages.actions.signOut}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

"use client";

import { useI18n } from "@/shared/i18n";

export default function Loading() {
  const { messages } = useI18n();
  return (
    <div className="flex min-h-screen items-center justify-center bg-console-bg text-text-secondary">
      <div role="status" aria-label={messages.states.loading}>
        {messages.states.loading}…
      </div>
    </div>
  );
}

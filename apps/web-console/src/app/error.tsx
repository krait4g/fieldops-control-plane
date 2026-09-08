"use client";

import { useI18n } from "@/shared/i18n";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { messages } = useI18n();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-console-bg p-6 text-text-primary">
      <h1 className="text-xl font-bold">{messages.errors.genericTitle}</h1>
      <p className="text-text-secondary">
        {messages.errors.genericMessage}
      </p>
      {error.digest ? (
        <p className="mono text-xs text-text-muted">trace: {error.digest}</p>
      ) : null}
      <button
        type="button"
        onClick={reset}
        className="rounded-lg bg-accent-primary px-4 py-2 text-sm font-semibold text-console-bg hover:bg-accent-hover"
      >
        {messages.actions.tryAgain}
      </button>
    </div>
  );
}

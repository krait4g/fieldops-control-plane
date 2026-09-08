import { resolveApiMode, shouldUseMock } from "@/shared/config/data-mode";

export type { ApiMode } from "@/shared/config/data-mode";

/** Single place where the data-mode / transport decision is made. */
export const apiMode = resolveApiMode();

let mockingPromise: Promise<void> | null = null;

/**
 * Starts the MSW browser worker in mock mode. Feature code never learns the
 * mode; only this bootstrap path and the fixture transport do.
 */
export function enableMocking(): Promise<void> {
  if (!shouldUseMock(apiMode)) return Promise.resolve();

  if (!mockingPromise) {
    mockingPromise = import("@/shared/api/mock/browser").then(async ({ worker }) => {
      await worker.start({
        onUnhandledRequest: "bypass",
        quiet: false,
      });
    });
  }

  return mockingPromise;
}

export function usesMock(): boolean {
  return shouldUseMock(apiMode);
}

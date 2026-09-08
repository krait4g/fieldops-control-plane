import { z } from "zod";

export const ApiModeSchema = z.enum(["mock", "remote"]);
export type ApiMode = z.infer<typeof ApiModeSchema>;

const MODE_ENV = "NEXT_PUBLIC_FIELDOPS_DATA_MODE";

function readRawMode(): string | undefined {
  return process.env[MODE_ENV]?.trim() || undefined;
}

/**
 * Resolves the browser data mode. The value is not secret; it only selects
 * the transport adapter. Unset defaults to "mock" for local development,
 * which the production guard below rejects in production builds/runtime.
 */
export function resolveApiMode(): ApiMode {
  const raw = readRawMode();
  if (raw === "remote" || raw === "mock") return raw;
  return "mock";
}

/**
 * Production builds and production runtime must reject mock mode. This is
 * called from a server context (root layout) so a production build with an
 * unset or mock data mode fails instead of silently shipping fixture data.
 */
export function assertProductionMode(mode: ApiMode = resolveApiMode()): void {
  if (process.env.NODE_ENV === "production" && mode === "mock") {
    throw new Error(
      "NEXT_PUBLIC_FIELDOPS_DATA_MODE=mock is not allowed in production " +
        "builds or production runtime. Set NEXT_PUBLIC_FIELDOPS_DATA_MODE=remote.",
    );
  }
}

/** True when the mock transport should be activated in this environment. */
export function shouldUseMock(mode: ApiMode = resolveApiMode()): boolean {
  // Mock is never active in a production runtime.
  return mode === "mock" && process.env.NODE_ENV !== "production";
}
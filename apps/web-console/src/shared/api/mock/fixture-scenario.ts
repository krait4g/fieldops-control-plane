export const FIXTURE_SCENARIO_HEADER = "x-fieldops-fixture-scenario";

export type FixtureScenario =
  | "normal"
  | "overview-delay"
  | "overview-fail"
  | "overview-partial"
  | "overview-stale"
  | "devices-delay"
  | "devices-forbidden";

declare global {
  interface Window {
    __fieldopsFixtureScenario?: FixtureScenario;
  }
}

export function activeFixtureScenario(): FixtureScenario | undefined {
  if (
    process.env.NEXT_PUBLIC_FIELDOPS_DATA_MODE !== "mock" ||
    typeof window === "undefined"
  ) {
    return undefined;
  }
  return window.__fieldopsFixtureScenario;
}

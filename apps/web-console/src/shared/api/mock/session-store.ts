export type SessionScenario = "admin" | "viewer" | "no-site";

let currentScenario: SessionScenario = "admin";

export function getSessionScenario(): SessionScenario {
  return currentScenario;
}

/**
 * Development-only synthetic session selection. Only reachable in mock mode;
 * the production build rejects mock mode so this cannot leak to release.
 */
export function setSessionScenario(scenario: SessionScenario): void {
  currentScenario = scenario;
}

export function resetSessionScenario(): void {
  currentScenario = "admin";
}
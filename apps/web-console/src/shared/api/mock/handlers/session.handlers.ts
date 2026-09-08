import { http, HttpResponse } from "msw";
import { fixtures } from "../fixture-loader";
import { getSessionScenario, type SessionScenario } from "../session-store";

function scenarioKey(scenario: SessionScenario): "admin" | "viewer" | "noSite" {
  return scenario === "no-site" ? "noSite" : scenario;
}

export const sessionHandlers = [
  http.get("/api/v1/session", () => {
    return HttpResponse.json(fixtures.session[scenarioKey(getSessionScenario())]);
  }),
];
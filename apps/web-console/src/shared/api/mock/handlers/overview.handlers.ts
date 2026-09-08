import { delay, http, HttpResponse } from "msw";
import { fixtures } from "../fixture-loader";
import { FIXTURE_SCENARIO_HEADER } from "../fixture-scenario";

export const overviewHandlers = [
  http.get("/api/v1/dashboard/overview", async ({ request }) => {
    const scenario = request.headers.get(FIXTURE_SCENARIO_HEADER);
    if (scenario === "overview-delay") await delay(1_000);
    if (scenario === "overview-fail") {
      return HttpResponse.json(fixtures.errors.readModelUnavailable, { status: 503 });
    }
    if (scenario === "overview-partial") {
      return HttpResponse.json(fixtures.overview.partial);
    }
    if (scenario === "overview-stale") {
      return HttpResponse.json(fixtures.overview.stale);
    }
    return HttpResponse.json(fixtures.overview.normal);
  }),
  http.get("/api/v1/dashboard/environment-series", () => {
    return HttpResponse.json(fixtures.environmentSeries);
  }),
];

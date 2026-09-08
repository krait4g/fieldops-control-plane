import { describe, expect, it } from "vitest";
import { mapOverviewResponse } from "./overview.mapper";
import type { OverviewResponse } from "@/shared/api/types";
import overviewNormal from "../../../../../fixtures/m1/overview/overview-normal.json";
import overviewPartial from "../../../../../fixtures/m1/overview/overview-partial.json";
import overviewStale from "../../../../../fixtures/m1/overview/overview-stale.json";
import overviewEmpty from "../../../../../fixtures/m1/overview/overview-empty.json";

const normal = overviewNormal as unknown as OverviewResponse;
const partial = overviewPartial as unknown as OverviewResponse;
const stale = overviewStale as unknown as OverviewResponse;
const empty = overviewEmpty as unknown as OverviewResponse;

describe("mapOverviewResponse", () => {
  it("maps the normal fixture to four KPIs and healthy widgets", () => {
    const view = mapOverviewResponse(normal, "Asia/Seoul");
    expect(view.kpis).toHaveLength(4);
    const deviceStatus = view.kpis.find((kpi) => kpi.id === "deviceStatus");
    expect(deviceStatus?.primaryValue).toBe("2");
    const freshness = view.kpis.find((kpi) => kpi.id === "freshness");
    expect(freshness?.primaryValue).toBe("66.7%");
    expect(view.partialFailures).toHaveLength(0);
    expect(view.deviceHealth.segments.map((s) => s.count)).toEqual([2, 1, 0, 0]);
  });

  it("surfaces widget-level partial failure without dropping the page", () => {
    const view = mapOverviewResponse(partial, "Asia/Seoul");
    expect(view.partialFailures).toHaveLength(1);
    expect(view.partialFailures[0]?.retryable).toBe(true);
    expect(view.placeholders.find((p) => p.id === "recentCommands")).toBeUndefined();
    expect(view.kpis).toHaveLength(4);
  });

  it("marks stale widgets as stale", () => {
    const view = mapOverviewResponse(stale, "Asia/Seoul");
    const deviceStatus = view.kpis.find((kpi) => kpi.id === "deviceStatus");
    expect(deviceStatus?.meta.availability).toBe("STALE");
  });

  it("handles the empty fixture without fabricated values", () => {
    const view = mapOverviewResponse(empty, "Asia/Seoul");
    const freshness = view.kpis.find((kpi) => kpi.id === "freshness");
    expect(freshness?.primaryValue).toBe("—");
  });
});

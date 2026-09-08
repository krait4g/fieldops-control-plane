import { describe, expect, it } from "vitest";
import type { TelemetrySeriesResponse } from "@/shared/api/types";
import fixture from "../../../../../fixtures/m1/telemetry/series-24h.json";
import { mapTelemetrySeriesResponse } from "./series";

const response = fixture as unknown as TelemetrySeriesResponse;

describe("mapTelemetrySeriesResponse", () => {
  it("localizes known series labels and normalizes display-only units", () => {
    const korean = mapTelemetrySeriesResponse(response, "ko").series;
    const english = mapTelemetrySeriesResponse(response, "en").series;
    expect(korean[0]).toMatchObject({ label: "토양 수분", unit: "%" });
    expect(korean[1]).toMatchObject({ label: "토양 온도", unit: "°C" });
    expect(english[0]).toMatchObject({ label: "Soil moisture", unit: "%" });
    expect(english[1]).toMatchObject({ label: "Soil temperature", unit: "°C" });
  });

  it("preserves unknown series labels and units", () => {
    const unknown = {
      ...response,
      series: [{
        ...response.series[0],
        metricCode: "vendor.ph",
        displayName: "Vendor pH",
        unit: "pH",
      }],
    };
    expect(mapTelemetrySeriesResponse(unknown, "ko").series[0]).toMatchObject({
      label: "Vendor pH",
      unit: "pH",
    });
  });
});

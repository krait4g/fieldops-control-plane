import { describe, expect, it } from "vitest";
import {
  deviceTypeDisplayLabel,
  formatDomainMetricValue,
  metricDisplayMetadata,
} from "./domain-display";

describe("domain display mapping", () => {
  it.each([
    ["ko", "토양 수분", "토양 온도", "토양 센서"],
    ["en", "Soil moisture", "Soil temperature", "Soil sensor"],
  ] as const)("localizes known soil readings and device type for %s", (locale, moisture, temperature, deviceType) => {
    expect(metricDisplayMetadata("soil.moisture.pct", "raw moisture", "%", locale)).toEqual({
      label: moisture,
      unit: "%",
    });
    expect(metricDisplayMetadata("soil.temperature.c", "raw temperature", "Cel", locale)).toEqual({
      label: temperature,
      unit: "°C",
    });
    expect(formatDomainMetricValue("soil.moisture.pct", 38.58, locale)).toBe("38.6");
    expect(formatDomainMetricValue("soil.temperature.c", 23.66, locale)).toBe("23.7");
    expect(deviceTypeDisplayLabel("SOIL_SENSOR", "server soil", locale)).toBe(deviceType);
  });

  it("preserves unknown server display values", () => {
    expect(metricDisplayMetadata("vendor.ph", "Vendor pH", "pH", "ko")).toEqual({
      label: "Vendor pH",
      unit: "pH",
    });
    expect(formatDomainMetricValue("vendor.ph", 7.125, "ko")).toBe("7.13");
    expect(deviceTypeDisplayLabel("VENDOR_PROBE", "Vendor probe", "ko")).toBe("Vendor probe");
  });
});

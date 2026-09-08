import { describe, expect, it } from "vitest";
import { mapDeviceSummary } from "./device.mapper";
import type { DeviceSummary } from "@/shared/api/types";

const baseDto: DeviceSummary = {
  id: "device-soil-01",
  externalId: "SOIL-001",
  name: "Soil Sensor #1",
  typeCode: "SOIL_SENSOR",
  typeName: "Soil Sensor",
  siteId: "site-green-valley",
  siteName: "Green Valley Farm",
  zoneId: "zone-north",
  zoneName: "North Field",
  protocol: "MQTT",
  connectivity: "ONLINE",
  readiness: "READY",
  freshness: "FRESH",
  latestMetric: {
    code: "soil.moisture.pct",
    displayName: "Soil moisture",
    value: 18.7,
    unit: "%",
    quality: "GOOD",
    observedAt: "2026-09-03T04:29:55Z",
  },
  lastSeenAt: "2026-09-03T04:29:55Z",
  activeAlarmCount: 0,
  version: 1824,
};

describe("mapDeviceSummary", () => {
  it("maps a device summary to a row view model", () => {
    const row = mapDeviceSummary(baseDto, "UTC");
    expect(row.name).toBe("Soil Sensor #1");
    expect(row.externalId).toBe("SOIL-001");
    expect(row.typeLabel).toBe("Soil sensor");
    expect(row.latestMetric?.value).toBe("18.7");
    expect(row.latestMetric?.unit).toBe("%");
    expect(row.lastSeenAt).toBeDefined();
  });

  it("normalizes a null latest metric to undefined", () => {
    const row = mapDeviceSummary({ ...baseDto, latestMetric: null }, "UTC");
    expect(row.latestMetric).toBeUndefined();
  });

  it("localizes known labels without translating entity names", () => {
    const row = mapDeviceSummary({ ...baseDto, name: "A Soil Sensor 01" }, "UTC", "ko");
    expect(row.name).toBe("A Soil Sensor 01");
    expect(row.typeLabel).toBe("토양 센서");
    expect(row.latestMetric).toMatchObject({ label: "토양 수분", value: "18.7", unit: "%" });
  });

  it("falls back to server display values for unknown domains", () => {
    const row = mapDeviceSummary({
      ...baseDto,
      typeCode: "VENDOR_PROBE",
      typeName: "Vendor probe",
      latestMetric: {
        ...baseDto.latestMetric!,
        code: "vendor.ph",
        displayName: "Vendor pH",
        unit: "pH",
      },
    }, "UTC", "ko");
    expect(row.typeLabel).toBe("Vendor probe");
    expect(row.latestMetric).toMatchObject({ label: "Vendor pH", unit: "pH" });
  });
});

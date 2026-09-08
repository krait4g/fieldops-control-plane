import { describe, expect, it } from "vitest";
import { parseSiteEvent } from "./event-schema";

function validEvent() {
  return {
    eventId: "evt-1825",
    eventType: "device.state.updated",
    tenantId: "tenant-demo",
    siteId: "site-green-valley",
    resourceType: "DEVICE",
    resourceId: "device-soil-01",
    version: 1825,
    stateEpoch: "fieldops.telemetry.normalized.v1:topic-demo-uuid:0",
    revision: 1825,
    occurredAt: "2026-09-03T04:31:00Z",
    payload: {
      connectivity: "ONLINE",
      readiness: "READY",
      freshness: "FRESH",
      source: "REDIS_REALTIME",
      observedAt: "2026-09-03T04:30:59Z",
      receivedAt: "2026-09-03T04:31:00Z",
      staleAt: null,
      metrics: [
        {
          code: "soil.moisture.pct",
          displayName: "Soil moisture",
          value: 19.2,
          unit: "%",
          quality: "GOOD",
          observedAt: "2026-09-03T04:30:59Z",
        },
      ],
    },
  };
}

describe("M1 SSE runtime validation", () => {
  it("accepts a complete event only when its wire name matches", () => {
    expect(parseSiteEvent("device.state.updated", validEvent())).not.toBeNull();
    expect(parseSiteEvent("heartbeat", validEvent())).toBeNull();
    expect(parseSiteEvent("message", validEvent())).toBeNull();
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid version %s",
    (version) => {
      expect(parseSiteEvent("device.state.updated", { ...validEvent(), version })).toBeNull();
    },
  );

  it("rejects missing required payload fields instead of defaulting them", () => {
    const event = validEvent();
    const payload: Partial<typeof event.payload> = { ...event.payload };
    delete payload.readiness;
    expect(
      parseSiteEvent("device.state.updated", { ...event, payload }),
    ).toBeNull();
  });

  it("rejects missing or invalid state ordering fields", () => {
    const withoutEpoch: Partial<ReturnType<typeof validEvent>> = { ...validEvent() };
    delete withoutEpoch.stateEpoch;
    expect(parseSiteEvent("device.state.updated", withoutEpoch)).toBeNull();
    expect(
      parseSiteEvent("device.state.updated", { ...validEvent(), revision: -1 }),
    ).toBeNull();
  });

  it("rejects invalid resource and metric shapes", () => {
    expect(
      parseSiteEvent("device.state.updated", { ...validEvent(), resourceType: "SITE" }),
    ).toBeNull();
    const event = validEvent();
    expect(
      parseSiteEvent("device.state.updated", {
        ...event,
        payload: {
          ...event.payload,
          metrics: [{ ...event.payload.metrics[0], quality: "PERFECT" }],
        },
      }),
    ).toBeNull();
  });
});

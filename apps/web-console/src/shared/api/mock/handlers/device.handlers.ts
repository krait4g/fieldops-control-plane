import { delay, http, HttpResponse } from "msw";
import { fixtures } from "../fixture-loader";
import { FIXTURE_SCENARIO_HEADER } from "../fixture-scenario";

const DEMO_SITE = "site-green-valley";
const DEVICE_READ_DENIED = {
  type: "https://fieldops.dev/problems/device-read-denied",
  title: "Device access denied",
  status: 403,
  code: "DEVICE_READ_DENIED",
  detail: "The current session can no longer read devices for this site.",
  traceId: "trace-demo-device-403",
  timestamp: "2026-09-03T04:30:00Z",
};

export const deviceHandlers = [
  http.get("/api/v1/devices", async ({ request }) => {
    const scenario = request.headers.get(FIXTURE_SCENARIO_HEADER);
    if (scenario === "devices-delay") await delay(1_000);
    if (scenario === "devices-forbidden") {
      return HttpResponse.json(DEVICE_READ_DENIED, { status: 403 });
    }
    const url = new URL(request.url);
    const siteId = url.searchParams.get("siteId");
    if (siteId && siteId !== DEMO_SITE) {
      return HttpResponse.json(fixtures.devices.listEmpty);
    }

    const query = (url.searchParams.get("query") ?? "").toLowerCase();
    const deviceType = url.searchParams.get("deviceType");
    const protocol = url.searchParams.get("protocol");
    const connectivity = url.searchParams.get("connectivity");
    const readiness = url.searchParams.get("readiness");
    const freshness = url.searchParams.get("freshness");

    const items = fixtures.devices.list.items.filter((device) => {
      if (query) {
        const haystack = `${device.name} ${device.externalId} ${device.typeName} ${device.siteName}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      if (deviceType && device.typeCode !== deviceType) return false;
      if (protocol && device.protocol !== protocol) return false;
      if (connectivity && device.connectivity !== connectivity) return false;
      if (readiness && device.readiness !== readiness) return false;
      if (freshness && device.freshness !== freshness) return false;
      return true;
    });

    return HttpResponse.json({
      items,
      page: { pageSize: 25, hasNext: false, nextCursor: null },
      total: fixtures.devices.list.total,
    });
  }),

  http.get("/api/v1/devices/:deviceId", ({ params }) => {
    const deviceId = String(params.deviceId);
    if (deviceId === "device-soil-01") {
      return HttpResponse.json(fixtures.devices.detailOnline);
    }
    if (deviceId === "device-soil-02") {
      return HttpResponse.json(fixtures.devices.detailOffline);
    }
    return HttpResponse.json(fixtures.errors.notFound, { status: 404 });
  }),

  http.get("/api/v1/devices/:deviceId/state", ({ params }) => {
    const deviceId = String(params.deviceId);
    if (deviceId === "device-soil-01") {
      return HttpResponse.json(fixtures.devices.stateLive);
    }
    if (deviceId === "device-soil-02") {
      return HttpResponse.json(fixtures.devices.stateStale);
    }
    return HttpResponse.json(fixtures.errors.notFound, { status: 404 });
  }),

  http.get("/api/v1/devices/:deviceId/telemetry/series", () => {
    return HttpResponse.json(fixtures.telemetry.series24h);
  }),
];

import { afterEach, describe, expect, it, vi } from "vitest";
import { fieldOpsClient } from "./client";

function jsonResponse(): Response {
  return new Response("{}", {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function installFetchSpy() {
  const fetchSpy = vi.fn<typeof fetch>(async () => jsonResponse());
  vi.stubGlobal("fetch", fetchSpy);
  return fetchSpy;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("FieldOpsClient frozen request mapping", () => {
  it("keeps siteId on operations that define it", async () => {
    const fetchSpy = installFetchSpy();

    await fieldOpsClient.getOverview({ tenantId: "tenant-a", siteId: "site-a", range: "PT24H" });
    await fieldOpsClient.getDevices({ tenantId: "tenant-a", siteId: "site-a", pageSize: 25 });

    expect(fetchSpy.mock.calls[0]?.[0]).toBe(
      "/api/v1/dashboard/overview?tenantId=tenant-a&siteId=site-a&range=PT24H",
    );
    expect(fetchSpy.mock.calls[1]?.[0]).toBe(
      "/api/v1/devices?tenantId=tenant-a&siteId=site-a&pageSize=25",
    );
  });

  it("keeps the tenant scope on device detail and state", async () => {
    const fetchSpy = installFetchSpy();

    await fieldOpsClient.getDevice("device/one", { tenantId: "tenant-a" });
    await fieldOpsClient.getDeviceState("device/one", { tenantId: "tenant-a" });

    expect(fetchSpy.mock.calls[0]?.[0]).toBe(
      "/api/v1/devices/device%2Fone?tenantId=tenant-a",
    );
    expect(fetchSpy.mock.calls[1]?.[0]).toBe(
      "/api/v1/devices/device%2Fone/state?tenantId=tenant-a",
    );
  });

  it("serializes only contract parameters for device telemetry series", async () => {
    const fetchSpy = installFetchSpy();

    await fieldOpsClient.getDeviceSeries("device-soil-01", {
      tenantId: "tenant-a",
      range: "PT24H",
      bucket: "PT5M",
      metrics: "soil.moisture.pct,air.temperature.c",
    });

    const url = String(fetchSpy.mock.calls[0]?.[0]);
    expect(url).toBe(
      "/api/v1/devices/device-soil-01/telemetry/series?tenantId=tenant-a&range=PT24H&bucket=PT5M&metrics=soil.moisture.pct%2Cair.temperature.c",
    );
    expect(url).not.toContain("siteId");
  });

  it("performs a CSRF-protected local session logout", async () => {
    const fetchSpy = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ headerName: "X-XSRF-TOKEN", parameterName: "_csrf", token: "token-1" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchSpy);

    await fieldOpsClient.logout();

    expect(fetchSpy.mock.calls[0]?.[0]).toBe("/api/v1/auth/csrf");
    expect(fetchSpy.mock.calls[1]?.[0]).toBe("/api/v1/auth/logout");
    expect(fetchSpy.mock.calls[1]?.[1]).toMatchObject({
      method: "POST",
      credentials: "include",
      headers: { "X-XSRF-TOKEN": "token-1" },
    });
  });

  it("posts a durable command with CSRF, JSON, and the caller idempotency key", async () => {
    const fetchSpy = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        headerName: "X-XSRF-TOKEN", parameterName: "_csrf", token: "token-1",
      }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(jsonResponse());
    vi.stubGlobal("fetch", fetchSpy);

    await fieldOpsClient.requestCommand("tenant-a", "b05-idem-client-1", {
      siteId: "site-a", deviceId: "valve-a-01", type: "OPEN", scenario: "SUCCESS",
    });

    expect(fetchSpy.mock.calls[1]?.[0]).toBe("/api/v1/commands?tenantId=tenant-a");
    expect(fetchSpy.mock.calls[1]?.[1]).toMatchObject({
      method: "POST",
      credentials: "include",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "Idempotency-Key": "b05-idem-client-1",
        "X-XSRF-TOKEN": "token-1",
      },
      body: JSON.stringify({ siteId: "site-a", deviceId: "valve-a-01", type: "OPEN", scenario: "SUCCESS" }),
    });
  });
});

import { describe, expect, it } from "vitest";
import { queryKeys } from "./query-keys";

describe("queryKeys", () => {
  it("isolates tenant and site in the device list key", () => {
    const a = queryKeys.devices.list("tenant-a", "site-a", {});
    const b = queryKeys.devices.list("tenant-b", "site-a", {});
    const c = queryKeys.devices.list("tenant-a", "site-b", {});
    expect(a).not.toEqual(b);
    expect(a).not.toEqual(c);
  });

  it("normalizes filter key order", () => {
    const a = queryKeys.devices.list("t", "s", { connectivity: "ONLINE", protocol: "MQTT" });
    const b = queryKeys.devices.list("t", "s", { protocol: "MQTT", connectivity: "ONLINE" });
    expect(a).toEqual(b);
  });

  it("includes deviceId in state and detail keys", () => {
    expect(queryKeys.devices.detail("t", "s", "d1")).toEqual(["device", "t", "s", "d1"]);
    expect(queryKeys.devices.state("t", "s", "d1")).toEqual(["device-state", "t", "s", "d1"]);
  });

  it("includes range/bucket in series keys", () => {
    expect(queryKeys.overview.environmentSeries("t", "s", "PT24H", "PT5M")).toEqual([
      "environment-series",
      "t",
      "s",
      "PT24H",
      "PT5M",
    ]);
  });
});
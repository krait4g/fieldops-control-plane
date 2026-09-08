import { describe, expect, it } from "vitest";
import {
  connectivityStatus,
  freshnessStatus,
  memberStatusLabelOf,
  metricQualityStatus,
  readinessStatus,
  roleLabel,
  sourceLabel,
  statusLabelOrUnknown,
} from "./labels";

describe("connectivityStatus", () => {
  it("maps every connectivity code to a non-empty label", () => {
    expect(connectivityStatus("ONLINE").label).toBe("Online");
    expect(connectivityStatus("ONLINE").tone).toBe("success");
    expect(connectivityStatus("OFFLINE").tone).toBe("critical");
    expect(connectivityStatus("DEGRADED").tone).toBe("warning");
    expect(connectivityStatus("UNKNOWN").tone).toBe("unknown");
  });
});

describe("readinessStatus", () => {
  it("does not infer READY from ONLINE", () => {
    expect(readinessStatus("READY").label).toBe("Ready");
    expect(readinessStatus("UNKNOWN").label).toBe("Unknown");
  });
});

describe("memberStatusLabelOf", () => {
  it("labels active/suspended/invited", () => {
    expect(memberStatusLabelOf("ACTIVE").label).toBe("Active");
    expect(memberStatusLabelOf("SUSPENDED").tone).toBe("critical");
    expect(memberStatusLabelOf("INVITED").label).toBe("Invited");
  });
});

describe("statusLabelOrUnknown", () => {
  it("falls back to Unknown for unknown codes", () => {
    expect(statusLabelOrUnknown("SOMETHING_NEW", {})).toBe("Unknown");
  });
});

describe("sourceLabel", () => {
  it("maps known sources and falls back to unknown", () => {
    expect(sourceLabel("REDIS_REALTIME")).toBe("Realtime state");
    expect(sourceLabel("POSTGRES_SNAPSHOT")).toBe("Database snapshot");
    expect(sourceLabel(undefined)).toBe("No state available");
    expect(sourceLabel("FUTURE_SOURCE")).toBe("Unknown");
  });
});

describe("roleLabel / freshnessStatus / metricQualityStatus", () => {
  it("provides stable labels", () => {
    expect(roleLabel("TENANT_ADMIN")).toBe("Tenant admin");
    expect(freshnessStatus("FRESH").label).toBe("Current");
    expect(freshnessStatus("STALE").label).toBe("Stale");
    expect(metricQualityStatus("BAD").tone).toBe("critical");
    expect(metricQualityStatus("GOOD").tone).toBe("success");
  });
});
import { describe, expect, it } from "vitest";
import { resolveContext } from "./context-resolution";
import type { SessionResponse } from "@/shared/api/types";

function session(overrides: Partial<SessionResponse> = {}): SessionResponse {
  return {
    user: { id: "u1", displayName: "A", email: "a@fieldops.local" },
    memberships: [
      {
        tenant: { id: "tenant-demo", name: "Demo", timezone: "Asia/Seoul" },
        role: "TENANT_ADMIN",
        permissions: ["OVERVIEW_READ", "DEVICE_READ"],
        sites: [
          { id: "site-a", name: "A", timezone: "Asia/Seoul" },
          { id: "site-b", name: "B", timezone: "Asia/Seoul" },
        ],
      },
    ],
    activeContext: { tenantId: "tenant-demo", siteId: "site-a" },
    issuedAt: "2026-09-03T00:00:00Z",
    ...overrides,
  };
}

describe("resolveContext", () => {
  it("accepts a URL tenant/site explicitly present in the session", () => {
    const result = resolveContext(session(), "tenant-demo", "site-b");
    expect(result).toEqual({ tenantId: "tenant-demo", siteId: "site-b", hasAccessibleSite: true });
  });

  it("rejects a URL site that is not allowed and falls back to active context", () => {
    const result = resolveContext(session(), "tenant-demo", "site-forbidden");
    expect(result).toEqual({ tenantId: "tenant-demo", siteId: "site-a", hasAccessibleSite: true });
  });

  it("rejects a URL tenant not in the session", () => {
    const result = resolveContext(session(), "tenant-other", "site-a");
    expect(result).toEqual({ tenantId: "tenant-demo", siteId: "site-a", hasAccessibleSite: true });
  });

  it("falls back to the first tenant/site when active context is empty", () => {
    const result = resolveContext(
      session({ activeContext: { tenantId: "tenant-demo", siteId: null } }),
      undefined,
      undefined,
    );
    expect(result).toEqual({ tenantId: "tenant-demo", siteId: "site-a", hasAccessibleSite: true });
  });

  it("reports no accessible site when the membership has no sites", () => {
    const noSite = session({
      memberships: [
        {
          tenant: { id: "tenant-demo", name: "Demo", timezone: "Asia/Seoul" },
          role: "TENANT_VIEWER",
          permissions: ["OVERVIEW_READ"],
          sites: [],
        },
      ],
      activeContext: { tenantId: "tenant-demo", siteId: null },
    });
    const result = resolveContext(noSite, undefined, undefined);
    expect(result.hasAccessibleSite).toBe(false);
    expect(result.siteId).toBeNull();
  });
});
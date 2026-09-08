import { http, HttpResponse } from "msw";
import { fixtures } from "../fixture-loader";
import { getSessionScenario } from "../session-store";

const MEMBER_READ_DENIED = {
  type: "https://fieldops.dev/problems/member-read-denied",
  title: "Member access denied",
  status: 403,
  code: "MEMBER_READ_DENIED",
  detail: "The current session cannot read tenant members.",
  traceId: "trace-demo-member-403",
  timestamp: "2026-09-03T04:30:00Z",
};

export const memberHandlers = [
  http.get("/api/v1/members", ({ request }) => {
    // Backend remains the final authority: only the admin scenario carries
    // MEMBER_READ in the fixture set.
    if (getSessionScenario() !== "admin") {
      return HttpResponse.json(MEMBER_READ_DENIED, { status: 403 });
    }

    const url = new URL(request.url);
    const query = (url.searchParams.get("query") ?? "").toLowerCase();
    const role = url.searchParams.get("role");
    const status = url.searchParams.get("status");
    const siteId = url.searchParams.get("siteId");

    const items = fixtures.members.list.items.filter((member) => {
      if (query) {
        const haystack = `${member.displayName} ${member.email}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      if (role && member.role !== role) return false;
      if (status && member.status !== status) return false;
      if (siteId && !member.allSites && !member.siteScopes.some((s) => s.id === siteId)) {
        return false;
      }
      return true;
    });

    return HttpResponse.json({
      items,
      page: { pageSize: 25, hasNext: false, nextCursor: null },
      total: fixtures.members.list.total,
    });
  }),
];
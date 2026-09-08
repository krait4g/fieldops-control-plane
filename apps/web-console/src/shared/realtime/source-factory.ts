import { usesMock } from "@/shared/api/bootstrap";
import { BrowserEventSourceTransport } from "./browser-event-source";
import { FixtureRealtimeTransport } from "./fixture-realtime-transport";
import type { SiteEventSource } from "./types";

/**
 * The single place that picks the realtime transport by data mode.
 */
export function createSiteEventSource(tenantId: string, siteId: string): SiteEventSource {
  if (usesMock()) {
    return new FixtureRealtimeTransport(tenantId, siteId);
  }
  return new BrowserEventSourceTransport(buildStreamUrl(tenantId, siteId));
}

export function buildStreamUrl(tenantId: string, siteId: string): string {
  const query = new URLSearchParams({ tenantId, siteId });
  return `/api/v1/events/stream?${query.toString()}`;
}

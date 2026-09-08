import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useSiteEvents, type UseSiteEventsInput } from "./use-site-events";
import { InMemorySiteEventSource } from "./in-memory-source";
import { queryKeys } from "@/shared/api/http/query-keys";
import type { DeviceListResponse, DeviceStateResponse } from "@/shared/api/types";
import type {
  DeviceLifecycleChangedEvent,
  DeviceStateUpdatedEvent,
  SiteEvent,
} from "./types";

const TENANT = "tenant-demo";
const SITE = "site-green-valley";
const DEVICE = "device-soil-01";

function seedState(queryClient: QueryClient, stateVersion = 1824) {
  const state: DeviceStateResponse = {
    deviceId: DEVICE,
    connectivity: "ONLINE",
    readiness: "READY",
    freshness: "FRESH",
    source: "POSTGRES_SNAPSHOT",
    stateVersion,
    stateEpoch: "fixture:0",
    revision: stateVersion,
    observedAt: "2026-09-03T04:29:55Z",
    receivedAt: "2026-09-03T04:29:56Z",
    staleAt: null,
    metrics: [],
  };
  queryClient.setQueryData(queryKeys.devices.state(TENANT, SITE, DEVICE), state);
}

function seedList(queryClient: QueryClient, version = 1824) {
  const list: DeviceListResponse = {
    items: [
      {
        id: DEVICE,
        externalId: "soil-01",
        name: "Soil sensor 01",
        typeCode: "SOIL_SENSOR",
        typeName: "Soil sensor",
        siteId: SITE,
        siteName: "Green Valley",
        zoneId: "zone-a",
        zoneName: "Zone A",
        protocol: "MQTT",
        connectivity: "ONLINE",
        readiness: "READY",
        freshness: "FRESH",
        latestMetric: null,
        lastSeenAt: "2026-09-03T04:29:56Z",
        activeAlarmCount: 0,
        version,
      },
    ],
    page: { pageSize: 25, hasNext: false, nextCursor: null },
    total: 1,
  };
  queryClient.setQueryData(queryKeys.devices.list(TENANT, SITE, {}), list);
}

function stateEvent(version: number): DeviceStateUpdatedEvent {
  return {
    eventId: `evt-${version}`,
    eventType: "device.state.updated",
    tenantId: TENANT,
    siteId: SITE,
    resourceType: "DEVICE",
    resourceId: DEVICE,
    version,
    stateEpoch: "fixture:0",
    revision: version,
    occurredAt: "2026-09-03T04:31:00Z",
    payload: {
      connectivity: "ONLINE",
      readiness: "READY",
      freshness: "FRESH",
      source: "REDIS_REALTIME",
      observedAt: "2026-09-03T04:30:59Z",
      receivedAt: "2026-09-03T04:31:00Z",
      staleAt: "2026-09-03T04:31:30Z",
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

function lifecycleEvent(version: number): DeviceLifecycleChangedEvent {
  return {
    eventId: `lifecycle-${version}`,
    eventType: "device.lifecycle.changed",
    tenantId: TENANT,
    siteId: SITE,
    resourceType: "DEVICE",
    resourceId: DEVICE,
    version,
    stateEpoch: "fixture:0",
    revision: version,
    occurredAt: "2026-09-03T04:32:00Z",
    payload: {
      previousConnectivity: "ONLINE",
      connectivity: "OFFLINE",
      changedAt: "2026-09-03T04:32:00Z",
      reasonCode: "HEARTBEAT_TIMEOUT",
    },
  };
}

function heartbeatEvent(overrides: Partial<SiteEvent> = {}): SiteEvent {
  return {
    eventId: "heartbeat-1",
    eventType: "heartbeat",
    tenantId: TENANT,
    siteId: SITE,
    resourceType: "SITE",
    resourceId: SITE,
    version: 0,
    stateEpoch: "fixture:0",
    revision: 0,
    occurredAt: "2026-09-03T04:32:15Z",
    payload: { serverTime: "2026-09-03T04:32:15Z" },
    ...overrides,
  } as SiteEvent;
}

function snapshotRequiredEvent(): SiteEvent {
  return {
    eventId: "snapshot-1",
    eventType: "snapshot-required",
    tenantId: TENANT,
    siteId: SITE,
    resourceType: "SITE",
    resourceId: SITE,
    version: 0,
    stateEpoch: "fixture:0",
    revision: 0,
    occurredAt: "2026-09-03T04:32:00Z",
    payload: { reason: "REPLAY_WINDOW_EXPIRED", lastAvailableEventId: null },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function flushPromises() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function openSource(source: InMemorySiteEventSource | undefined) {
  act(() => source?.emitOpen());
  await flushPromises();
}

describe("useSiteEvents", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: true });
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  });

  afterEach(() => {
    vi.useRealTimers();
    queryClient.clear();
  });

  function renderEvents(overrides: Partial<UseSiteEventsInput> = {}) {
    const sources: InMemorySiteEventSource[] = [];
    const sourceFactory = vi.fn(() => {
      const source = new InMemorySiteEventSource();
      sources.push(source);
      return source;
    });
    const input: UseSiteEventsInput = {
      tenantId: TENANT,
      siteId: SITE,
      enabled: true,
      snapshotReady: true,
      revalidateRequiredSnapshot: vi.fn(async () => true),
      revalidateSession: vi.fn(async () => true),
      sourceFactory,
      ...overrides,
    };
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const rendered = renderHook((props: UseSiteEventsInput) => useSiteEvents(props), {
      wrapper,
      initialProps: input,
    });
    return { ...rendered, input, sources, sourceFactory };
  }

  it("does not create a source until the required snapshot is ready", () => {
    const rendered = renderEvents({ snapshotReady: false });
    expect(rendered.sources).toHaveLength(0);
    expect(rendered.result.current.status).toBe("SNAPSHOT");

    rendered.rerender({ ...rendered.input, snapshotReady: true });
    expect(rendered.sources).toHaveLength(1);
    expect(rendered.sources[0]?.openCount).toBe(1);
    expect(rendered.result.current.status).toBe("CONNECTING");
  });

  it("reports LIVE only after the source opens and the REST snapshot is refreshed", async () => {
    const { result, sources } = renderEvents();
    expect(result.current.status).toBe("CONNECTING");
    await openSource(sources[0]);
    expect(result.current.status).toBe("LIVE");
  });

  it("keeps the last cache and stays disconnected when snapshot recovery fails", async () => {
    seedState(queryClient);
    const revalidate = vi.fn(async () => false);
    const { result, sources } = renderEvents({ revalidateRequiredSnapshot: revalidate });
    await openSource(sources[0]);

    expect(revalidate).toHaveBeenCalledTimes(1);
    expect(sources).toHaveLength(1);
    expect(sources[0]?.isOpened).toBe(false);
    expect(result.current.status).toBe("DISCONNECTED");
    expect(result.current.snapshotStale).toBe(true);
    expect(
      queryClient.getQueryData<DeviceStateResponse>(
        queryKeys.devices.state(TENANT, SITE, DEVICE),
      )?.stateVersion,
    ).toBe(1824);
  });

  it("pauses events, awaits the snapshot, then creates a fresh source", async () => {
    seedState(queryClient);
    const gate = deferred<boolean>();
    const revalidate = vi
      .fn<() => Promise<boolean>>()
      .mockResolvedValueOnce(true)
      .mockImplementationOnce(() => gate.promise)
      .mockResolvedValue(true);
    const { result, sources } = renderEvents({
      revalidateRequiredSnapshot: revalidate,
    });
    await openSource(sources[0]);
    act(() => sources[0]?.emitEvent(snapshotRequiredEvent()));

    expect(result.current.status).toBe("SNAPSHOT_REQUIRED");
    expect(sources[0]?.isOpened).toBe(false);
    act(() => sources[0]?.emitEvent(stateEvent(9999)));
    expect(
      queryClient.getQueryData<DeviceStateResponse>(
        queryKeys.devices.state(TENANT, SITE, DEVICE),
      )?.stateVersion,
    ).toBe(1824);

    await act(async () => gate.resolve(true));
    expect(sources).toHaveLength(2);
    expect(result.current.status).toBe("CONNECTING");
    await openSource(sources[1]);
    expect(result.current.status).toBe("LIVE");
  });

  it("revalidates snapshot and session before a failed recovery can retry", async () => {
    const revalidate = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true);
    const revalidateSession = vi.fn(async () => true);
    const { result, sources } = renderEvents({
      revalidateRequiredSnapshot: revalidate,
      revalidateSession,
    });
    await openSource(sources[0]);
    expect(result.current.status).toBe("DISCONNECTED");

    act(() => result.current.retry());
    await flushPromises();
    expect(revalidate).toHaveBeenCalledTimes(2);
    expect(revalidateSession).toHaveBeenCalledTimes(1);
    expect(sources).toHaveLength(2);
    expect(result.current.status).toBe("CONNECTING");
    await openSource(sources[1]);
    expect(result.current.status).toBe("LIVE");
    expect(result.current.snapshotStale).toBe(false);
  });

  it("closes offline and revalidates session plus snapshot before online reconnect", async () => {
    const revalidate = vi.fn(async () => true);
    const revalidateSession = vi.fn(async () => true);
    const { result, sources } = renderEvents({
      revalidateRequiredSnapshot: revalidate,
      revalidateSession,
    });
    await openSource(sources[0]);
    act(() => window.dispatchEvent(new Event("offline")));
    expect(result.current.status).toBe("DISCONNECTED");
    expect(sources[0]?.isOpened).toBe(false);

    act(() => window.dispatchEvent(new Event("online")));
    await flushPromises();
    expect(revalidate).toHaveBeenCalledTimes(2);
    expect(revalidateSession).toHaveBeenCalledTimes(1);
    expect(sources).toHaveLength(2);
    expect(result.current.status).toBe("CONNECTING");
    await openSource(sources[1]);
    expect(result.current.status).toBe("LIVE");
  });

  it("revalidates an old snapshot when a hidden page becomes visible", async () => {
    vi.useFakeTimers();
    const revalidate = vi.fn(async () => true);
    const { result, sources } = renderEvents({ revalidateRequiredSnapshot: revalidate });
    await openSource(sources[0]);
    act(() => vi.advanceTimersByTime(46_000));
    expect(result.current.status).toBe("STALE");

    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    await flushPromises();

    expect(revalidate).toHaveBeenCalledTimes(2);
    expect(sources).toHaveLength(2);
    expect(result.current.status).toBe("CONNECTING");
  });

  it("does not synthesize a state cache before its REST snapshot", async () => {
    const { sources } = renderEvents();
    await openSource(sources[0]);
    act(() => {
      sources[0]?.emitEvent(stateEvent(1825));
    });
    expect(
      queryClient.getQueryData(queryKeys.devices.state(TENANT, SITE, DEVICE)),
    ).toBeUndefined();
  });

  it("applies only higher-revision, correctly scoped device events", async () => {
    seedState(queryClient);
    const { sources } = renderEvents();
    await openSource(sources[0]);
    act(() => {
      sources[0]?.emitEvent({ ...stateEvent(3000), tenantId: "tenant-other" });
      sources[0]?.emitEvent({ ...stateEvent(3001), siteId: "site-other" });
      sources[0]?.emitEvent(stateEvent(1824));
      sources[0]?.emitEvent(stateEvent(1823));
    });
    expect(
      queryClient.getQueryData<DeviceStateResponse>(
        queryKeys.devices.state(TENANT, SITE, DEVICE),
      )?.stateVersion,
    ).toBe(1824);

    act(() => sources[0]?.emitEvent(stateEvent(1825)));
    expect(
      queryClient.getQueryData<DeviceStateResponse>(
        queryKeys.devices.state(TENANT, SITE, DEVICE),
      )?.stateVersion,
    ).toBe(1825);
  });

  it("patches lifecycle state and the exact scoped device list", async () => {
    seedState(queryClient);
    seedList(queryClient);
    const { sources } = renderEvents();
    await openSource(sources[0]);
    act(() => {
      sources[0]?.emitEvent(lifecycleEvent(1825));
    });

    expect(
      queryClient.getQueryData<DeviceStateResponse>(
        queryKeys.devices.state(TENANT, SITE, DEVICE),
      )?.connectivity,
    ).toBe("OFFLINE");
    expect(
      queryClient.getQueryData<DeviceListResponse>(
        queryKeys.devices.list(TENANT, SITE, {}),
      )?.items[0]?.connectivity,
    ).toBe("OFFLINE");
  });

  it("debounces overview invalidation within the active tenant/site scope", async () => {
    vi.useFakeTimers();
    seedState(queryClient);
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { sources } = renderEvents();
    await openSource(sources[0]);
    act(() => {
      sources[0]?.emitEvent(stateEvent(1825));
      sources[0]?.emitEvent(stateEvent(1826));
      vi.advanceTimersByTime(500);
    });

    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["overview", TENANT, SITE] });
  });

  it("cancels scoped debounce and rejects old listeners on context change", async () => {
    vi.useFakeTimers();
    seedState(queryClient);
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const rendered = renderEvents();
    await openSource(rendered.sources[0]);
    act(() => {
      rendered.sources[0]?.emitEvent(stateEvent(1825));
    });

    rendered.rerender({
      ...rendered.input,
      tenantId: "tenant-next",
      siteId: "site-next",
    });
    expect(rendered.sources[0]?.isOpened).toBe(false);
    act(() => {
      rendered.sources[0]?.emitEvent(stateEvent(9000));
      vi.advanceTimersByTime(500);
    });
    expect(invalidate).not.toHaveBeenCalled();
    expect(
      queryClient.getQueryData<DeviceStateResponse>(
        queryKeys.devices.state(TENANT, SITE, DEVICE),
      )?.stateVersion,
    ).toBe(1825);
  });

  it("discards a completed recovery from the previous context generation", async () => {
    const gate = deferred<boolean>();
    const revalidate = vi
      .fn<() => Promise<boolean>>()
      .mockResolvedValueOnce(true)
      .mockImplementationOnce(() => gate.promise)
      .mockResolvedValue(true);
    const rendered = renderEvents({
      revalidateRequiredSnapshot: revalidate,
    });
    await openSource(rendered.sources[0]);
    act(() => rendered.sources[0]?.emitEvent(snapshotRequiredEvent()));
    expect(rendered.result.current.status).toBe("SNAPSHOT_REQUIRED");

    rendered.rerender({
      ...rendered.input,
      tenantId: "tenant-next",
      siteId: "site-next",
    });
    expect(rendered.sources).toHaveLength(2);
    await act(async () => gate.resolve(true));

    expect(rendered.sources).toHaveLength(2);
    expect(rendered.result.current.status).toBe("CONNECTING");
    await openSource(rendered.sources[1]);
    expect(rendered.result.current.status).toBe("LIVE");
  });

  it("uses heartbeat only for liveness and restores LIVE from STALE", async () => {
    vi.useFakeTimers();
    seedState(queryClient);
    const { result, sources } = renderEvents();
    await openSource(sources[0]);
    act(() => vi.advanceTimersByTime(45_000));
    expect(result.current.status).toBe("STALE");

    act(() => sources[0]?.emitEvent(heartbeatEvent()));
    expect(result.current.status).toBe("LIVE");
    expect(result.current.lastHeartbeatAt).toBeDefined();
    expect(
      queryClient.getQueryData<DeviceStateResponse>(
        queryKeys.devices.state(TENANT, SITE, DEVICE),
      )?.stateVersion,
    ).toBe(1824);
  });

  it("ignores a site event whose resource scope does not match", async () => {
    const revalidate = vi.fn(async () => true);
    const { result, sources } = renderEvents({ revalidateRequiredSnapshot: revalidate });
    await openSource(sources[0]);
    revalidate.mockClear();
    act(() =>
      sources[0]?.emitEvent({ ...snapshotRequiredEvent(), resourceId: "site-other" } as SiteEvent),
    );
    expect(revalidate).not.toHaveBeenCalled();
    expect(result.current.status).toBe("LIVE");
  });

  it("does not let repeated errors postpone stale and disconnected timers", async () => {
    vi.useFakeTimers();
    const { result, sources } = renderEvents();
    await openSource(sources[0]);
    act(() => {
      vi.advanceTimersByTime(30_000);
      sources[0]?.emitError();
      vi.advanceTimersByTime(15_000);
    });
    expect(result.current.status).toBe("STALE");
    act(() => vi.advanceTimersByTime(75_000));
    expect(result.current.status).toBe("DISCONNECTED");
  });

  it("closes its source and clears listeners on unmount", async () => {
    const { sources, unmount } = renderEvents();
    await openSource(sources[0]);
    unmount();
    expect(sources[0]?.isOpened).toBe(false);
    expect(sources[0]?.closeCount).toBeGreaterThan(0);
  });
});

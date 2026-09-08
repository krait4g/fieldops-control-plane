"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { LiveConnectionStatus } from "@/shared/lib/view-models";
import type { DeviceListResponse, DeviceStateResponse } from "@/shared/api/types";
import { queryKeys } from "@/shared/api/http/query-keys";
import { usesMock } from "@/shared/api/bootstrap";
import { createSiteEventSource } from "./source-factory";
import type {
  DeviceLifecycleChangedEvent,
  DeviceStateUpdatedEvent,
  SiteEvent,
  SiteEventListener,
  SiteEventSource,
} from "./types";
import {
  EVENT_DEVICE_LIFECYCLE_CHANGED,
  EVENT_DEVICE_STATE_UPDATED,
  EVENT_HEARTBEAT,
  EVENT_SNAPSHOT_REQUIRED,
} from "./types";
import { installFixtureRealtimeTestApi } from "./fixture-realtime-transport";

const STALE_MS = 45_000;
const DISCONNECTED_MS = 120_000;
const OVERVIEW_INVALIDATE_DEBOUNCE_MS = 500;
const MAX_BUFFERED_EVENTS = 256;

type RecoveryReason = "snapshot-required" | "online" | "retry" | "visibility";

export interface UseSiteEventsInput {
  tenantId: string;
  siteId: string;
  enabled: boolean;
  snapshotReady: boolean;
  revalidateRequiredSnapshot: () => Promise<boolean>;
  revalidateSession?: () => Promise<boolean>;
  /** Test seam: overrides the transport factory. */
  sourceFactory?: (tenantId: string, siteId: string) => SiteEventSource;
}

export interface SiteEventsResult {
  status: LiveConnectionStatus;
  snapshotStale: boolean;
  lastEventAt?: string;
  lastHeartbeatAt?: string;
  retry: () => void;
  close: () => void;
}

export function useSiteEvents(input: UseSiteEventsInput): SiteEventsResult {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<LiveConnectionStatus>("SNAPSHOT");
  const [snapshotStale, setSnapshotStale] = useState(false);
  const [lastEventAt, setLastEventAt] = useState<string>();
  const [lastHeartbeatAt, setLastHeartbeatAt] = useState<string>();

  const sourceRef = useRef<SiteEventSource | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const staleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disconnectedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const invalidateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generationRef = useRef(0);
  const snapshotPausedRef = useRef(true);
  const openedRef = useRef(false);
  const lastSignalAtRef = useRef(0);
  const recoveryRef = useRef<Promise<void> | null>(null);
  const bufferingRef = useRef(false);
  const bufferedEventsRef = useRef<SiteEvent[]>([]);
  const recoverRef = useRef<(reason: RecoveryReason) => Promise<void>>(async () => undefined);

  const enabledRef = useRef(input.enabled);
  const snapshotReadyRef = useRef(input.snapshotReady);
  const tenantIdRef = useRef(input.tenantId);
  const siteIdRef = useRef(input.siteId);
  const sourceFactoryRef = useRef(input.sourceFactory);
  const revalidateRequiredSnapshotRef = useRef(input.revalidateRequiredSnapshot);
  const revalidateSessionRef = useRef(input.revalidateSession);
  const clearLivenessTimers = useCallback(() => {
    if (staleTimerRef.current) clearTimeout(staleTimerRef.current);
    if (disconnectedTimerRef.current) clearTimeout(disconnectedTimerRef.current);
    staleTimerRef.current = null;
    disconnectedTimerRef.current = null;
  }, []);

  const clearInvalidateTimer = useCallback(() => {
    if (invalidateTimerRef.current) clearTimeout(invalidateTimerRef.current);
    invalidateTimerRef.current = null;
  }, []);

  const disconnectCurrent = useCallback(() => {
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
    sourceRef.current?.close();
    sourceRef.current = null;
    openedRef.current = false;
    bufferingRef.current = false;
    bufferedEventsRef.current = [];
    clearLivenessTimers();
    clearInvalidateTimer();
  }, [clearInvalidateTimer, clearLivenessTimers]);

  const armLivenessTimers = useCallback(
    (generation: number) => {
      clearLivenessTimers();
      staleTimerRef.current = setTimeout(() => {
        if (generation !== generationRef.current || snapshotPausedRef.current) return;
        setSnapshotStale(true);
        setStatus("STALE");
      }, STALE_MS);
      disconnectedTimerRef.current = setTimeout(() => {
        if (generation !== generationRef.current || snapshotPausedRef.current) return;
        setSnapshotStale(true);
        setStatus("DISCONNECTED");
      }, DISCONNECTED_MS);
    },
    [clearLivenessTimers],
  );

  const recordSignal = useCallback(
    (generation: number) => {
      if (generation !== generationRef.current || snapshotPausedRef.current) return;
      lastSignalAtRef.current = Date.now();
      armLivenessTimers(generation);
      if (openedRef.current) {
        setSnapshotStale(false);
        setStatus("LIVE");
      }
    },
    [armLivenessTimers],
  );

  const patchDeviceLists = useCallback(
    (event: DeviceStateUpdatedEvent | DeviceLifecycleChangedEvent) => {
      const tenantId = tenantIdRef.current;
      const siteId = siteIdRef.current;
      queryClient.setQueriesData<DeviceListResponse>(
        { queryKey: ["devices", tenantId, siteId] },
        (current) => {
          if (!current) return current;
          let changed = false;
          const items = current.items.map((item) => {
            if (item.id !== event.resourceId || event.version <= item.version) return item;
            changed = true;
            if (event.eventType === EVENT_DEVICE_STATE_UPDATED) {
              return {
                ...item,
                connectivity: event.payload.connectivity,
                readiness: event.payload.readiness,
                freshness: event.payload.freshness,
                latestMetric: event.payload.metrics[0] ?? null,
                lastSeenAt: event.payload.receivedAt,
                version: event.version,
              };
            }
            return {
              ...item,
              connectivity: event.payload.connectivity,
              lastSeenAt: event.payload.changedAt,
              version: event.version,
            };
          });
          return changed ? { ...current, items } : current;
        },
      );
    },
    [queryClient],
  );

  const applyDeviceStateEvent = useCallback(
    (event: DeviceStateUpdatedEvent) => {
      const key = queryKeys.devices.state(
        tenantIdRef.current,
        siteIdRef.current,
        event.resourceId,
      );
      const cached = queryClient.getQueryData<DeviceStateResponse>(key);
      if (
        !cached ||
        (event.stateEpoch === cached.stateEpoch && event.revision <= cached.revision)
      ) return;
      queryClient.setQueryData<DeviceStateResponse>(key, {
        deviceId: event.resourceId,
        connectivity: event.payload.connectivity,
        readiness: event.payload.readiness,
        freshness: event.payload.freshness,
        source: event.payload.source,
        stateVersion: event.version,
        stateEpoch: event.stateEpoch,
        revision: event.revision,
        observedAt: event.payload.observedAt,
        receivedAt: event.payload.receivedAt,
        staleAt: event.payload.staleAt,
        metrics: event.payload.metrics,
      });
    },
    [queryClient],
  );

  const applyDeviceLifecycleEvent = useCallback(
    (event: DeviceLifecycleChangedEvent) => {
      const key = queryKeys.devices.state(
        tenantIdRef.current,
        siteIdRef.current,
        event.resourceId,
      );
      const cached = queryClient.getQueryData<DeviceStateResponse>(key);
      if (
        !cached ||
        (event.stateEpoch === cached.stateEpoch && event.revision <= cached.revision)
      ) return;
      queryClient.setQueryData<DeviceStateResponse>(key, {
        ...cached,
        connectivity: event.payload.connectivity,
        stateVersion: event.version,
        stateEpoch: event.stateEpoch,
        revision: event.revision,
        receivedAt: event.payload.changedAt,
      });
    },
    [queryClient],
  );

  const scheduleOverviewInvalidate = useCallback(() => {
    if (invalidateTimerRef.current) return;
    const tenantId = tenantIdRef.current;
    const siteId = siteIdRef.current;
    invalidateTimerRef.current = setTimeout(() => {
      invalidateTimerRef.current = null;
      void queryClient
        .invalidateQueries({ queryKey: ["overview", tenantId, siteId] })
        .catch(() => undefined);
    }, OVERVIEW_INVALIDATE_DEBOUNCE_MS);
  }, [queryClient]);

  const handleEvent = useCallback(
    (event: SiteEvent, generation: number) => {
      if (generation !== generationRef.current || snapshotPausedRef.current) return;
      if (bufferingRef.current) {
        if (bufferedEventsRef.current.length >= MAX_BUFFERED_EVENTS) {
          bufferedEventsRef.current.shift();
        }
        bufferedEventsRef.current.push(event);
        return;
      }
      const tenantId = tenantIdRef.current;
      const siteId = siteIdRef.current;
      if (event.tenantId !== tenantId || event.siteId !== siteId) return;

      if (event.eventType === EVENT_HEARTBEAT) {
        if (event.resourceId !== siteId) return;
        setLastHeartbeatAt(new Date().toISOString());
        recordSignal(generation);
        return;
      }

      if (event.eventType === EVENT_SNAPSHOT_REQUIRED) {
        if (event.resourceId !== siteId) return;
        void recoverRef.current("snapshot-required");
        return;
      }

      if (event.resourceId.length === 0) return;
      setLastEventAt(new Date().toISOString());
      recordSignal(generation);
      if (event.eventType === EVENT_DEVICE_STATE_UPDATED) {
        applyDeviceStateEvent(event);
      } else if (event.eventType === EVENT_DEVICE_LIFECYCLE_CHANGED) {
        applyDeviceLifecycleEvent(event);
      }
      patchDeviceLists(event);
      scheduleOverviewInvalidate();
    },
    [
      applyDeviceLifecycleEvent,
      applyDeviceStateEvent,
      patchDeviceLists,
      recordSignal,
      scheduleOverviewInvalidate,
    ],
  );

  const connectCurrent = useCallback(
    (generation: number) => {
      if (
        generation !== generationRef.current ||
        !enabledRef.current ||
        !snapshotReadyRef.current ||
        !siteIdRef.current ||
        snapshotPausedRef.current
      ) {
        return;
      }

      const tenantId = tenantIdRef.current;
      const siteId = siteIdRef.current;
      const source = (sourceFactoryRef.current ?? createSiteEventSource)(tenantId, siteId);
      sourceRef.current = source;
      openedRef.current = false;
      bufferingRef.current = true;
      bufferedEventsRef.current = [];
      lastSignalAtRef.current = Date.now();
      armLivenessTimers(generation);
      setStatus("CONNECTING");

      const listener: SiteEventListener = {
        onOpen: () => {
          if (generation !== generationRef.current || snapshotPausedRef.current) return;
          openedRef.current = true;
          bufferingRef.current = true;
          setStatus("CONNECTING");
          void (async () => {
            let success = false;
            try {
              success = await revalidateRequiredSnapshotRef.current();
            } catch {
              success = false;
            }
            if (generation !== generationRef.current || snapshotPausedRef.current) return;
            if (!success) {
              snapshotPausedRef.current = true;
              disconnectCurrent();
              setSnapshotStale(true);
              setStatus("DISCONNECTED");
              return;
            }
            const buffered = bufferedEventsRef.current;
            bufferedEventsRef.current = [];
            bufferingRef.current = false;
            for (const event of buffered) handleEvent(event, generation);
            recordSignal(generation);
          })();
        },
        onEvent: (event) => handleEvent(event, generation),
        onError: () => {
          if (generation !== generationRef.current || snapshotPausedRef.current) return;
          openedRef.current = false;
          bufferingRef.current = true;
          // Errors are not liveness signals; retain timers based on the last
          // valid open/data/heartbeat instead of postponing disconnection.
          setStatus("RECONNECTING");
        },
      };

      unsubscribeRef.current = source.subscribe(listener);
      source.open();
    },
    [armLivenessTimers, disconnectCurrent, handleEvent, recordSignal],
  );

  const recover = useCallback(
    async (reason: RecoveryReason) => {
      if (
        recoveryRef.current ||
        !enabledRef.current ||
        !snapshotReadyRef.current ||
        !siteIdRef.current
      ) {
        return recoveryRef.current ?? undefined;
      }

      const generation = ++generationRef.current;
      snapshotPausedRef.current = true;
      disconnectCurrent();
      setSnapshotStale(true);
      setStatus(reason === "snapshot-required" ? "SNAPSHOT_REQUIRED" : "CONNECTING");

      const operation = (async () => {
        const checks = [revalidateRequiredSnapshotRef.current()];
        if (reason === "online" || reason === "retry") {
          checks.push(revalidateSessionRef.current?.() ?? Promise.resolve(true));
        }

        let success = false;
        try {
          const results = await Promise.all(checks);
          success = results.every(Boolean);
        } catch {
          success = false;
        }

        if (generation !== generationRef.current) return;
        if (!success) {
          snapshotPausedRef.current = true;
          setSnapshotStale(true);
          setStatus("DISCONNECTED");
          return;
        }

        snapshotPausedRef.current = false;
        setSnapshotStale(false);
        connectCurrent(generation);
      })();

      recoveryRef.current = operation;
      try {
        await operation;
      } finally {
        if (recoveryRef.current === operation) recoveryRef.current = null;
      }
    },
    [connectCurrent, disconnectCurrent],
  );

  useLayoutEffect(() => {
    enabledRef.current = input.enabled;
    snapshotReadyRef.current = input.snapshotReady;
    tenantIdRef.current = input.tenantId;
    siteIdRef.current = input.siteId;
    sourceFactoryRef.current = input.sourceFactory;
    revalidateRequiredSnapshotRef.current = input.revalidateRequiredSnapshot;
    revalidateSessionRef.current = input.revalidateSession;
    recoverRef.current = recover;
  });

  useEffect(() => {
    if (usesMock()) installFixtureRealtimeTestApi();
  }, []);

  useEffect(() => {
    const generation = ++generationRef.current;
    recoveryRef.current = null;
    snapshotPausedRef.current = true;
    disconnectCurrent();

    if (!input.enabled || !input.snapshotReady || !input.siteId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStatus("SNAPSHOT");
      setSnapshotStale(false);
      return;
    }

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setStatus("DISCONNECTED");
      setSnapshotStale(true);
      return;
    }

    snapshotPausedRef.current = false;
    setSnapshotStale(false);
    connectCurrent(generation);

    return () => {
      if (generation === generationRef.current) generationRef.current += 1;
      snapshotPausedRef.current = true;
      disconnectCurrent();
    };
  }, [connectCurrent, disconnectCurrent, input.enabled, input.siteId, input.snapshotReady, input.tenantId]);

  useEffect(() => {
    const onOffline = () => {
      generationRef.current += 1;
      recoveryRef.current = null;
      snapshotPausedRef.current = true;
      disconnectCurrent();
      setSnapshotStale(true);
      setStatus("DISCONNECTED");
    };
    const onOnline = () => {
      void recoverRef.current("online");
    };
    const onVisibilityChange = () => {
      if (
        document.visibilityState === "visible" &&
        lastSignalAtRef.current > 0 &&
        Date.now() - lastSignalAtRef.current > STALE_MS
      ) {
        void recoverRef.current("visibility");
      }
    };

    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [disconnectCurrent]);

  const retry = useCallback(() => {
    void recoverRef.current("retry");
  }, []);

  const close = useCallback(() => {
    generationRef.current += 1;
    recoveryRef.current = null;
    snapshotPausedRef.current = true;
    disconnectCurrent();
    setSnapshotStale(false);
    setStatus("SNAPSHOT");
  }, [disconnectCurrent]);

  return { status, snapshotStale, lastEventAt, lastHeartbeatAt, retry, close };
}

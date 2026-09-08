import type { SiteEvent, SiteEventListener, SiteEventSource } from "./types";
import { parseSiteEvent } from "./event-schema";

interface FixtureEmitTarget {
  emitOpen(): void;
  emitError(): void;
  emitEvent(event: unknown): void;
}

let activeTarget: FixtureEmitTarget | null = null;

/**
 * Deterministic mock transport. Feature code consumes the same SiteEventSource
 * interface as the remote-mode EventSource adapter.
 */
export class FixtureRealtimeTransport implements SiteEventSource {
  private listeners = new Set<SiteEventListener>();
  private opened = false;
  private openTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private readonly tenantId: string;
  private readonly siteId: string;
  private targetHandle: FixtureEmitTarget | null = null;

  constructor(tenantId: string, siteId: string) {
    this.tenantId = tenantId;
    this.siteId = siteId;
  }

  open(): void {
    if (this.opened) return;
    this.opened = true;

    const target: FixtureEmitTarget = {
      emitOpen: () => this.emitOpen(),
      emitError: () => this.emitError(),
      emitEvent: (event) => this.emitUnknownEvent(event),
    };
    this.targetHandle = target;
    activeTarget = target;

    // Simulate a connection establishment before any event.
    this.openTimer = setTimeout(() => {
      this.openTimer = null;
      if (this.opened) this.emitOpen();
    }, 0);

    this.heartbeatTimer = setInterval(() => {
      this.emitEvent({
        eventId: `evt-heartbeat-${Date.now()}`,
        eventType: "heartbeat",
        tenantId: this.tenantId,
        siteId: this.siteId,
        resourceType: "SITE",
        resourceId: this.siteId,
        version: 0,
        stateEpoch: "fixture:0",
        revision: 0,
        occurredAt: new Date().toISOString(),
        payload: { serverTime: new Date().toISOString() },
      });
    }, 30_000);
  }

  close(): void {
    this.opened = false;
    if (this.openTimer) {
      clearTimeout(this.openTimer);
      this.openTimer = null;
    }
    if (this.targetHandle && activeTarget === this.targetHandle) {
      activeTarget = null;
    }
    this.targetHandle = null;
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  subscribe(listener: SiteEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emitOpen(): void {
    for (const listener of this.listeners) listener.onOpen();
  }

  emitError(): void {
    for (const listener of this.listeners) listener.onError();
  }

  emitEvent(event: SiteEvent): void {
    for (const listener of this.listeners) listener.onEvent(event);
  }

  private emitUnknownEvent(raw: unknown): void {
    const eventName =
      raw && typeof raw === "object" && "eventType" in raw
        ? String((raw as { eventType?: unknown }).eventType ?? "")
        : "";
    const event = parseSiteEvent(eventName, raw);
    if (event) this.emitEvent(event);
  }
}

export function getActiveFixtureTarget(): FixtureEmitTarget | null {
  return activeTarget;
}

/** Executes in mock mode to expose a Playwright/test control channel. */
export function installFixtureRealtimeTestApi(): void {
  if (typeof window === "undefined") return;
  const host = window as unknown as Record<string, unknown>;
  host.__fieldopsRealtime = {
    emit: (event: unknown) => activeTarget?.emitEvent(event),
    error: () => activeTarget?.emitError(),
    open: () => activeTarget?.emitOpen(),
  };
}

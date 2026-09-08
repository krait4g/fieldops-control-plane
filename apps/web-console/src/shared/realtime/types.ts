import type { z } from "zod";
import type { siteEventSchema } from "./event-schema";

export const EVENT_DEVICE_STATE_UPDATED = "device.state.updated";
export const EVENT_DEVICE_LIFECYCLE_CHANGED = "device.lifecycle.changed";
export const EVENT_SNAPSHOT_REQUIRED = "snapshot-required";
export const EVENT_HEARTBEAT = "heartbeat";

export const KNOWN_EVENT_TYPES = [
  EVENT_DEVICE_STATE_UPDATED,
  EVENT_DEVICE_LIFECYCLE_CHANGED,
  EVENT_SNAPSHOT_REQUIRED,
  EVENT_HEARTBEAT,
] as const;

export type SiteEvent = z.infer<typeof siteEventSchema>;
export type DeviceStateUpdatedEvent = Extract<
  SiteEvent,
  { eventType: typeof EVENT_DEVICE_STATE_UPDATED }
>;
export type DeviceLifecycleChangedEvent = Extract<
  SiteEvent,
  { eventType: typeof EVENT_DEVICE_LIFECYCLE_CHANGED }
>;

export interface SiteEventListener {
  onOpen: () => void;
  onEvent: (event: SiteEvent) => void;
  onError: () => void;
}

export interface SiteEventSource {
  open(): void;
  close(): void;
  subscribe(listener: SiteEventListener): () => void;
}

export function isKnownEventType(value: string): value is SiteEvent["eventType"] {
  return (KNOWN_EVENT_TYPES as readonly string[]).includes(value);
}

import { z } from "zod";
import {
  EVENT_DEVICE_LIFECYCLE_CHANGED,
  EVENT_DEVICE_STATE_UPDATED,
  EVENT_HEARTBEAT,
  EVENT_SNAPSHOT_REQUIRED,
  type SiteEvent,
} from "./types";

const dateTime = z.string().datetime({ offset: true });
const nullableDateTime = dateTime.nullable();
const connectivity = z.enum(["ONLINE", "OFFLINE", "DEGRADED", "UNKNOWN"]);

const metricSchema = z
  .object({
    code: z.string(),
    displayName: z.string(),
    value: z.union([z.number(), z.boolean(), z.string(), z.null()]),
    unit: z.string().nullable(),
    quality: z.enum(["GOOD", "UNCERTAIN", "BAD", "MISSING"]),
    observedAt: dateTime,
  })
  .strict();

const baseShape = {
  eventId: z.string().min(1),
  tenantId: z.string().min(1),
  siteId: z.string().min(1),
  resourceId: z.string().min(1),
  version: z.number().int().nonnegative(),
  stateEpoch: z.string().min(1),
  revision: z.number().int().nonnegative(),
  occurredAt: dateTime,
};

const deviceStateUpdatedSchema = z
  .object({
    ...baseShape,
    eventType: z.literal(EVENT_DEVICE_STATE_UPDATED),
    resourceType: z.literal("DEVICE"),
    payload: z
      .object({
        connectivity,
        readiness: z.enum(["READY", "NOT_READY", "FAULTED", "MAINTENANCE", "UNKNOWN"]),
        freshness: z.enum(["FRESH", "STALE", "UNKNOWN"]),
        source: z.enum(["REDIS_REALTIME", "POSTGRES_SNAPSHOT", "NONE"]),
        observedAt: nullableDateTime,
        receivedAt: nullableDateTime,
        staleAt: nullableDateTime,
        metrics: z.array(metricSchema),
      })
      .strict(),
  })
  .strict();

const deviceLifecycleChangedSchema = z
  .object({
    ...baseShape,
    eventType: z.literal(EVENT_DEVICE_LIFECYCLE_CHANGED),
    resourceType: z.literal("DEVICE"),
    payload: z
      .object({
        previousConnectivity: connectivity,
        connectivity,
        changedAt: dateTime,
        reasonCode: z.string(),
      })
      .strict(),
  })
  .strict();

const snapshotRequiredSchema = z
  .object({
    ...baseShape,
    eventType: z.literal(EVENT_SNAPSHOT_REQUIRED),
    resourceType: z.literal("SITE"),
    payload: z
      .object({
        reason: z.enum(["REPLAY_WINDOW_EXPIRED", "SERVER_RESTART", "SCOPE_RESET"]),
        lastAvailableEventId: z.string().nullable(),
      })
      .strict(),
  })
  .strict();

const heartbeatSchema = z
  .object({
    ...baseShape,
    eventType: z.literal(EVENT_HEARTBEAT),
    resourceType: z.literal("SITE"),
    payload: z.object({ serverTime: dateTime }).strict(),
  })
  .strict();

export const siteEventSchema = z.discriminatedUnion("eventType", [
  deviceStateUpdatedSchema,
  deviceLifecycleChangedSchema,
  snapshotRequiredSchema,
  heartbeatSchema,
]);

/**
 * Validates both the SSE wire event name and its JSON data. Invalid input is
 * ignored without logging the raw payload, so the connection can remain open.
 */
export function parseSiteEvent(eventName: string, raw: unknown): SiteEvent | null {
  const parsed = siteEventSchema.safeParse(raw);
  if (!parsed.success || eventName !== parsed.data.eventType) return null;
  return parsed.data;
}

import type {
  Connectivity,
  DeviceProtocol,
  FreshnessStatus,
  MemberRole,
  MemberStatus,
  Readiness,
  TimeBucket,
  TimeRange,
} from "../types";

export interface DeviceFilters {
  query?: string;
  deviceType?: string;
  protocol?: DeviceProtocol;
  connectivity?: Connectivity;
  readiness?: Readiness;
  freshness?: FreshnessStatus;
}

export interface MemberFilters {
  query?: string;
  role?: MemberRole;
  status?: MemberStatus;
  siteId?: string;
}

class NormalizedKey {
  #value: string;
  constructor(value: string) {
    this.#value = value;
  }

  toString(): string {
    return this.#value;
  }
}

function stableSerialize(input: object): string {
  const record = input as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) {
    const value = record[key];
    if (value !== undefined && value !== null && value !== "") {
      sorted[key] = value;
    }
  }
  return JSON.stringify(sorted);
}

function normalizeDeviceFilters(filters: DeviceFilters): string {
  return stableSerialize(filters);
}

function normalizeMemberFilters(filters: MemberFilters): string {
  return stableSerialize(filters);
}

/**
 * Single query-key factory. Every key includes tenant (and site where the
 * resource is site-scoped) so context switches isolate the cache namespace.
 */
export const queryKeys = {
  session: {
    all: ["session"] as const,
  },
  overview: {
    detail: (tenantId: string, siteId: string, range: TimeRange) =>
      ["overview", tenantId, siteId, range] as const,
    environmentSeries: (tenantId: string, siteId: string, range: TimeRange, bucket: TimeBucket) =>
      ["environment-series", tenantId, siteId, range, bucket] as const,
  },
  devices: {
    list: (tenantId: string, siteId: string, filters: DeviceFilters, cursor?: string) =>
      ["devices", tenantId, siteId, normalizeDeviceFilters(filters), cursor ?? null] as const,
    detail: (tenantId: string, siteId: string, deviceId: string) =>
      ["device", tenantId, siteId, deviceId] as const,
    state: (tenantId: string, siteId: string, deviceId: string) =>
      ["device-state", tenantId, siteId, deviceId] as const,
    series: (
      tenantId: string,
      siteId: string,
      deviceId: string,
      range: TimeRange,
      metrics: string[],
      bucket: TimeBucket,
    ) => ["device-series", tenantId, siteId, deviceId, range, metrics, bucket] as const,
  },
  cameras: {
    list: (tenantId: string, siteId: string) => ["cameras", tenantId, siteId] as const,
    detail: (tenantId: string, siteId: string, cameraId: string) =>
      ["camera", tenantId, siteId, cameraId] as const,
    status: (tenantId: string, siteId: string, cameraId: string) =>
      ["camera-status", tenantId, siteId, cameraId] as const,
  },
  members: {
    list: (tenantId: string, filters: MemberFilters, cursor?: string) =>
      ["members", tenantId, normalizeMemberFilters(filters), cursor ?? null] as const,
  },
} as const;

export { NormalizedKey };

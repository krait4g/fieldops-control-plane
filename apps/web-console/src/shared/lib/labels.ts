import { catalogs, type CopyCatalog } from "./copy";
import type {
  Connectivity,
  FreshnessStatus,
  MemberRole,
  MemberStatus,
  MetricQuality,
  Readiness,
} from "@/shared/api/types";
import type { StatusTone } from "./view-models";

export type DeviceCode = Connectivity | Readiness | FreshnessStatus | MemberStatus | MetricQuality;

export interface StatusLabel {
  label: string;
  tone: StatusTone;
}

const connectivityTone: Record<Connectivity, StatusTone> = {
  ONLINE: "success",
  OFFLINE: "critical",
  DEGRADED: "warning",
  UNKNOWN: "unknown",
};

const readinessTone: Record<Readiness, StatusTone> = {
  READY: "success",
  NOT_READY: "warning",
  FAULTED: "critical",
  MAINTENANCE: "info",
  UNKNOWN: "unknown",
};

const freshnessTone: Record<FreshnessStatus, StatusTone> = {
  FRESH: "success",
  STALE: "warning",
  UNKNOWN: "unknown",
};

const memberStatusTone: Record<MemberStatus, StatusTone> = {
  ACTIVE: "success",
  SUSPENDED: "critical",
  INVITED: "info",
};

const qualityTone: Record<MetricQuality, StatusTone> = {
  GOOD: "success",
  UNCERTAIN: "warning",
  BAD: "critical",
  MISSING: "unknown",
};

export function connectivityStatus(code: Connectivity, messages: CopyCatalog = catalogs.en): StatusLabel {
  const labels: Record<Connectivity, string> = {
    ONLINE: messages.states.online,
    OFFLINE: messages.states.offline,
    DEGRADED: messages.states.degraded,
    UNKNOWN: messages.states.unknown,
  };
  return { label: labels[code], tone: connectivityTone[code] };
}

export function readinessStatus(code: Readiness, messages: CopyCatalog = catalogs.en): StatusLabel {
  const labels: Record<Readiness, string> = {
    READY: messages.states.ready,
    NOT_READY: messages.states.notReady,
    FAULTED: messages.states.faulted,
    MAINTENANCE: messages.states.maintenance,
    UNKNOWN: messages.states.unknown,
  };
  return { label: labels[code], tone: readinessTone[code] };
}

export function freshnessStatus(code: FreshnessStatus, messages: CopyCatalog = catalogs.en): StatusLabel {
  return { label: messages.freshness[code], tone: freshnessTone[code] };
}

export function memberStatusLabelOf(code: MemberStatus, messages: CopyCatalog = catalogs.en): StatusLabel {
  return { label: messages.memberStates[code], tone: memberStatusTone[code] };
}

export function metricQualityStatus(code: MetricQuality, messages: CopyCatalog = catalogs.en): StatusLabel {
  return { label: messages.quality[code], tone: qualityTone[code] };
}

export function roleLabel(code: MemberRole, messages: CopyCatalog = catalogs.en): string {
  return messages.roles[code];
}

/**
 * Unknown enum safety net. The web console must not crash when the backend
 * introduces a new code; it renders a neutral, explicitly-unknown state.
 */
export function statusLabelOrUnknown(code: string, known: Record<string, string>, messages: CopyCatalog = catalogs.en): string {
  return known[code] ?? messages.states.unknown;
}

export function sourceLabel(source: string | null | undefined, messages: CopyCatalog = catalogs.en): string {
  if (!source) return messages.source.NONE;
  const labels: Record<string, string> = {
    REDIS_REALTIME: messages.source.REDIS_REALTIME,
    POSTGRES_SNAPSHOT: messages.source.POSTGRES_SNAPSHOT,
    NONE: messages.source.NONE,
    REALTIME_PROJECTION: messages.source.REDIS_REALTIME,
    COMPOSED_READ_MODEL: messages.source.REDIS_REALTIME,
  };
  return labels[source] ?? messages.states.unknown;
}

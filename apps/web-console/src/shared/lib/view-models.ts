import type { ViewTimestamp } from "./time";

export type LoadStatus = "idle" | "loading" | "success" | "empty" | "error" | "forbidden";

export type WidgetAvailability =
  | "AVAILABLE"
  | "EMPTY"
  | "STALE"
  | "UNAVAILABLE"
  | "FORBIDDEN";

export type LiveConnectionStatus =
  | "SNAPSHOT"
  | "CONNECTING"
  | "LIVE"
  | "RECONNECTING"
  | "STALE"
  | "SNAPSHOT_REQUIRED"
  | "DISCONNECTED";

export type StatusTone = "neutral" | "success" | "warning" | "critical" | "info" | "unknown";

export interface UiFailure {
  code: string;
  title: string;
  message: string;
  traceId?: string;
  retryable: boolean;
}

export interface WidgetMetaView {
  availability: WidgetAvailability;
  source?: "REALTIME_PROJECTION" | "POSTGRES_SNAPSHOT" | "COMPOSED_READ_MODEL" | "NONE";
  generatedAt?: ViewTimestamp;
  staleAt?: ViewTimestamp;
  failure?: UiFailure;
}

export interface NavigationItemView {
  id: string;
  label: string;
  href?: string;
  iconName: string;
  active: boolean;
  disabled: boolean;
  hidden: boolean;
  badge?: string;
  children?: NavigationItemView[];
}

export interface ContextOptionView {
  id: string;
  label: string;
  disabled?: boolean;
}

export type TimeRange = "PT1H" | "PT6H" | "PT24H" | "P7D";

export interface AppShellUserView {
  displayName: string;
  email: string;
  roleLabel: string;
}

export interface AppShellProps {
  navigation: NavigationItemView[];
  breadcrumb: Array<{ label: string; href?: string }>;
  tenants: ContextOptionView[];
  sites: ContextOptionView[];
  selectedTenantId: string;
  selectedSiteId: string | null;
  selectedRange: TimeRange;
  liveStatus: LiveConnectionStatus;
  user: AppShellUserView;
  rangeVisible: boolean;
  onTenantChange: (tenantId: string) => void;
  onSiteChange: (siteId: string) => void;
  onRangeChange: (range: TimeRange) => void;
  children: React.ReactNode;
}
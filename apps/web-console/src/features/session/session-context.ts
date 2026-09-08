"use client";

import { createContext, useContext } from "react";
import type { SessionResponse } from "@/shared/api/types";
import type {
  AppShellUserView,
  ContextOptionView,
  LiveConnectionStatus,
  TimeRange,
} from "@/shared/lib/view-models";

export interface SessionContextValue {
  session: SessionResponse;
  tenantId: string;
  siteId: string;
  tenants: ContextOptionView[];
  sites: ContextOptionView[];
  user: AppShellUserView;
  permissions: string[];
  range: TimeRange;
  rangeVisible: boolean;
  liveStatus: LiveConnectionStatus;
  snapshotStale: boolean;
  setTenant: (tenantId: string) => void;
  setSite: (siteId: string) => void;
  setRange: (range: TimeRange) => void;
}

export const SessionContext = createContext<SessionContextValue | null>(null);

export function useSessionContext(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) {
    throw new Error("useSessionContext must be used within a SessionProvider");
  }
  return value;
}

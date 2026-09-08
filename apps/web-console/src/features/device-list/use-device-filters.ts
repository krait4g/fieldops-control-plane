"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Connectivity, DeviceProtocol, FreshnessStatus, Readiness } from "@/shared/api/types";
import type { DeviceFilters } from "@/shared/api/http/query-keys";

const PROTOCOL_VALUES = ["MQTT", "TCP_BINARY", "HTTP_POLLING", "ONVIF"] as const;
const CONNECTIVITY_VALUES = ["ONLINE", "OFFLINE", "DEGRADED", "UNKNOWN"] as const;
const READINESS_VALUES = ["READY", "NOT_READY", "FAULTED", "MAINTENANCE", "UNKNOWN"] as const;
const FRESHNESS_VALUES = ["FRESH", "STALE", "UNKNOWN"] as const;

function enumValue<T extends string>(value: string | null, allowed: readonly T[]): T | undefined {
  if (!value) return undefined;
  return (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

const FILTER_KEYS = ["query", "deviceType", "protocol", "connectivity", "readiness", "freshness"] as const;

export type DeviceFilterKey = typeof FILTER_KEYS[number];

export interface DeviceListFiltersState {
  filters: DeviceFilters;
  cursor?: string;
  hasActiveFilters: boolean;
  setFilter: (key: DeviceFilterKey, value: string | undefined) => void;
  setCursor: (cursor: string | undefined) => void;
  clearFilters: () => void;
}

export function useDeviceListFilters(): DeviceListFiltersState {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filters: DeviceFilters = {
    query: searchParams.get("query") || undefined,
    deviceType: searchParams.get("deviceType") || undefined,
    protocol: enumValue(searchParams.get("protocol"), PROTOCOL_VALUES) as DeviceProtocol | undefined,
    connectivity: enumValue(searchParams.get("connectivity"), CONNECTIVITY_VALUES) as Connectivity | undefined,
    readiness: enumValue(searchParams.get("readiness"), READINESS_VALUES) as Readiness | undefined,
    freshness: enumValue(searchParams.get("freshness"), FRESHNESS_VALUES) as FreshnessStatus | undefined,
  };
  const cursor = searchParams.get("cursor") || undefined;

  const hasActiveFilters = FILTER_KEYS.some((key) => {
    if (key === "query" || key === "deviceType") return Boolean(filters[key]);
    return filters[key] !== undefined;
  });

  const rebuild = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams();
      for (const [key, value] of searchParams.entries()) {
        if (!FILTER_KEYS.includes(key as DeviceFilterKey) && key !== "cursor") {
          params.set(key, value);
        }
      }
      mutate(params);
      const currentParams = new URLSearchParams(searchParams);
      currentParams.sort();
      const nextParams = new URLSearchParams(params);
      nextParams.sort();
      if (currentParams.toString() === nextParams.toString()) return;
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [searchParams, pathname, router],
  );

  const setFilter = useCallback(
    (key: DeviceFilterKey, value: string | undefined) => {
      rebuild((params) => {
        for (const filterKey of FILTER_KEYS) {
          const existing = filterKey === key ? value : searchParams.get(filterKey);
          if (existing) params.set(filterKey, existing);
        }
        // cursor is dropped on any filter change
      });
    },
    [rebuild, searchParams],
  );

  const setCursor = useCallback(
    (nextCursor: string | undefined) => {
      rebuild((params) => {
        for (const filterKey of FILTER_KEYS) {
          const existing = searchParams.get(filterKey);
          if (existing) params.set(filterKey, existing);
        }
        if (nextCursor) params.set("cursor", nextCursor);
      });
    },
    [rebuild, searchParams],
  );

  const clearFilters = useCallback(() => {
    rebuild(() => {
      // no filter params set
    });
  }, [rebuild]);

  return { filters, cursor, hasActiveFilters, setFilter, setCursor, clearFilters };
}

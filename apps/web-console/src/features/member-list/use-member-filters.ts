"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { MemberRole, MemberStatus } from "@/shared/api/types";
import type { MemberFilters } from "@/shared/api/http/query-keys";

const ROLE_VALUES = [
  "TENANT_VIEWER",
  "SITE_OPERATOR",
  "COMMAND_APPROVER",
  "TENANT_ADMIN",
  "PLATFORM_ADMIN",
] as const;
const STATUS_VALUES = ["ACTIVE", "SUSPENDED", "INVITED"] as const;

function enumValue<T extends string>(value: string | null, allowed: readonly T[]): T | undefined {
  if (!value) return undefined;
  return (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

const MEMBER_FILTER_KEYS = ["query", "role", "status", "siteId"] as const;
export type MemberFilterKey = typeof MEMBER_FILTER_KEYS[number];

export interface MemberListFiltersState {
  filters: MemberFilters;
  cursor?: string;
  hasActiveFilters: boolean;
  setFilter: (key: MemberFilterKey, value: string | undefined) => void;
  setCursor: (cursor: string | undefined) => void;
  clearFilters: () => void;
}

export function useMemberListFilters(): MemberListFiltersState {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filters: MemberFilters = {
    query: searchParams.get("query") || undefined,
    role: enumValue(searchParams.get("role"), ROLE_VALUES) as MemberRole | undefined,
    status: enumValue(searchParams.get("status"), STATUS_VALUES) as MemberStatus | undefined,
    siteId: searchParams.get("siteId") || undefined,
  };
  const cursor = searchParams.get("cursor") || undefined;

  const hasActiveFilters = MEMBER_FILTER_KEYS.some((key) => filters[key] !== undefined);

  const rebuild = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams();
      for (const [key, value] of searchParams.entries()) {
        if (!MEMBER_FILTER_KEYS.includes(key as MemberFilterKey) && key !== "cursor") {
          params.set(key, value);
        }
      }
      mutate(params);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [searchParams, pathname, router],
  );

  const setFilter = useCallback(
    (key: MemberFilterKey, value: string | undefined) => {
      rebuild((params) => {
        for (const filterKey of MEMBER_FILTER_KEYS) {
          const existing = filterKey === key ? value : searchParams.get(filterKey);
          if (existing) params.set(filterKey, existing);
        }
      });
    },
    [rebuild, searchParams],
  );

  const setCursor = useCallback(
    (nextCursor: string | undefined) => {
      rebuild((params) => {
        for (const filterKey of MEMBER_FILTER_KEYS) {
          const existing = searchParams.get(filterKey);
          if (existing) params.set(filterKey, existing);
        }
        if (nextCursor) params.set("cursor", nextCursor);
      });
    },
    [rebuild, searchParams],
  );

  const clearFilters = useCallback(() => {
    rebuild(() => {});
  }, [rebuild]);

  return { filters, cursor, hasActiveFilters, setFilter, setCursor, clearFilters };
}
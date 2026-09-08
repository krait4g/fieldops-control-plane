import { useQuery } from "@tanstack/react-query";
import { fieldOpsClient } from "@/shared/api/http/client";
import { queryKeys } from "@/shared/api/http/query-keys";
import type { TimeBucket, TimeRange } from "@/shared/api/types";

export function useOverviewQuery(tenantId: string, siteId: string, range: TimeRange) {
  return useQuery({
    queryKey: queryKeys.overview.detail(tenantId, siteId, range),
    queryFn: ({ signal }) => fieldOpsClient.getOverview({ tenantId, siteId, range }, { signal }),
    refetchInterval: 30_000,
    staleTime: 10_000,
    gcTime: 300_000,
    enabled: Boolean(siteId),
  });
}

export function useEnvironmentSeriesQuery(
  tenantId: string,
  siteId: string,
  range: TimeRange,
  bucket: TimeBucket,
) {
  return useQuery({
    queryKey: queryKeys.overview.environmentSeries(tenantId, siteId, range, bucket),
    queryFn: ({ signal }) =>
      fieldOpsClient.getEnvironmentSeries({ tenantId, siteId, range, bucket }, { signal }),
    refetchInterval: 30_000,
    staleTime: 60_000,
    gcTime: 600_000,
    enabled: Boolean(siteId),
  });
}

import { useQuery } from "@tanstack/react-query";
import { fieldOpsClient } from "@/shared/api/http/client";
import { queryKeys, type DeviceFilters } from "@/shared/api/http/query-keys";

export function useDevicesQuery(
  tenantId: string,
  siteId: string,
  filters: DeviceFilters,
  cursor?: string,
) {
  return useQuery({
    queryKey: queryKeys.devices.list(tenantId, siteId, filters, cursor),
    queryFn: ({ signal }) =>
      fieldOpsClient.getDevices(
        {
          tenantId,
          siteId,
          query: filters.query,
          deviceType: filters.deviceType,
          protocol: filters.protocol,
          connectivity: filters.connectivity,
          readiness: filters.readiness,
          freshness: filters.freshness,
          cursor,
          pageSize: 25,
        },
        { signal },
      ),
    staleTime: 15_000,
    refetchInterval: 30_000,
    gcTime: 300_000,
    enabled: Boolean(siteId),
    placeholderData: (previousData, previousQuery) => {
      const previousKey = previousQuery?.queryKey;
      const sameScope =
        previousKey?.[0] === "devices" &&
        previousKey[1] === tenantId &&
        previousKey[2] === siteId;
      return sameScope ? previousData : undefined;
    },
  });
}

import { useQuery } from "@tanstack/react-query";
import { fieldOpsClient } from "@/shared/api/http/client";
import { queryKeys } from "@/shared/api/http/query-keys";

export function useCamerasQuery(tenantId: string, siteId: string) {
  return useQuery({
    queryKey: queryKeys.cameras.list(tenantId, siteId),
    queryFn: ({ signal }) => fieldOpsClient.getCameras(tenantId, siteId, { signal }),
    staleTime: 5_000,
    gcTime: 300_000,
    enabled: Boolean(tenantId && siteId),
  });
}

import { useQuery } from "@tanstack/react-query";
import { fieldOpsClient } from "@/shared/api/http/client";
import { queryKeys } from "@/shared/api/http/query-keys";

export function useCameraQuery(tenantId: string, siteId: string, cameraId: string) {
  return useQuery({
    queryKey: queryKeys.cameras.detail(tenantId, siteId, cameraId),
    queryFn: ({ signal }) => fieldOpsClient.getCamera(cameraId, tenantId, { signal }),
    staleTime: 30_000,
    gcTime: 300_000,
    enabled: Boolean(tenantId && siteId && cameraId),
  });
}

export function useCameraStatusQuery(tenantId: string, siteId: string, cameraId: string) {
  return useQuery({
    queryKey: queryKeys.cameras.status(tenantId, siteId, cameraId),
    queryFn: ({ signal }) => fieldOpsClient.getCameraStatus(cameraId, tenantId, { signal }),
    staleTime: 5_000,
    gcTime: 300_000,
    enabled: Boolean(tenantId && siteId && cameraId),
  });
}

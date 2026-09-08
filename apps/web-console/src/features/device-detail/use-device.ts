import { useQuery } from "@tanstack/react-query";
import { fieldOpsClient } from "@/shared/api/http/client";
import { queryKeys } from "@/shared/api/http/query-keys";
import type { DeviceStateResponse, TimeBucket, TimeRange } from "@/shared/api/types";

export function useDeviceQuery(tenantId: string, siteId: string, deviceId: string) {
  return useQuery({
    queryKey: queryKeys.devices.detail(tenantId, siteId, deviceId),
    queryFn: ({ signal }) => fieldOpsClient.getDevice(deviceId, { tenantId }, { signal }),
    refetchInterval: 30_000,
    staleTime: 60_000,
    gcTime: 600_000,
    enabled: Boolean(siteId && deviceId),
  });
}

export function useDeviceStateQuery(tenantId: string, siteId: string, deviceId: string) {
  return useQuery<DeviceStateResponse>({
    queryKey: queryKeys.devices.state(tenantId, siteId, deviceId),
    queryFn: ({ signal }) => fieldOpsClient.getDeviceState(deviceId, { tenantId }, { signal }),
    refetchInterval: 30_000,
    structuralSharing: (previous: unknown, incoming: unknown) => {
      const previousState = previous as DeviceStateResponse | undefined;
      const incomingState = incoming as DeviceStateResponse;
      if (
        previousState &&
        previousState.stateEpoch === incomingState.stateEpoch &&
        previousState.revision > incomingState.revision
      ) {
        return previousState;
      }
      return incomingState;
    },
    staleTime: 5_000,
    gcTime: 300_000,
    enabled: Boolean(siteId && deviceId),
  });
}

export function useDeviceSeriesQuery(
  tenantId: string,
  siteId: string,
  deviceId: string,
  range: TimeRange,
  metrics: string[],
  bucket: TimeBucket,
) {
  return useQuery({
    queryKey: queryKeys.devices.series(tenantId, siteId, deviceId, range, metrics, bucket),
    queryFn: ({ signal }) =>
      fieldOpsClient.getDeviceSeries(
        deviceId,
        {
          tenantId,
          range,
          bucket,
          metrics: metrics.length > 0 ? metrics.join(",") : undefined,
        },
        { signal },
      ),
    staleTime: 60_000,
    refetchInterval: 30_000,
    gcTime: 600_000,
    enabled: Boolean(siteId && deviceId),
  });
}

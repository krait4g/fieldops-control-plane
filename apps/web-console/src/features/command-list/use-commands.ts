import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fieldOpsClient } from "@/shared/api/http/client";
import { queryKeys } from "@/shared/api/http/query-keys";
import type { DurableCommandRequest } from "@/shared/api/types";

const terminal = new Set(["REJECTED", "SUCCEEDED", "FAILED", "UNKNOWN"]);

export function useCommands(tenantId: string, siteId: string) {
  return useQuery({
    queryKey: queryKeys.commands.list(tenantId, siteId),
    queryFn: ({ signal }) => fieldOpsClient.getCommands(tenantId, siteId, { signal }),
    enabled: Boolean(tenantId && siteId),
    refetchInterval: (query) => query.state.data?.items.some((item) => !terminal.has(item.status))
      ? 250 : false,
  });
}

export function useCommandActions(tenantId: string, siteId: string) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.commands.list(tenantId, siteId) });
  return {
    request: useMutation({
      mutationFn: ({ key, command }: { key: string; command: DurableCommandRequest }) =>
        fieldOpsClient.requestCommand(tenantId, key, command),
      onSuccess: invalidate,
    }),
    approve: useMutation({
      mutationFn: (id: string) => fieldOpsClient.approveCommand(id, tenantId),
      onSuccess: invalidate,
    }),
    reject: useMutation({
      mutationFn: (id: string) => fieldOpsClient.rejectCommand(id, tenantId),
      onSuccess: invalidate,
    }),
  };
}

import { useQuery } from "@tanstack/react-query";
import { fieldOpsClient } from "@/shared/api/http/client";
import { queryKeys, type MemberFilters } from "@/shared/api/http/query-keys";

export function useMembersQuery(tenantId: string, filters: MemberFilters, cursor?: string) {
  return useQuery({
    queryKey: queryKeys.members.list(tenantId, filters, cursor),
    queryFn: ({ signal }) =>
      fieldOpsClient.getMembers(
        {
          tenantId,
          query: filters.query,
          role: filters.role,
          status: filters.status,
          siteId: filters.siteId,
          cursor,
          pageSize: 25,
        },
        { signal },
      ),
    staleTime: 30_000,
    refetchInterval: 30_000,
    gcTime: 300_000,
    enabled: Boolean(tenantId),
  });
}

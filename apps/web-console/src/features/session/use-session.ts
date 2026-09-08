import { useQuery } from "@tanstack/react-query";
import { fieldOpsClient } from "@/shared/api/http/client";
import { queryKeys } from "@/shared/api/http/query-keys";

export function useSessionQuery() {
  return useQuery({
    queryKey: queryKeys.session.all,
    queryFn: () => fieldOpsClient.getSession(),
    staleTime: 30_000,
    gcTime: 300_000,
  });
}
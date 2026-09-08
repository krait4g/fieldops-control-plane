import { QueryClient } from "@tanstack/react-query";
import { isRetryableError } from "@/shared/api/http/problem";

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          if (failureCount >= 2) return false;
          return isRetryableError(error);
        },
        staleTime: 30_000,
        gcTime: 300_000,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}

let sharedClient: QueryClient | undefined;

export function getQueryClient(): QueryClient {
  if (!sharedClient) sharedClient = createQueryClient();
  return sharedClient;
}
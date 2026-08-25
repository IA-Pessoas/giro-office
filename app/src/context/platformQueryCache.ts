import type { QueryClient } from "@tanstack/react-query";

export async function clearPlatformQueryCache(queryClient: QueryClient): Promise<void> {
  await queryClient.cancelQueries({ queryKey: ["platform"] });
  queryClient.removeQueries({ queryKey: ["platform"] });
}

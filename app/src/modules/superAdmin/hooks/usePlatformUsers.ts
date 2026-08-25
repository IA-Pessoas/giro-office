import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { platformService } from "../services/platformService";
import type { PlatformUsersListResponse } from "../types";

export interface UsePlatformUsersParams {
  skip: number;
  take: number;
  search?: string;
}

export function usePlatformUsers(
  organizationId: string | null,
  params: UsePlatformUsersParams,
): UseQueryResult<PlatformUsersListResponse> {
  return useQuery({
    queryKey: ["platform", "organizations", organizationId, "users", params],
    queryFn: () => platformService.listUsers(organizationId as string, params),
    enabled: Boolean(organizationId),
    staleTime: 15_000,
  });
}

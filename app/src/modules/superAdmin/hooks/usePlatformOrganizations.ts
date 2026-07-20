import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { platformService } from "../services/platformService";
import type { PlatformOrganizationsListResponse } from "../types";

export interface UsePlatformOrganizationsParams {
  page: number;
  pageSize: number;
  status?: string;
  search?: string;
}

export function usePlatformOrganizations(
  params: UsePlatformOrganizationsParams,
): UseQueryResult<PlatformOrganizationsListResponse> {
  return useQuery({
    queryKey: ["platform", "organizations", params],
    queryFn: () => platformService.listOrganizations(params),
    placeholderData: (previousData) => previousData,
    staleTime: 30_000,
  });
}

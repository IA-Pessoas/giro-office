import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { platformService } from "../services/platformService";
import type { PlatformAuditListResponse } from "../types";

export interface UsePlatformAuditParams {
  page: number;
  pageSize: number;
  path?: string;
}

export function usePlatformAudit(
  params: UsePlatformAuditParams,
): UseQueryResult<PlatformAuditListResponse> {
  return useQuery({
    queryKey: ["platform", "audit", params],
    queryFn: () => platformService.searchAudit(params),
    placeholderData: (previousData) => previousData,
    staleTime: 15_000,
  });
}

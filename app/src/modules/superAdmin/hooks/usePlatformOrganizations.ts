import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { platformService } from "../services/platformService";
import type { PlatformOrganization, PlatformOrganizationsListResponse } from "../types";

export const platformOrganizationKeys = {
  lists: ["platform", "organizations", "list"] as const,
  list: (params: UsePlatformOrganizationsParams) =>
    [...platformOrganizationKeys.lists, params] as const,
  details: ["platform", "organizations", "detail"] as const,
  detail: (organizationId: string | null) =>
    [...platformOrganizationKeys.details, organizationId] as const,
};

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
    queryKey: platformOrganizationKeys.list(params),
    queryFn: () => platformService.listOrganizations(params),
    placeholderData: (previousData) => previousData,
    staleTime: 30_000,
  });
}

export function usePlatformOrganizationDetail(
  organizationId: string | null,
): UseQueryResult<PlatformOrganization> {
  return useQuery({
    queryKey: platformOrganizationKeys.detail(organizationId),
    queryFn: () => platformService.getOrganization(organizationId as string),
    enabled: Boolean(organizationId),
    staleTime: 15_000,
  });
}

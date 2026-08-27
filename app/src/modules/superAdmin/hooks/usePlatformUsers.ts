import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { platformService } from "../services/platformService";
import type { PlatformDepartmentOption, PlatformOrganizationUser, PlatformUsersListResponse } from "../types";

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

export function usePlatformUserDetail(
  organizationId: string | null,
  userId: string | null,
): UseQueryResult<PlatformOrganizationUser> {
  return useQuery({
    queryKey: ["platform", "organizations", organizationId, "users", userId],
    queryFn: () => platformService.getUser(organizationId as string, userId as string),
    enabled: Boolean(organizationId && userId),
    retry: false,
  });
}

export function usePlatformDepartments(
  organizationId: string | null,
): UseQueryResult<PlatformDepartmentOption[]> {
  return useQuery({
    queryKey: ["platform", "organizations", organizationId, "departments"],
    queryFn: () => platformService.listDepartments(organizationId as string),
    enabled: Boolean(organizationId),
    staleTime: 15_000,
  });
}

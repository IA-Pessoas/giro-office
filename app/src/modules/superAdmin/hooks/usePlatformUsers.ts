import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";

import { platformService } from "../services/platformService";
import type {
  PlatformDepartmentOption,
  PlatformOrganizationUser,
  PlatformOwnershipTransferResult,
  PlatformUsersListResponse,
  PreviousOwnerAction,
} from "../types";

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

export type PlatformUserLifecycleMutationVariables = {
  organizationId: string;
  userId: string;
  action: "deactivate" | "reactivate";
};

export function usePlatformUserLifecycleMutation(): UseMutationResult<
  PlatformOrganizationUser,
  unknown,
  PlatformUserLifecycleMutationVariables
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ organizationId, userId, action }) =>
      action === "deactivate"
        ? platformService.deactivateUser(organizationId, userId)
        : platformService.reactivateUser(organizationId, userId),
    retry: false,
    onSuccess: (user, { organizationId }) => {
      queryClient.setQueryData<PlatformOrganizationUser>(
        ["platform", "organizations", organizationId, "users", user.id],
        user,
      );
      queryClient.setQueriesData<PlatformUsersListResponse>(
        {
          predicate: (query) =>
            query.queryKey[0] === "platform" &&
            query.queryKey[1] === "organizations" &&
            query.queryKey[2] === organizationId &&
            query.queryKey[3] === "users" &&
            typeof query.queryKey[4] === "object",
        },
        (current) =>
          current
            ? {
                ...current,
                users: current.users.map((listedUser) =>
                  listedUser.id === user.id ? { ...listedUser, ...user } : listedUser,
                ),
              }
            : current,
      );
    },
  });
}

export function usePlatformOwnershipTransferMutation(): UseMutationResult<
  PlatformOwnershipTransferResult,
  unknown,
  {
    organizationId: string;
    currentOwnerId: string;
    successorUserId: string;
    previousOwnerAction: PreviousOwnerAction;
    justification: string;
  }
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ organizationId, ...data }) => platformService.transferOwnership(organizationId, data),
    retry: false,
    onSuccess: async (_result, { organizationId }) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["platform", "organizations", organizationId, "users"],
        }),
        queryClient.invalidateQueries({ queryKey: ["platform", "audit"] }),
      ]);
    },
  });
}

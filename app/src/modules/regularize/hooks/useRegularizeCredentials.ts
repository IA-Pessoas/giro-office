import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";

import { useFetch } from "@shared/hooks";
import type { PaginatedResult } from "@shared/pagination/pagination";

import { regularizeService } from "../services/regularizeService";
import type {
  CreateRegularizePasswordPayload,
  CreateRegularizeSitePasswordPayload,
  RegularizeId,
  RegularizePasswordDetail,
  RegularizePasswordListFilters,
  RegularizePasswordListItem,
  RegularizeSitePasswordDetail,
  RegularizeSitePasswordListFilters,
  RegularizeSitePasswordListItem,
  UpdateRegularizePasswordPayload,
  UpdateRegularizeSitePasswordPayload,
} from "../types";
import { regularizeQueryKeys } from "./queryKeys";

type RegularizeReadQueryOptions = {
  enabled?: boolean;
};

export function useRegularizeSitePasswords(
  filters: RegularizeSitePasswordListFilters,
  options?: RegularizeReadQueryOptions,
): UseQueryResult<RegularizeSitePasswordListItem[], Error> {
  return useFetch(
    regularizeQueryKeys.sitePasswords(filters),
    () => regularizeService.listSitePasswords(filters),
    {
      enabled: options?.enabled ?? true,
    },
  );
}

export function usePaginatedRegularizeSitePasswords(
  filters: RegularizeSitePasswordListFilters & { page: number; limit: number },
  options?: RegularizeReadQueryOptions,
): UseQueryResult<PaginatedResult<RegularizeSitePasswordListItem>, Error> {
  return useFetch(
    regularizeQueryKeys.sitePasswordsPage(filters),
    () => regularizeService.listSitePasswordsPage(filters),
    {
      enabled: options?.enabled ?? true,
    },
  );
}

export function useRegularizeSitePasswordDetail(
  id: RegularizeId | undefined | null,
  options?: RegularizeReadQueryOptions,
): UseQueryResult<RegularizeSitePasswordDetail, Error> {
  return useFetch(
    regularizeQueryKeys.sitePasswordDetail(id),
    () => regularizeService.getSitePassword(id ?? ""),
    {
      enabled: Boolean(id) && (options?.enabled ?? true),
    },
  );
}

export function useCreateRegularizeSitePasswordMutation(): UseMutationResult<
  RegularizeSitePasswordDetail,
  Error,
  CreateRegularizeSitePasswordPayload
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => regularizeService.createSitePassword(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: regularizeQueryKeys.credentials(),
      });
    },
  });
}

export function useUpdateRegularizeSitePasswordMutation(): UseMutationResult<
  RegularizeSitePasswordDetail,
  Error,
  UpdateRegularizeSitePasswordPayload
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => regularizeService.updateSitePassword(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: regularizeQueryKeys.credentials(),
      });
    },
  });
}

export function useRegularizePasswords(
  filters: RegularizePasswordListFilters | undefined,
  options?: RegularizeReadQueryOptions,
): UseQueryResult<RegularizePasswordListItem[], Error> {
  const safeFilters = filters ?? { client_id: "" };

  return useFetch(
    regularizeQueryKeys.passwords(safeFilters),
    () => regularizeService.listPasswords(safeFilters),
    {
      enabled: Boolean(filters?.client_id) && (options?.enabled ?? true),
    },
  );
}

export function useCreateRegularizePasswordMutation(): UseMutationResult<
  RegularizePasswordDetail,
  Error,
  CreateRegularizePasswordPayload
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => regularizeService.createPassword(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: regularizeQueryKeys.credentials(),
      });
    },
  });
}

export function useUpdateRegularizePasswordMutation(): UseMutationResult<
  RegularizePasswordDetail,
  Error,
  UpdateRegularizePasswordPayload
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => regularizeService.updatePassword(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: regularizeQueryKeys.credentials(),
      });
    },
  });
}

export function useRegularizePasswordDetail(
  id: RegularizeId | undefined | null,
  options?: RegularizeReadQueryOptions,
): UseQueryResult<RegularizePasswordDetail, Error> {
  return useFetch(
    regularizeQueryKeys.passwordDetail(id),
    () => regularizeService.getPassword(id ?? ""),
    {
      enabled: Boolean(id) && (options?.enabled ?? true),
    },
  );
}

import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";

import { useFetch } from "@shared/hooks";

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
    onSuccess: async (created) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: regularizeQueryKeys.sitePasswords({ status: true }),
        }),
        queryClient.invalidateQueries({
          queryKey: regularizeQueryKeys.sitePasswords({ status: false }),
        }),
        queryClient.invalidateQueries({
          queryKey: regularizeQueryKeys.sitePasswordDetail(created.id),
        }),
      ]);
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
    onSuccess: async (updated) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: regularizeQueryKeys.sitePasswords({ status: true }),
        }),
        queryClient.invalidateQueries({
          queryKey: regularizeQueryKeys.sitePasswords({ status: false }),
        }),
        queryClient.invalidateQueries({
          queryKey: regularizeQueryKeys.sitePasswordDetail(updated.id),
        }),
      ]);
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
    onSuccess: async (created, payload) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: regularizeQueryKeys.passwords({ client_id: payload.client_id }),
        }),
        queryClient.invalidateQueries({
          queryKey: regularizeQueryKeys.passwordDetail(created.id),
        }),
      ]);
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
    onSuccess: async (updated, payload) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: regularizeQueryKeys.passwords({ client_id: payload.client_id }),
        }),
        queryClient.invalidateQueries({
          queryKey: regularizeQueryKeys.passwordDetail(updated.id),
        }),
      ]);
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

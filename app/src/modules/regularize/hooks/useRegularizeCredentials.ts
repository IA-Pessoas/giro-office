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
import { regularizeQueryKeys, useRegularizeQueryScope } from "./queryKeys";

type RegularizeReadQueryOptions = {
  enabled?: boolean;
};

async function invalidateRegularizeCredentials(
  queryClient: ReturnType<typeof useQueryClient>,
  scope: ReturnType<typeof useRegularizeQueryScope>,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: regularizeQueryKeys.credentials(scope),
    }),
    queryClient.invalidateQueries({
      queryKey: regularizeQueryKeys.dashboardRoot(scope),
    }),
  ]);
}

export function useRegularizeSitePasswords(
  filters: RegularizeSitePasswordListFilters,
  options?: RegularizeReadQueryOptions,
): UseQueryResult<RegularizeSitePasswordListItem[], Error> {
  const scope = useRegularizeQueryScope();

  return useFetch(
    regularizeQueryKeys.sitePasswords(filters, scope),
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
  const scope = useRegularizeQueryScope();

  return useFetch(
    regularizeQueryKeys.sitePasswordsPage(filters, scope),
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
  const scope = useRegularizeQueryScope();

  return useFetch(
    regularizeQueryKeys.sitePasswordDetail(id, scope),
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
  const scope = useRegularizeQueryScope();

  return useMutation({
    mutationFn: (payload) => regularizeService.createSitePassword(payload),
    onSuccess: () => invalidateRegularizeCredentials(queryClient, scope),
  });
}

export function useUpdateRegularizeSitePasswordMutation(): UseMutationResult<
  RegularizeSitePasswordDetail,
  Error,
  UpdateRegularizeSitePasswordPayload
> {
  const queryClient = useQueryClient();
  const scope = useRegularizeQueryScope();

  return useMutation({
    mutationFn: (payload) => regularizeService.updateSitePassword(payload),
    onSuccess: () => invalidateRegularizeCredentials(queryClient, scope),
  });
}

export function useRegularizePasswords(
  filters: RegularizePasswordListFilters | undefined,
  options?: RegularizeReadQueryOptions,
): UseQueryResult<RegularizePasswordListItem[], Error> {
  const safeFilters = filters ?? { client_id: "" };
  const scope = useRegularizeQueryScope();

  return useFetch(
    regularizeQueryKeys.passwords(safeFilters, scope),
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
  const scope = useRegularizeQueryScope();

  return useMutation({
    mutationFn: (payload) => regularizeService.createPassword(payload),
    onSuccess: () => invalidateRegularizeCredentials(queryClient, scope),
  });
}

export function useUpdateRegularizePasswordMutation(): UseMutationResult<
  RegularizePasswordDetail,
  Error,
  UpdateRegularizePasswordPayload
> {
  const queryClient = useQueryClient();
  const scope = useRegularizeQueryScope();

  return useMutation({
    mutationFn: (payload) => regularizeService.updatePassword(payload),
    onSuccess: () => invalidateRegularizeCredentials(queryClient, scope),
  });
}

export function useRegularizePasswordDetail(
  id: RegularizeId | undefined | null,
  options?: RegularizeReadQueryOptions,
): UseQueryResult<RegularizePasswordDetail, Error> {
  const scope = useRegularizeQueryScope();

  return useFetch(
    regularizeQueryKeys.passwordDetail(id, scope),
    () => regularizeService.getPassword(id ?? ""),
    {
      enabled: Boolean(id) && (options?.enabled ?? true),
    },
  );
}

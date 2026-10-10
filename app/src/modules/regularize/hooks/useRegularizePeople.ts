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
  CreateRegularizeClientPfPayload,
  CreateRegularizePartnerPayload,
  RegularizeClientPfDetail,
  RegularizeClientPfListFilters,
  RegularizeClientPfListItem,
  RegularizeGroupMap,
  RegularizeId,
  RegularizePartner,
  RegularizePartnerListFilters,
  UpdateRegularizeClientPfPayload,
  UpdateRegularizePartnerPayload,
} from "../types";
import { regularizeQueryKeys, useRegularizeQueryScope } from "./queryKeys";

type RegularizeReadQueryOptions = {
  enabled?: boolean;
};

async function invalidateRegularizePeople(
  queryClient: ReturnType<typeof useQueryClient>,
  scope: ReturnType<typeof useRegularizeQueryScope>,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: regularizeQueryKeys.people(scope),
    }),
    queryClient.invalidateQueries({
      queryKey: regularizeQueryKeys.dashboardRoot(scope),
    }),
  ]);
}

export function usePaginatedRegularizeClientPfs(
  filters: RegularizeClientPfListFilters & { page: number; limit: number },
  options?: RegularizeReadQueryOptions,
): UseQueryResult<PaginatedResult<RegularizeClientPfListItem>, Error> {
  const scope = useRegularizeQueryScope();

  return useFetch(
    regularizeQueryKeys.clientPfsPage(filters, scope),
    () => regularizeService.listClientPfsPage(filters),
    {
      enabled: Boolean(filters.status) && (options?.enabled ?? true),
    },
  );
}

export function useRegularizeClientPfDetail(
  id: RegularizeId | undefined | null,
  options?: RegularizeReadQueryOptions,
): UseQueryResult<RegularizeClientPfDetail, Error> {
  const scope = useRegularizeQueryScope();

  return useFetch(
    regularizeQueryKeys.clientPfDetail(id, scope),
    () => regularizeService.getClientPf(id ?? ""),
    {
      enabled: Boolean(id) && (options?.enabled ?? true),
    },
  );
}

export function useCreateRegularizeClientPfMutation(): UseMutationResult<
  RegularizeClientPfDetail,
  Error,
  CreateRegularizeClientPfPayload
> {
  const queryClient = useQueryClient();
  const scope = useRegularizeQueryScope();

  return useMutation({
    mutationFn: (payload) => regularizeService.createClientPf(payload),
    onSuccess: () => invalidateRegularizePeople(queryClient, scope),
  });
}

export function useUpdateRegularizeClientPfMutation(): UseMutationResult<
  RegularizeClientPfDetail,
  Error,
  UpdateRegularizeClientPfPayload
> {
  const queryClient = useQueryClient();
  const scope = useRegularizeQueryScope();

  return useMutation({
    mutationFn: (payload) => regularizeService.updateClientPf(payload),
    onSuccess: () => invalidateRegularizePeople(queryClient, scope),
  });
}

export function useRegularizePartners(
  filters: RegularizePartnerListFilters | undefined,
  options?: RegularizeReadQueryOptions,
): UseQueryResult<RegularizePartner[], Error> {
  const safeFilters = filters ?? { type: "pf", client_id: "" };
  const scope = useRegularizeQueryScope();

  return useFetch(
    regularizeQueryKeys.partners(safeFilters, scope),
    () => regularizeService.listPartners(safeFilters),
    {
      enabled: Boolean(filters?.client_id && filters?.type) && (options?.enabled ?? true),
    },
  );
}

export function useCreateRegularizePartnerMutation(): UseMutationResult<
  RegularizePartner,
  Error,
  CreateRegularizePartnerPayload
> {
  const queryClient = useQueryClient();
  const scope = useRegularizeQueryScope();

  return useMutation({
    mutationFn: (payload) => regularizeService.createPartner(payload),
    onSuccess: () => invalidateRegularizePeople(queryClient, scope),
  });
}

export function useUpdateRegularizePartnerMutation(): UseMutationResult<
  RegularizePartner,
  Error,
  UpdateRegularizePartnerPayload
> {
  const queryClient = useQueryClient();
  const scope = useRegularizeQueryScope();

  return useMutation({
    mutationFn: (payload) => regularizeService.updatePartner(payload),
    onSuccess: () => invalidateRegularizePeople(queryClient, scope),
  });
}

export function useDeleteRegularizePartnerMutation(): UseMutationResult<
  { ok: true },
  Error,
  RegularizeId
> {
  const queryClient = useQueryClient();
  const scope = useRegularizeQueryScope();

  return useMutation({
    mutationFn: (id) => regularizeService.deletePartner(id),
    onSuccess: () => invalidateRegularizePeople(queryClient, scope),
  });
}

export function useRegularizeGroupMap(
  groupId: RegularizeId,
): UseQueryResult<RegularizeGroupMap, Error> {
  const scope = useRegularizeQueryScope();

  return useFetch(
    regularizeQueryKeys.groupMap(groupId, scope),
    () => regularizeService.getGroupMap(groupId),
    { enabled: Boolean(groupId) },
  );
}

export function useRegularizePartnerDetail(
  id: RegularizeId | undefined | null,
  options?: RegularizeReadQueryOptions,
): UseQueryResult<RegularizePartner, Error> {
  const scope = useRegularizeQueryScope();

  return useFetch(
    regularizeQueryKeys.partnerDetail(id, scope),
    () => regularizeService.getPartner(id ?? ""),
    {
      enabled: Boolean(id) && (options?.enabled ?? true),
    },
  );
}

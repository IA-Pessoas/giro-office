import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";

import { useFetch } from "@shared/hooks";

import { regularizeService } from "../services/regularizeService";
import type {
  CreateRegularizeClientPfPayload,
  CreateRegularizePartnerPayload,
  RegularizeClientPfDetail,
  RegularizeClientPfListFilters,
  RegularizeClientPfListItem,
  RegularizeId,
  RegularizePartner,
  RegularizePartnerListFilters,
  UpdateRegularizeClientPfPayload,
  UpdateRegularizePartnerPayload,
} from "../types";
import { regularizeQueryKeys } from "./queryKeys";

type RegularizeReadQueryOptions = {
  enabled?: boolean;
};

export function useRegularizeClientPfs(
  filters: RegularizeClientPfListFilters,
  options?: RegularizeReadQueryOptions,
): UseQueryResult<RegularizeClientPfListItem[], Error> {
  return useFetch(
    regularizeQueryKeys.clientPfs(filters),
    () => regularizeService.listClientPfs(filters),
    {
      enabled: Boolean(filters.status) && (options?.enabled ?? true),
    },
  );
}

export function useRegularizeClientPfDetail(
  id: RegularizeId | undefined | null,
  options?: RegularizeReadQueryOptions,
): UseQueryResult<RegularizeClientPfDetail, Error> {
  return useFetch(
    regularizeQueryKeys.clientPfDetail(id),
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

  return useMutation({
    mutationFn: (payload) => regularizeService.createClientPf(payload),
    onSuccess: async (created, payload) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: regularizeQueryKeys.clientPfs({ status: payload.status }),
        }),
        queryClient.invalidateQueries({
          queryKey: regularizeQueryKeys.clientPfDetail(created.id),
        }),
      ]);
    },
  });
}

export function useUpdateRegularizeClientPfMutation(): UseMutationResult<
  RegularizeClientPfDetail,
  Error,
  UpdateRegularizeClientPfPayload
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => regularizeService.updateClientPf(payload),
    onSuccess: async (updated, payload) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: regularizeQueryKeys.clientPfs({ status: payload.status }),
        }),
        queryClient.invalidateQueries({
          queryKey: regularizeQueryKeys.clientPfDetail(updated.id),
        }),
      ]);
    },
  });
}

export function useRegularizePartners(
  filters: RegularizePartnerListFilters | undefined,
  options?: RegularizeReadQueryOptions,
): UseQueryResult<RegularizePartner[], Error> {
  const safeFilters = filters ?? { type: "pf", client_id: "" };

  return useFetch(
    regularizeQueryKeys.partners(safeFilters),
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

  return useMutation({
    mutationFn: (payload) => regularizeService.createPartner(payload),
    onSuccess: async (created, payload) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: regularizeQueryKeys.partners({ type: "pf", client_id: payload.pf_id }),
        }),
        queryClient.invalidateQueries({
          queryKey: regularizeQueryKeys.partners({ type: "pj", client_id: payload.pj_id }),
        }),
        queryClient.invalidateQueries({
          queryKey: regularizeQueryKeys.partnerDetail(created.id),
        }),
      ]);
    },
  });
}

export function useUpdateRegularizePartnerMutation(): UseMutationResult<
  RegularizePartner,
  Error,
  UpdateRegularizePartnerPayload
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => regularizeService.updatePartner(payload),
    onSuccess: async (updated, payload) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: regularizeQueryKeys.partners({ type: "pf", client_id: payload.pf_id }),
        }),
        queryClient.invalidateQueries({
          queryKey: regularizeQueryKeys.partners({ type: "pj", client_id: payload.pj_id }),
        }),
        queryClient.invalidateQueries({
          queryKey: regularizeQueryKeys.partnerDetail(updated.id),
        }),
      ]);
    },
  });
}

export function useRegularizePartnerDetail(
  id: RegularizeId | undefined | null,
  options?: RegularizeReadQueryOptions,
): UseQueryResult<RegularizePartner, Error> {
  return useFetch(
    regularizeQueryKeys.partnerDetail(id),
    () => regularizeService.getPartner(id ?? ""),
    {
      enabled: Boolean(id) && (options?.enabled ?? true),
    },
  );
}

import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import { useFetch } from "@shared/hooks";

import { parcelamentoService } from "../services";
import type {
  CreateParcelamentoInstallmentPayload,
  ParcelamentoInstallment,
  ParcelamentoListPage,
  ParcelamentoListFilters,
  PatchParcelamentoInstallmentPayload,
} from "../types";
import { parcelamentoQueryKey } from "./queryKeys";

interface ParcelamentoQueryOptions {
  enabled?: boolean;
}

export function parcelamentoInstallmentsQueryKey(filters: ParcelamentoListFilters) {
  return parcelamentoQueryKey("installments", filters);
}

export function useParcelamentoInstallments(
  filters: ParcelamentoListFilters,
  options: ParcelamentoQueryOptions = {},
): UseQueryResult<ParcelamentoListPage<ParcelamentoInstallment>, Error> {
  return useFetch(
    parcelamentoInstallmentsQueryKey(filters),
    () => parcelamentoService.listInstallments(filters),
    {
      enabled: options.enabled ?? true,
    },
  );
}

export function useCreateParcelamentoInstallmentMutation(
  filters: ParcelamentoListFilters,
): UseMutationResult<ParcelamentoInstallment, Error, CreateParcelamentoInstallmentPayload> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateParcelamentoInstallmentPayload) =>
      parcelamentoService.createInstallment(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: parcelamentoQueryKey("installments") });
      await queryClient.invalidateQueries({ queryKey: parcelamentoInstallmentsQueryKey(filters) });
    },
  });
}

export function useUpdateParcelamentoInstallmentMutation(
  id: string,
  filters: ParcelamentoListFilters,
): UseMutationResult<ParcelamentoInstallment, Error, PatchParcelamentoInstallmentPayload> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: PatchParcelamentoInstallmentPayload) =>
      parcelamentoService.updateInstallment(id, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: parcelamentoQueryKey("installments") });
      await queryClient.invalidateQueries({ queryKey: parcelamentoInstallmentsQueryKey(filters) });
      await queryClient.invalidateQueries({ queryKey: parcelamentoQueryKey("installments", id) });
    },
  });
}

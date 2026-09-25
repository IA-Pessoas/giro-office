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

// Uma invalidação pelo prefixo cobre lista, dashboard e detalhe: uma recarga só (#1349).
export function useCreateParcelamentoInstallmentMutation(): UseMutationResult<ParcelamentoInstallment, Error, CreateParcelamentoInstallmentPayload> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateParcelamentoInstallmentPayload) =>
      parcelamentoService.createInstallment(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: parcelamentoQueryKey("installments") });
    },
  });
}

export function useUpdateParcelamentoInstallmentMutation(
  id: string,
): UseMutationResult<ParcelamentoInstallment, Error, PatchParcelamentoInstallmentPayload> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: PatchParcelamentoInstallmentPayload) =>
      parcelamentoService.updateInstallment(id, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: parcelamentoQueryKey("installments") });
    },
  });
}

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useFetch } from "@shared/hooks";

import { parcelamentoService } from "../services";
import type {
  CreateParcelamentoInstallmentCompetencyPayload,
  ParcelamentoListFilters,
  PatchParcelamentoInstallmentCompetencyPayload,
} from "../types";
import { parcelamentoQueryKey } from "./queryKeys";

interface ParcelamentoQueryOptions {
  enabled?: boolean;
}

interface CreateCompetencyVariables {
  installmentId: string;
  payload: CreateParcelamentoInstallmentCompetencyPayload;
}

interface UpdateCompetencyVariables {
  id: string;
  installmentId: string;
  payload: PatchParcelamentoInstallmentCompetencyPayload;
}

export function parcelamentoCompetenciesQueryKey(
  installmentId: string,
  filters: ParcelamentoListFilters,
) {
  return parcelamentoQueryKey("installments", installmentId, "competencies", filters);
}

function invalidateCompetencies(
  queryClient: ReturnType<typeof useQueryClient>,
  installmentId: string,
) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: parcelamentoQueryKey("installments") }),
    queryClient.invalidateQueries({
      queryKey: parcelamentoQueryKey("installments", installmentId, "competencies"),
    }),
  ]);
}

export function useParcelamentoCompetencies(
  installmentId: string,
  filters: ParcelamentoListFilters,
  options: ParcelamentoQueryOptions = {},
) {
  return useFetch(
    parcelamentoCompetenciesQueryKey(installmentId, filters),
    () => parcelamentoService.listInstallmentCompetencies(installmentId, filters),
    {
      enabled: Boolean(installmentId) && (options.enabled ?? true),
    },
  );
}

export function useCreateParcelamentoCompetency() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ installmentId, payload }: CreateCompetencyVariables) =>
      parcelamentoService.createInstallmentCompetency(installmentId, payload),
    onSuccess: (_competency, variables) =>
      invalidateCompetencies(queryClient, variables.installmentId),
  });
}

export function useUpdateParcelamentoCompetency() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payload }: UpdateCompetencyVariables) =>
      parcelamentoService.updateInstallmentCompetency(id, payload),
    onSuccess: (_competency, variables) =>
      invalidateCompetencies(queryClient, variables.installmentId),
  });
}

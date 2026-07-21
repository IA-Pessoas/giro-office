import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useFetch } from "@shared/hooks";

import { parcelamentoService } from "../services";
import type {
  CreateParcelamentoPanoramaPayload,
  ParcelamentoListFilters,
  PatchParcelamentoPanoramaPayload,
} from "../types";
import { parcelamentoQueryKey } from "./queryKeys";

interface ParcelamentoQueryOptions {
  enabled?: boolean;
}

export function parcelamentoPanoramasQueryKey(filters: ParcelamentoListFilters) {
  return parcelamentoQueryKey("panoramas", filters);
}

export function useParcelamentoPanoramas(
  filters: ParcelamentoListFilters,
  options: ParcelamentoQueryOptions = {},
) {
  return useFetch(
    parcelamentoPanoramasQueryKey(filters),
    () => parcelamentoService.listPanoramas(filters),
    {
      enabled: options.enabled ?? true,
    },
  );
}

function invalidatePanoramas(
  queryClient: ReturnType<typeof useQueryClient>,
  filters: ParcelamentoListFilters,
) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: parcelamentoQueryKey("panoramas") }),
    queryClient.invalidateQueries({ queryKey: parcelamentoPanoramasQueryKey(filters) }),
  ]);
}

export function useCreateParcelamentoPanoramaMutation(filters: ParcelamentoListFilters) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateParcelamentoPanoramaPayload) =>
      parcelamentoService.createPanorama(payload),
    onSuccess: () => invalidatePanoramas(queryClient, filters),
  });
}

export function useUpdateParcelamentoPanoramaMutation(
  id: string,
  filters: ParcelamentoListFilters,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: PatchParcelamentoPanoramaPayload) =>
      parcelamentoService.updatePanorama(id, payload),
    onSuccess: async () => {
      await invalidatePanoramas(queryClient, filters);
      await queryClient.invalidateQueries({ queryKey: parcelamentoQueryKey("panoramas", id) });
    },
  });
}

export function useGenerateParcelamentoPanoramasMutation(filters: ParcelamentoListFilters) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (competence: string) => parcelamentoService.generatePanoramas(competence),
    onSuccess: () => invalidatePanoramas(queryClient, filters),
  });
}

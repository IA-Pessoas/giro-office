import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useFetch } from "@shared/hooks";

import { commercialQueryKeys } from "./queryKeys";
import { commercialService } from "../services/commercialService";
import type {
  CreateCommercialProspectingPayload,
  UpdateCommercialProspectingPayload,
} from "../types";

export function useCommercialProspecting() {
  return useFetch(commercialQueryKeys.prospecting(), () => commercialService.listProspecting());
}

export function useCommercialProspectingClients() {
  return useFetch(commercialQueryKeys.prospectingClients(), () => commercialService.listProspectingClients());
}

export function useCreateCommercialProspecting() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateCommercialProspectingPayload) =>
      commercialService.createProspecting(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: commercialQueryKeys.prospecting() }),
  });
}

export function useUpdateCommercialProspecting() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateCommercialProspectingPayload }) =>
      commercialService.updateProspecting(id, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: commercialQueryKeys.prospecting() }),
  });
}

export function useArchiveCommercialProspecting() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => commercialService.archiveProspecting(id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: commercialQueryKeys.prospecting() }),
        queryClient.invalidateQueries({ queryKey: commercialQueryKeys.prospectingClients() }),
      ]);
    },
  });
}

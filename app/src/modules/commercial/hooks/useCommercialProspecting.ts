import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useFetch } from "@shared/hooks";

import { commercialQueryKeys } from "./queryKeys";
import { commercialService } from "../services/commercialService";
import type {
  CommercialProspectingFilters,
  CreateCommercialProspectingPayload,
  UpdateCommercialProspectingPayload,
} from "../types";

export function useCommercialProspecting(filters: CommercialProspectingFilters) {
  return useFetch(commercialQueryKeys.prospecting(filters), () => commercialService.listProspecting(filters));
}

export function useCommercialProspectingClients() {
  return useFetch(commercialQueryKeys.prospectingClients(), () => commercialService.listProspectingClients());
}

export function useCreateCommercialProspecting() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateCommercialProspectingPayload) =>
      commercialService.createProspecting(payload),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: commercialQueryKeys.prospecting() }),
        queryClient.invalidateQueries({ queryKey: commercialQueryKeys.prospectingClients() }),
      ]),
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

export function useUploadCommercialProspectingAttachment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) =>
      commercialService.uploadProspectingAttachment(id, file),
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

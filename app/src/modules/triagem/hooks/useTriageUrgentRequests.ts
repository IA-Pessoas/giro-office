import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useFetch } from "@shared/hooks";

import {
  triagemUrgentRequestService,
  type TriageUrgentRequestInput,
} from "../services/triagemUrgentRequestService";

export function triagemUrgentRequestsQueryKey(clientId: string, competence: string) {
  return ["triagem", "urgent-requests", clientId, competence] as const;
}

export function useTriageUrgentRequests(clientId: string, competence: string) {
  return useFetch(
    triagemUrgentRequestsQueryKey(clientId, competence),
    () => triagemUrgentRequestService.list(clientId, competence),
    { enabled: Boolean(clientId && competence) },
  );
}

export function useTriageUrgentRequestMutations(clientId: string, competence: string) {
  const queryClient = useQueryClient();
  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: triagemUrgentRequestsQueryKey(clientId, competence),
    });

  return {
    create: useMutation({
      mutationFn: (input: TriageUrgentRequestInput) =>
        triagemUrgentRequestService.create(clientId, competence, input),
      onSuccess: refresh,
    }),
    update: useMutation({
      mutationFn: ({ id, input }: { id: string; input: TriageUrgentRequestInput }) =>
        triagemUrgentRequestService.update(id, input),
      onSuccess: refresh,
    }),
    close: useMutation({
      mutationFn: ({ id, resolutionNote }: { id: string; resolutionNote: string }) =>
        triagemUrgentRequestService.close(id, resolutionNote),
      onSuccess: refresh,
    }),
    reopen: useMutation({
      mutationFn: (id: string) => triagemUrgentRequestService.reopen(id),
      onSuccess: refresh,
    }),
  };
}

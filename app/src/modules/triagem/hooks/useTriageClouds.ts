import { useMutation, useQueryClient } from "@tanstack/react-query";
import { TRIAGE_DOCUMENT_HISTORY_QUERY_KEY } from "@modules/contabil";
import { useFetch } from "@shared/hooks";

import {
  triagemCloudService,
  type TriageClientCloudInput,
} from "../services/triagemCloudService";

export function triagemCloudsQueryKey(clientId: string) {
  return ["triagem", "clouds", clientId] as const;
}

export function useTriageClouds(clientId: string) {
  return useFetch(triagemCloudsQueryKey(clientId), () => triagemCloudService.list(clientId), {
    enabled: Boolean(clientId),
  });
}

export function useTriageCloudMutations(clientId: string) {
  const queryClient = useQueryClient();
  // Cadastro e alteração de Cloud entram no histórico documental da página.
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: triagemCloudsQueryKey(clientId) }),
      queryClient.invalidateQueries({ queryKey: TRIAGE_DOCUMENT_HISTORY_QUERY_KEY }),
    ]);

  return {
    create: useMutation({
      mutationFn: (input: TriageClientCloudInput) => triagemCloudService.create(clientId, input),
      onSuccess: refresh,
    }),
    update: useMutation({
      mutationFn: ({ id, input }: { id: string; input: TriageClientCloudInput }) =>
        triagemCloudService.update(id, input),
      onSuccess: refresh,
    }),
  };
}

import { useMutation, useQueryClient } from "@tanstack/react-query";
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
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: triagemCloudsQueryKey(clientId) });

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

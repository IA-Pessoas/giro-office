import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useFetch } from "@shared/hooks";

import {
  triagemExternalLinkService,
  type TriageExternalLinkInput,
} from "../services/triagemExternalLinkService";

export function triagemExternalLinksQueryKey(clientId: string, competence: string) {
  return ["triagem", "external-links", clientId, competence] as const;
}

export function useTriageExternalLinks(clientId: string, competence: string) {
  return useFetch(
    triagemExternalLinksQueryKey(clientId, competence),
    () => triagemExternalLinkService.list(clientId, competence),
    { enabled: Boolean(clientId && competence) },
  );
}

export function useTriageExternalLinkMutations(clientId: string, competence: string) {
  const queryClient = useQueryClient();
  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: triagemExternalLinksQueryKey(clientId, competence),
    });

  return {
    create: useMutation({
      mutationFn: (input: TriageExternalLinkInput) =>
        triagemExternalLinkService.create(clientId, competence, input),
      onSuccess: refresh,
    }),
    update: useMutation({
      mutationFn: ({ id, input }: { id: string; input: TriageExternalLinkInput }) =>
        triagemExternalLinkService.update(id, input),
      onSuccess: refresh,
    }),
    archive: useMutation({
      mutationFn: (id: string) => triagemExternalLinkService.archive(id),
      onSuccess: refresh,
    }),
  };
}

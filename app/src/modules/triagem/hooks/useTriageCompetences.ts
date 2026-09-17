import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useFetch } from "@shared/hooks";

import { triagemCompetenceService } from "../services/triagemCompetenceService";

export function triagemCompetencesQueryKey(clientId: string) {
  return ["triagem", "competencies", clientId] as const;
}

export function useTriageCompetences(clientId: string) {
  return useFetch(
    triagemCompetencesQueryKey(clientId),
    () => triagemCompetenceService.list(clientId),
    { enabled: Boolean(clientId) },
  );
}

export function useTriageCompetenceMutations(clientId: string) {
  const queryClient = useQueryClient();
  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: triagemCompetencesQueryKey(clientId),
    });

  return {
    create: useMutation({
      mutationFn: (competence: string) =>
        triagemCompetenceService.create(clientId, competence),
      onSuccess: refresh,
    }),
    archive: useMutation({
      mutationFn: (id: string) => triagemCompetenceService.archive(id),
      onSuccess: refresh,
    }),
  };
}

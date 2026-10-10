import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useFetch } from "@shared/hooks";

import {
  triagemSolicitationService,
  type TriageNoteCountsInput,
  type TriageSolicitation,
  type TriageSolicitationInput,
  type TriageSolicitationStatus,
} from "../services/triagemSolicitationService";

export function triagemSolicitationsQueryKey(status?: TriageSolicitationStatus) {
  return status ? (["triagem", "solicitations", status] as const) : (["triagem", "solicitations"] as const);
}

export function useTriageSolicitations(status: TriageSolicitationStatus) {
  return useFetch(triagemSolicitationsQueryKey(status), () =>
    triagemSolicitationService.list(status),
  );
}

export function triagemSolicitationIndicatorsQueryKey(
  competence?: string,
  status?: TriageSolicitationStatus,
) {
  return competence
    ? (["triagem", "solicitations", "indicators", competence, status ?? "all"] as const)
    : (["triagem", "solicitations", "indicators"] as const);
}

export function useTriageSolicitationIndicators(
  competence: string,
  status?: TriageSolicitationStatus,
) {
  return useFetch(
    triagemSolicitationIndicatorsQueryKey(competence, status),
    () => triagemSolicitationService.indicators(competence, status),
    { enabled: Boolean(competence) },
  );
}

// Contadores são do cliente+competência: a chave usa esse par, não o ID do pedido,
// para que pedidos da mesma competência compartilhem o cache.
export function triagemNoteCountsQueryKey(clientId: string, competence: string) {
  return ["triagem", "note-counts", clientId, competence] as const;
}

export function useTriageNoteCounts(solicitation: TriageSolicitation) {
  const queryClient = useQueryClient();
  const queryKey = triagemNoteCountsQueryKey(solicitation.client_id, solicitation.competence);
  const query = useFetch(queryKey, () =>
    triagemSolicitationService.getNoteCounts(solicitation.id),
  );
  const update = useMutation({
    mutationFn: (input: TriageNoteCountsInput) =>
      triagemSolicitationService.updateNoteCounts(solicitation.id, input),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKey, data);
      return queryClient.invalidateQueries({ queryKey: triagemSolicitationIndicatorsQueryKey() });
    },
  });
  return { query, update };
}

export function useTriageSolicitationMutations() {
  const queryClient = useQueryClient();
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: triagemSolicitationsQueryKey() });

  return {
    create: useMutation({
      mutationFn: (input: TriageSolicitationInput) => triagemSolicitationService.create(input),
      onSuccess: refresh,
    }),
    close: useMutation({
      mutationFn: (id: string) => triagemSolicitationService.close(id),
      onSuccess: refresh,
    }),
  };
}

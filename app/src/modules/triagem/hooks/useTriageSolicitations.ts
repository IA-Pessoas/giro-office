import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useFetch } from "@shared/hooks";

import {
  triagemSolicitationService,
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

import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";

import { useFetch } from "@shared/hooks";

import { pessoalService } from "../services/pessoalService";
import type {
  PessoalObligation,
  PessoalObligationCreatePayload,
  PessoalObligationCreateResult,
  PessoalObligationGenerationResult,
  PessoalObligationUpdatePayload,
} from "../types/obligations";
import { pessoalQueryKey } from "./queryKeys";

function obligationKey(clientId: string, competence: string) {
  return pessoalQueryKey("obligations", clientId || "missing", competence || "missing");
}

export function usePessoalObligation(
  clientId: string,
  competence: string,
  enabled: boolean,
): UseQueryResult<PessoalObligation | null, Error> {
  return useFetch(
    obligationKey(clientId, competence),
    () => pessoalService.detailObligation(clientId, competence),
    {
      enabled: enabled && clientId.length > 0 && competence.length > 0,
    },
  );
}

export function useCreatePessoalObligationMutation(): UseMutationResult<
  PessoalObligationCreateResult,
  Error,
  PessoalObligationCreatePayload
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => pessoalService.createObligation(payload),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({
        queryKey: obligationKey(result.obligation.client_id, result.obligation.competence),
      });
    },
  });
}

export function useUpdatePessoalObligationMutation(
  id: string,
  clientId: string,
  competence: string,
): UseMutationResult<PessoalObligation, Error, PessoalObligationUpdatePayload> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => pessoalService.updateObligationField(id, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: obligationKey(clientId, competence) });
    },
  });
}

export function useGeneratePessoalObligationsMutation(
  competence: string,
): UseMutationResult<PessoalObligationGenerationResult, Error, void> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => pessoalService.generateObligations(competence),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: pessoalQueryKey("obligations") });
    },
  });
}

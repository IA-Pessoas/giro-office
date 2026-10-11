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
  PessoalObligationHistoryPage,
  PessoalObligationPortfolioFilters,
  PessoalObligationPortfolioPage,
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
    onSettled: async (_result, _error, payload) => {
      await queryClient.invalidateQueries({
        queryKey: obligationKey(payload.client_id, payload.competence),
      });
    },
  });
}

/** Edição pela ficha: mesmo PATCH da carteira; invalida ficha, carteira e histórico. */
export function useUpdatePessoalObligationMutation(
  id: string,
): UseMutationResult<PessoalObligation, Error, PessoalObligationUpdatePayload> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => pessoalService.updateObligationField(id, payload),
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: pessoalQueryKey("obligations") });
    },
  });
}

function obligationHistoryKey(id: string, page?: number) {
  return pessoalQueryKey("obligations", "history", id || "missing", page);
}

export function usePessoalObligationHistory(
  id: string,
  page: number,
  pageSize: number,
): UseQueryResult<PessoalObligationHistoryPage, Error> {
  return useFetch(
    obligationHistoryKey(id, page),
    () => pessoalService.listObligationHistory(id, page, pageSize),
    { enabled: id.length > 0 },
  );
}

export function usePessoalObligationPortfolio(
  filters: PessoalObligationPortfolioFilters,
): UseQueryResult<PessoalObligationPortfolioPage, Error> {
  return useFetch(
    pessoalQueryKey("obligations", "portfolio", JSON.stringify(filters)),
    () => pessoalService.listObligationPortfolio(filters),
    { enabled: filters.competence.length > 0 },
  );
}

/** Edição pela carteira: mesmo PATCH da ficha; invalida carteira e ficha individual. */
export function useUpdatePessoalPortfolioObligationMutation(): UseMutationResult<
  PessoalObligation,
  Error,
  { id: string; payload: PessoalObligationUpdatePayload }
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payload }) => pessoalService.updateObligationField(id, payload),
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: pessoalQueryKey("obligations") });
    },
  });
}

export function useGeneratePessoalObligationsMutation(
  competence: string,
): UseMutationResult<PessoalObligationGenerationResult, Error, void> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => pessoalService.generateObligations(competence),
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: pessoalQueryKey("obligations") });
    },
  });
}

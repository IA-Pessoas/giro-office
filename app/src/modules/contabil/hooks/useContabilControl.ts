import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";

import { useFetch } from "@shared/hooks";

import { contabilControlService } from "../services";
import type {
  ContabilControl,
  ContabilCompetence,
  ContabilControlPortfolio,
  ContabilCompetenceOperationPayload,
  CreateYearContabilControlsPayload,
  CreateOrGetContabilControlPayload,
  PatchContabilControlFieldPayload,
} from "../types";
import { CONTABIL_QUERY_KEY, contabilControlPortfolioQueryKey, contabilControlQueryKey } from "./queryKeys";

export function useContabilControlPortfolio(
  competence: ContabilCompetence,
): UseQueryResult<ContabilControlPortfolio, Error> {
  return useFetch(
    contabilControlPortfolioQueryKey(competence),
    () => contabilControlService.getPortfolio(competence),
  );
}

interface PatchContabilControlFieldMutationPayload {
  clientId: string;
  competence: string;
  controlId: string;
  payload: {
    field: PatchContabilControlFieldPayload["field"];
    value: boolean | string;
  };
}

export function useContabilControlDetail(
  filters: { clientId: string; competence: ContabilCompetence },
  options?: { enabled?: boolean },
): UseQueryResult<ContabilControl | null, Error> {
  return useFetch(
    contabilControlQueryKey(filters.clientId, filters.competence),
    () => contabilControlService.getControl(filters),
    {
      enabled: (options?.enabled ?? true) && Boolean(filters.clientId),
    },
  );
}

export function useContabilControlBootstrapMutation(): UseMutationResult<
  ContabilControl,
  Error,
  CreateOrGetContabilControlPayload
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => contabilControlService.createOrGetControl(payload),
    onSuccess: async (control, payload) => {
      queryClient.setQueryData(
        contabilControlQueryKey(payload.client_id, payload.competence),
        control,
      );
      await queryClient.invalidateQueries({
        queryKey: contabilControlPortfolioQueryKey(payload.competence),
      });
    },
  });
}

export function usePatchContabilControlFieldMutation(): UseMutationResult<
  ContabilControl,
  Error,
  PatchContabilControlFieldMutationPayload
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ controlId, payload }) =>
      contabilControlService.patchControlField(controlId, payload),
    onSuccess: async (control, variables) => {
      queryClient.setQueryData(
        contabilControlQueryKey(variables.clientId, variables.competence),
        control,
      );
      await queryClient.invalidateQueries({
        queryKey: contabilControlPortfolioQueryKey(variables.competence),
      });
    },
  });
}

function invalidateControlQueries(queryClient: ReturnType<typeof useQueryClient>, clientId: string, competence: string) {
  queryClient.removeQueries({ queryKey: contabilControlQueryKey(clientId, competence) });
  return queryClient.invalidateQueries({ queryKey: contabilControlPortfolioQueryKey(competence) });
}

export function useCompleteContabilControlMutation(): UseMutationResult<ContabilControl, Error, { controlId: string; clientId: string; competence: ContabilCompetence }> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ controlId }) => contabilControlService.completeAll(controlId),
    onSuccess: async (control, variables) => {
      queryClient.setQueryData(contabilControlQueryKey(variables.clientId, variables.competence), control);
      await queryClient.invalidateQueries({ queryKey: contabilControlPortfolioQueryKey(variables.competence) });
    },
  });
}

export function useCreateYearContabilControlsMutation(): UseMutationResult<{ competences: string[]; created: number; existing: number }, Error, CreateYearContabilControlsPayload> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) => contabilControlService.createYear(payload),
    onSuccess: async (_result, payload) => {
      await queryClient.invalidateQueries({ queryKey: [...CONTABIL_QUERY_KEY, "controls", "list"] });
      for (const competence of payload.year ? Array.from({ length: 12 }, (_, index) => `${payload.year}-${String(index + 1).padStart(2, "0")}`) : []) {
        queryClient.removeQueries({ queryKey: contabilControlQueryKey(payload.client_id, competence) });
      }
    },
  });
}

export function useArchiveContabilCompetenceMutation(): UseMutationResult<Record<string, number>, Error, ContabilCompetenceOperationPayload> {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: contabilControlService.archiveCompetence, onSuccess: async (_result, payload) => invalidateControlQueries(queryClient, payload.client_id, payload.competence) });
}

export function useRestoreContabilCompetenceMutation(): UseMutationResult<Record<string, number>, Error, ContabilCompetenceOperationPayload> {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: contabilControlService.restoreCompetence, onSuccess: async (_result, payload) => invalidateControlQueries(queryClient, payload.client_id, payload.competence) });
}

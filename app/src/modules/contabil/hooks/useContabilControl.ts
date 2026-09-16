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
  CreateOrGetContabilControlPayload,
  PatchContabilControlFieldPayload,
} from "../types";
import { contabilControlPortfolioQueryKey, contabilControlQueryKey } from "./queryKeys";

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

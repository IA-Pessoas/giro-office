import {
  useMutation,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import { useFetch } from "@shared/hooks";
import { triageDocumentsService } from "../services";
import type {
  ContabilCompetence,
  TriageBankStatement,
  TriageDocumentsMonthly,
} from "../types";
import { triageMonthlyQueryKey, triageStatementsQueryKey } from "./queryKeys";

export function useTriageMonthly(
  clientId: string,
  competence: ContabilCompetence,
): UseQueryResult<TriageDocumentsMonthly | null, Error> {
  return useFetch(
    triageMonthlyQueryKey(clientId, competence),
    () => triageDocumentsService.getMonthly({ clientId, competence }),
    { enabled: Boolean(clientId) },
  );
}

export function useTriageStatements(
  clientId: string,
  competence: ContabilCompetence,
): UseQueryResult<TriageBankStatement[], Error> {
  return useFetch(
    triageStatementsQueryKey(clientId, competence),
    () => triageDocumentsService.getStatements({ clientId, competence }),
    { enabled: Boolean(clientId) },
  );
}

export function useTriageMutations(
  clientId: string,
  competence: ContabilCompetence,
) {
  const queryClient = useQueryClient();
  const refresh = async () =>
    queryClient.invalidateQueries({
      queryKey: triageMonthlyQueryKey(clientId, competence),
    });
  return {
    create: useMutation({
      mutationFn: () =>
        triageDocumentsService.createMonthly({ clientId, competence }),
      onSuccess: refresh,
    }),
    item: useMutation({
      mutationFn: ({
        id,
        field,
        status,
      }: {
        id: string;
        field: string;
        status: Parameters<typeof triageDocumentsService.updateItem>[2];
      }) => triageDocumentsService.updateItem(id, field, status),
      onSuccess: refresh,
    }),
    all: useMutation({
      mutationFn: ({
        id,
        status,
      }: {
        id: string;
        status: Parameters<typeof triageDocumentsService.updateAll>[1];
      }) => triageDocumentsService.updateAll(id, status),
      onSuccess: refresh,
    }),
    statement: useMutation({
      mutationFn: triageDocumentsService.updateStatement,
      onSuccess: async () => {
        await refresh();
        await queryClient.invalidateQueries({
          queryKey: triageStatementsQueryKey(clientId, competence),
        });
      },
    }),
  };
}

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
  TriageClosing,
  TriageClosingStatus,
  TriageDocumentItemNotes,
  TriageDocumentField,
  TriageDocumentsMonthly,
} from "../types";
import {
  triageClosingQueryKey,
  triageMonthlyQueryKey,
  triageStatementsQueryKey,
} from "./queryKeys";

export function useTriageClosing(
  clientId: string,
  competence: ContabilCompetence,
): UseQueryResult<TriageClosing, Error> {
  return useFetch(
    triageClosingQueryKey(clientId, competence),
    () => triageDocumentsService.getClosing({ clientId, competence }),
    { enabled: Boolean(clientId) },
  );
}

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

export function useTriageEditability(clientId: string): UseQueryResult<{ can_edit: boolean }, Error> {
  return useFetch(
    ["triagem", "editability", clientId],
    () => triageDocumentsService.getEditability(clientId),
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
        note,
        justification,
      }: {
        id: string;
        field: TriageDocumentField;
        status: Parameters<typeof triageDocumentsService.updateItem>[2];
        note?: string | null;
        justification?: string | null;
      }) => {
        const itemNotes =
          note === undefined && justification === undefined
            ? undefined
            : ({
                note: note ?? null,
                justification: justification ?? null,
              } satisfies TriageDocumentItemNotes);
        return triageDocumentsService.updateItem(id, field, status, itemNotes);
      },
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
    closing: useMutation({
      mutationFn: ({ status }: { status: TriageClosingStatus }) =>
        triageDocumentsService.updateClosing({ clientId, competence, status }),
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: triageClosingQueryKey(clientId, competence),
        });
        await queryClient.invalidateQueries({
          queryKey: ["contabil", "controls", "list", competence],
        });
      },
    }),
  };
}
